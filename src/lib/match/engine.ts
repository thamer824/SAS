import { ensureDb, nowIso } from '@/db'
import { fold } from '@/lib/text/normalize'
import { searchTenders, type TenderFilters, type TenderRow } from '@/lib/queries/tenders'
import type { SourceKind } from '@/lib/tuneps/ingest'

/**
 * Watchlist matching and relevance scoring.
 *
 * Two-stage by design:
 *   1. SQL narrows on the *hard* criteria (sector, governorate, buyer, dates).
 *      Cheap, indexed, and it means a watchlist over 300k rows is one query.
 *   2. JS scores what survives. Scoring needs per-keyword weighting and reason
 *      strings for the "why did this match?" panel, which SQL cannot express
 *      without becoming unreadable.
 *
 * The score is not cosmetic: `minScore` is the difference between an alert
 * channel a supplier keeps and one they mute after a week.
 */

export interface WatchCriteria {
  keywords?: string[]
  excludeKeywords?: string[]
  buyerCodes?: string[]
  domainCodes?: string[]
  categoryCodes?: string[]
  govCodes?: string[]
  procedureCodes?: string[]
  sources?: SourceKind[]
  minLeadDays?: number
  onlineOnly?: boolean
  internationalOnly?: boolean
  openOnly?: boolean
  minScore?: number
}

export interface MatchReason {
  code: 'keyword' | 'buyer' | 'domain' | 'category' | 'gov' | 'procedure' | 'recent' | 'leadTime'
  value?: string
  points: number
}

export interface ScoredMatch {
  tender: TenderRow
  score: number
  reasons: MatchReason[]
}

/** Weights. Tuned so that a keyword-in-title alone clears a default minScore of 40. */
const W = {
  keywordTitle: 26,
  keywordBlob: 14,
  keywordExtra: 8, // each additional distinct keyword beyond the first
  buyer: 20,
  category: 16,
  domain: 10,
  gov: 12,
  procedure: 6,
  freshHours: 6, // published in the last 24h
  leadComfort: 8, // ≥ 14 days to prepare
  cap: 100,
} as const

export function parseCriteria(json: string): WatchCriteria {
  try {
    const parsed = JSON.parse(json) as WatchCriteria
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Translate watchlist criteria into feed filters — the shared query language. */
export function criteriaToFilters(c: WatchCriteria, extra: Partial<TenderFilters> = {}): TenderFilters {
  return {
    sources: c.sources?.length ? c.sources : undefined,
    domainCodes: c.domainCodes,
    categoryCodes: c.categoryCodes,
    govCodes: c.govCodes,
    procedureCodes: c.procedureCodes,
    buyerCodes: c.buyerCodes,
    excludeKeywords: c.excludeKeywords,
    minLeadDays: c.minLeadDays,
    onlineOnly: c.onlineOnly,
    internationalOnly: c.internationalOnly,
    status: c.openOnly ? 'open' : 'all',
    // Keywords are scored, not SQL-filtered: we want the OR semantics and the
    // per-keyword reasons, and FTS would silently drop Arabic prefix matches.
    ...extra,
  }
}

/**
 * Score one notice against one watchlist.
 * Returns null when the notice fails a hard requirement.
 */
export function scoreTender(tender: TenderRow, c: WatchCriteria): ScoredMatch | null {
  const reasons: MatchReason[] = []
  const blob = tender.search_blob
  const titleBlob = fold(`${tender.title_fr} ${tender.title_ar} ${tender.title_en}`)

  // Hard exclusion first — cheapest way to fail.
  for (const raw of c.excludeKeywords ?? []) {
    const needle = fold(raw)
    if (needle.length >= 2 && blob.includes(needle)) return null
  }

  const keywords = (c.keywords ?? []).map((k) => fold(k)).filter((k) => k.length >= 2)

  let score = 0

  if (keywords.length) {
    const hits: string[] = []
    let best = 0

    for (const kw of keywords) {
      const inTitle = titleBlob.includes(kw)
      const inBlob = blob.includes(kw)
      if (!inTitle && !inBlob) continue
      hits.push(kw)
      best = Math.max(best, inTitle ? W.keywordTitle : W.keywordBlob)
      reasons.push({
        code: 'keyword',
        value: kw,
        points: inTitle ? W.keywordTitle : W.keywordBlob,
      })
    }

    // A watchlist with keywords requires at least one to hit. Otherwise a
    // sector-wide alert would drown the user in everything in that sector.
    if (!hits.length) return null

    score += best + Math.min(hits.length - 1, 3) * W.keywordExtra
  }

  if (c.buyerCodes?.length && tender.buyer_code && c.buyerCodes.includes(tender.buyer_code)) {
    score += W.buyer
    reasons.push({ code: 'buyer', value: tender.buyer_name, points: W.buyer })
  }
  if (c.categoryCodes?.length && tender.category_code && c.categoryCodes.includes(tender.category_code)) {
    score += W.category
    reasons.push({ code: 'category', value: tender.category_label_fr ?? undefined, points: W.category })
  }
  if (c.domainCodes?.length && tender.domain_code && c.domainCodes.includes(tender.domain_code)) {
    score += W.domain
    reasons.push({ code: 'domain', value: tender.domain_label_fr ?? undefined, points: W.domain })
  }
  if (c.govCodes?.length && tender.gov_code && c.govCodes.includes(tender.gov_code)) {
    score += W.gov
    reasons.push({ code: 'gov', value: tender.gov_label_fr ?? undefined, points: W.gov })
  }
  if (c.procedureCodes?.length && tender.procedure_code && c.procedureCodes.includes(tender.procedure_code)) {
    score += W.procedure
    reasons.push({ code: 'procedure', points: W.procedure })
  }

  // A watchlist with no keywords and no structural criteria matches nothing:
  // an empty watchlist should be silent, not a firehose.
  if (!keywords.length && !reasons.length) return null

  const now = Date.now()
  if (tender.published_at) {
    const age = now - Date.parse(tender.published_at)
    if (Number.isFinite(age) && age >= 0 && age <= 86_400_000) {
      score += W.freshHours
      reasons.push({ code: 'recent', points: W.freshHours })
    }
  }
  if (tender.deadline_at) {
    const lead = Date.parse(tender.deadline_at) - now
    if (Number.isFinite(lead) && lead >= 14 * 86_400_000) {
      score += W.leadComfort
      reasons.push({ code: 'leadTime', points: W.leadComfort })
    }
  }

  const final = Math.min(Math.round(score), W.cap)
  const floor = c.minScore ?? 0
  if (final < floor) return null

  reasons.sort((a, b) => b.points - a.points)
  return { tender, score: final, reasons }
}

// --- persistence -----------------------------------------------------------

export interface WatchlistRecord {
  id: string
  org_id: string
  created_by: string
  name: string
  criteria: string
  cadence: 'instant' | 'daily' | 'weekly' | 'off'
  channels: string
  is_active: number
  match_count: number
  last_matched_at: string | null
  last_digest_at: string | null
  created_at: string
  updated_at: string
}

export function getWatchlist(id: string): WatchlistRecord | null {
  return (
    ensureDb().prepare<[string], WatchlistRecord>('SELECT * FROM watchlists WHERE id = ?').get(id) ??
    null
  )
}

export function activeWatchlists(): WatchlistRecord[] {
  return ensureDb()
    .prepare<[], WatchlistRecord>('SELECT * FROM watchlists WHERE is_active = 1')
    .all()
}

export function orgWatchlists(orgId: string): WatchlistRecord[] {
  return ensureDb()
    .prepare<[string], WatchlistRecord>(
      'SELECT * FROM watchlists WHERE org_id = ? ORDER BY created_at DESC',
    )
    .all(orgId)
}

/**
 * Evaluate a watchlist. `candidateIds` restricts the pass to what ingestion
 * just touched (the hot path, a handful of rows); omit it to re-evaluate
 * history, which is what the "test now" button does.
 */
export function evaluateWatchlist(
  w: WatchlistRecord,
  candidateIds?: string[],
  opts: { limit?: number } = {},
): ScoredMatch[] {
  const c = parseCriteria(w.criteria)
  if (candidateIds && candidateIds.length === 0) return []

  const filters = criteriaToFilters(c, {
    ids: candidateIds,
    limit: opts.limit ?? (candidateIds ? Math.min(candidateIds.length, 2000) : 400),
    sort: 'newest',
  })

  const { rows } = searchTenders(filters)
  const out: ScoredMatch[] = []
  for (const row of rows) {
    const scored = scoreTender(row, c)
    if (scored) out.push(scored)
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

export interface PersistedMatches {
  watchlist: WatchlistRecord
  fresh: ScoredMatch[]
}

/**
 * Record matches, returning only the ones not seen before. That de-duplication
 * is what stops a notice from re-alerting every time ingestion re-touches it
 * (e.g. after detail enrichment rewrites its row).
 */
export function persistMatches(w: WatchlistRecord, matches: ScoredMatch[]): ScoredMatch[] {
  if (!matches.length) return []
  const d = ensureDb()
  const ts = nowIso()

  const insert = d.prepare(
    `INSERT INTO watchlist_matches (watchlist_id, tender_id, score, reasons, matched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(watchlist_id, tender_id) DO UPDATE SET
       score = excluded.score, reasons = excluded.reasons`,
  )

  const fresh: ScoredMatch[] = []

  d.transaction(() => {
    for (const m of matches) {
      const info = insert.run(w.id, m.tender.id, m.score, JSON.stringify(m.reasons), ts)
      // `changes === 1` on a real insert; the upsert branch also reports 1, so
      // distinguish via lastInsertRowid movement is unreliable on a composite
      // PK table. Check explicitly instead.
      if (info.changes > 0) fresh.push(m)
    }
  })()

  // Keep only genuinely new rows: filter against notified_at being null AND
  // matched_at equal to this run's timestamp.
  const ids = fresh.map((m) => m.tender.id)
  if (!ids.length) return []

  const reallyNew = new Set(
    d
      .prepare<unknown[], { tender_id: string }>(
        `SELECT tender_id FROM watchlist_matches
          WHERE watchlist_id = ? AND notified_at IS NULL AND matched_at = ?
            AND tender_id IN (${ids.map(() => '?').join(', ')})`,
      )
      .all(w.id, ts, ...ids)
      .map((r) => r.tender_id),
  )

  const result = fresh.filter((m) => reallyNew.has(m.tender.id))

  d.prepare(
    `UPDATE watchlists SET
       match_count = (SELECT COUNT(*) FROM watchlist_matches WHERE watchlist_id = ?),
       last_matched_at = CASE WHEN ? > 0 THEN ? ELSE last_matched_at END,
       updated_at = ?
     WHERE id = ?`,
  ).run(w.id, result.length, ts, ts, w.id)

  return result
}

export function markNotified(watchlistId: string, tenderIds: string[]): void {
  if (!tenderIds.length) return
  const d = ensureDb()
  const stmt = d.prepare(
    'UPDATE watchlist_matches SET notified_at = ? WHERE watchlist_id = ? AND tender_id = ?',
  )
  const ts = nowIso()
  d.transaction(() => {
    for (const id of tenderIds) stmt.run(ts, watchlistId, id)
  })()
}

export interface PendingDigestRow {
  watchlist_id: string
  tender_id: string
  score: number
  reasons: string
  matched_at: string
}

/** Matches recorded but never delivered — the digest queue. */
export function pendingMatches(watchlistId: string, limit = 50): PendingDigestRow[] {
  return ensureDb()
    .prepare<[string, number], PendingDigestRow>(
      `SELECT watchlist_id, tender_id, score, reasons, matched_at
         FROM watchlist_matches
        WHERE watchlist_id = ? AND notified_at IS NULL
        ORDER BY score DESC, matched_at DESC
        LIMIT ?`,
    )
    .all(watchlistId, limit)
}

export interface WatchlistMatchView {
  tender_id: string
  score: number
  reasons: string
  matched_at: string
  notified_at: string | null
}

export function watchlistMatches(watchlistId: string, limit = 50, offset = 0): WatchlistMatchView[] {
  return ensureDb()
    .prepare<[string, number, number], WatchlistMatchView>(
      `SELECT tender_id, score, reasons, matched_at, notified_at
         FROM watchlist_matches WHERE watchlist_id = ?
        ORDER BY matched_at DESC, score DESC LIMIT ? OFFSET ?`,
    )
    .all(watchlistId, limit, offset)
}

// --- company fit score -----------------------------------------------------

/**
 * "Should we bid?" heuristic, independent of any watchlist: how well does this
 * notice line up with the capabilities the org declared in its profile?
 * Shown on every card so a user with no watchlists still gets signal.
 */
export function fitScore(
  tender: Pick<TenderRow, 'search_blob' | 'domain_code' | 'gov_code' | 'deadline_at'>,
  org: { capabilities: string[]; domainCodes: string[]; govCode: string | null },
): { score: number; band: 'strong' | 'medium' | 'weak' } | null {
  if (!org.capabilities.length && !org.domainCodes.length) return null

  let score = 0
  const blob = tender.search_blob

  const hits = org.capabilities.map((c) => fold(c)).filter((c) => c.length >= 2 && blob.includes(c))
  if (hits.length) score += Math.min(55, 30 + (hits.length - 1) * 12)

  if (org.domainCodes.length && tender.domain_code && org.domainCodes.includes(tender.domain_code)) {
    score += 22
  }
  if (org.govCode && tender.gov_code === org.govCode) score += 13

  if (tender.deadline_at) {
    const lead = Date.parse(tender.deadline_at) - Date.now()
    if (lead >= 10 * 86_400_000) score += 10
  }

  const final = Math.min(100, score)
  if (final < 20) return null
  return { score: final, band: final >= 65 ? 'strong' : final >= 40 ? 'medium' : 'weak' }
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
