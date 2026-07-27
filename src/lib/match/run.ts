import { SQL_NOW, SQL_NOW_PLUS } from '@/db/sql'
import { ensureDb, nowIso } from '@/db'
import { isLocale, type Locale } from '@/lib/i18n'
import { getTendersByIds, searchTenders, type TenderRow } from '@/lib/queries/tenders'
import { daysUntil } from '@/lib/tuneps/dates'
import {
  createNotification,
  sendEmail,
  sendTelegram,
  sendWebPush,
  type Channel,
} from '@/lib/notify/channels'
import { deadlineEmail, matchEmail, matchTelegram } from '@/lib/notify/templates'
import {
  activeWatchlists,
  evaluateWatchlist,
  markNotified,
  parseJsonArray,
  pendingMatches,
  persistMatches,
  type MatchReason,
  type ScoredMatch,
  type WatchlistRecord,
} from './engine'

function parseReasons(raw: string): MatchReason[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as MatchReason[]) : []
  } catch {
    return []
  }
}

/**
 * The alerting pipeline: evaluate → persist → notify.
 *
 * Called by the sync CLI after each ingest pass (instant cadence) and by the
 * worker on a schedule (daily/weekly digests, deadline reminders).
 */

export interface MatchingSummary {
  watchlists: number
  matches: number
  notifications: number
  deliveries: number
}

interface Recipient {
  user_id: string
  email: string
  full_name: string
  locale: Locale
  telegram_chat_id: string | null
}

/** Everyone in the watchlist's org gets the alert — this is a team product. */
function recipients(orgId: string): Recipient[] {
  return ensureDb()
    .prepare<[string], Omit<Recipient, 'locale'> & { locale: string }>(
      `SELECT u.id AS user_id, u.email, u.full_name, u.locale, u.telegram_chat_id
         FROM org_members m JOIN users u ON u.id = m.user_id
        WHERE m.org_id = ?`,
    )
    .all(orgId)
    .map((r) => ({ ...r, locale: isLocale(r.locale) ? r.locale : 'fr' }))
}

async function deliver(
  w: WatchlistRecord,
  matches: ScoredMatch[],
  log: (m: string) => void,
): Promise<{ notifications: number; deliveries: number }> {
  if (!matches.length) return { notifications: 0, deliveries: 0 }

  const channels = new Set(parseJsonArray(w.channels) as Channel[])
  const people = recipients(w.org_id)
  let notifications = 0
  let deliveries = 0

  for (const person of people) {
    const payload = {
      locale: person.locale,
      watchlistName: w.name,
      watchlistId: w.id,
      matches: matches.map((m) => ({ tender: m.tender, score: m.score })),
      cadence: w.cadence,
    }

    if (channels.has('inapp')) {
      const first = matches[0].tender
      createNotification({
        userId: person.user_id,
        kind: 'match',
        title:
          matches.length > 1
            ? `${matches.length} nouveaux avis — ${w.name}`
            : `Nouvel avis — ${w.name}`,
        body: first.title_fr || first.title_ar,
        url: matches.length > 1 ? `/app/watchlists/${w.id}` : `/app/tenders/${first.id}`,
        meta: { watchlistId: w.id, count: matches.length, topScore: matches[0].score },
      })
      notifications++
    }

    if (channels.has('email')) {
      const { subject, html, text } = matchEmail(payload)
      const r = await sendEmail(person.user_id, person.email, subject, html, text)
      if (r.status === 'sent') deliveries++
      else if (r.status === 'failed') log(`email → ${person.email} failed: ${r.error}`)
    }

    if (channels.has('webpush')) {
      const r = await sendWebPush(person.user_id, {
        title: `${matches.length} avis — ${w.name}`,
        body: matches[0].tender.title_fr || matches[0].tender.title_ar,
        url: `/app/watchlists/${w.id}`,
        tag: `wl-${w.id}`,
      })
      if (r.status === 'sent') deliveries++
    }

    if (channels.has('telegram') && person.telegram_chat_id) {
      const r = await sendTelegram(person.user_id, person.telegram_chat_id, matchTelegram(payload))
      if (r.status === 'sent') deliveries++
    }
  }

  markNotified(
    w.id,
    matches.map((m) => m.tender.id),
  )
  return { notifications, deliveries }
}

/**
 * Instant path. `touchedIds` are the notices ingestion just created or changed;
 * scoping to them is what keeps a run cheap even with a 300k-row corpus.
 */
export async function runMatching(
  touchedIds: string[],
  log: (m: string) => void = () => {},
): Promise<MatchingSummary> {
  const summary: MatchingSummary = { watchlists: 0, matches: 0, notifications: 0, deliveries: 0 }
  if (!touchedIds.length) return summary

  for (const w of activeWatchlists()) {
    summary.watchlists++
    const scored = evaluateWatchlist(w, touchedIds)
    if (!scored.length) continue

    const fresh = persistMatches(w, scored)
    summary.matches += fresh.length
    if (!fresh.length) continue

    log(`${w.name}: ${fresh.length} new match(es)`)

    // Only the instant cadence delivers here. Digests leave the matches
    // pending and let the worker batch them.
    if (w.cadence === 'instant') {
      const d = await deliver(w, fresh, log)
      summary.notifications += d.notifications
      summary.deliveries += d.deliveries
    }
  }

  return summary
}

/** Re-evaluate one watchlist against the whole corpus ("test now"). */
export function backfillWatchlist(w: WatchlistRecord, limit = 500): ScoredMatch[] {
  const scored = evaluateWatchlist(w, undefined, { limit })
  persistMatches(w, scored)
  return scored
}

// --- digests ---------------------------------------------------------------

const DAY_MS = 86_400_000

function digestDue(w: WatchlistRecord, now: number): boolean {
  if (w.cadence === 'instant' || w.cadence === 'off') return false
  const window = w.cadence === 'daily' ? DAY_MS : 7 * DAY_MS
  if (!w.last_digest_at) return true
  const last = Date.parse(w.last_digest_at)
  return !Number.isFinite(last) || now - last >= window - 30 * 60_000
}

/**
 * Send queued matches for daily/weekly watchlists. Idempotent: a match is
 * cleared from the queue only once delivery is recorded, and `last_digest_at`
 * gates re-entry inside the cadence window.
 */
export async function runDigests(log: (m: string) => void = () => {}): Promise<MatchingSummary> {
  const summary: MatchingSummary = { watchlists: 0, matches: 0, notifications: 0, deliveries: 0 }
  const now = Date.now()
  const d = ensureDb()

  for (const w of activeWatchlists()) {
    if (!digestDue(w, now)) continue
    summary.watchlists++

    const pending = pendingMatches(w.id, 60)
    if (!pending.length) {
      d.prepare('UPDATE watchlists SET last_digest_at = ? WHERE id = ?').run(nowIso(), w.id)
      continue
    }

    const tenders = getTendersByIds(pending.map((p) => p.tender_id))
    const byId = new Map(tenders.map((t) => [t.id, t]))
    const matches: ScoredMatch[] = pending
      .map<ScoredMatch | null>((p) => {
        const tender = byId.get(p.tender_id)
        if (!tender) return null
        // Reasons were computed and stored when the match was recorded.
        return { tender, score: p.score, reasons: parseReasons(p.reasons) }
      })
      .filter((m): m is ScoredMatch => m !== null)

    if (!matches.length) continue

    const res = await deliver(w, matches, log)
    summary.matches += matches.length
    summary.notifications += res.notifications
    summary.deliveries += res.deliveries

    d.prepare('UPDATE watchlists SET last_digest_at = ? WHERE id = ?').run(nowIso(), w.id)
    log(`digest ${w.name}: ${matches.length} avis`)
  }

  return summary
}

// --- deadline reminders ----------------------------------------------------

/**
 * Nudge on pipeline items whose deadline is inside `days`. Fires once per item
 * per threshold, tracked in `kv` so a nightly worker is safe to re-run.
 */
export async function runDeadlineReminders(
  days = 3,
  log: (m: string) => void = () => {},
): Promise<number> {
  const d = ensureDb()
  const rows = d
    .prepare<[string], { org_id: string; tender_id: string }>(
      `SELECT p.org_id, p.tender_id
         FROM pipeline_items p JOIN tenders t ON t.id = p.tender_id
        WHERE p.stage IN ('watching','qualifying','preparing')
          AND t.deadline_at > ${SQL_NOW}
          AND t.deadline_at <= ${SQL_NOW_PLUS("?")}`,
    )
    .all(`+${days} days`)

  if (!rows.length) return 0

  const byOrg = new Map<string, string[]>()
  for (const r of rows) {
    const key = `remind:${r.org_id}:${r.tender_id}:${days}`
    const already = d.prepare<[string], { value: string }>('SELECT value FROM kv WHERE key = ?').get(key)
    if (already) continue
    d.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)').run(
      key,
      '1',
      nowIso(),
    )
    const list = byOrg.get(r.org_id) ?? []
    list.push(r.tender_id)
    byOrg.set(r.org_id, list)
  }

  let sent = 0
  for (const [orgId, tenderIds] of byOrg) {
    const tenders = getTendersByIds(tenderIds)
    if (!tenders.length) continue

    const items = tenders.map((tender) => ({ tender, days: daysUntil(tender.deadline_at) ?? days }))

    for (const person of recipients(orgId)) {
      createNotification({
        userId: person.user_id,
        kind: 'deadline',
        title:
          items.length > 1
            ? `${items.length} échéances dans moins de ${days} jours`
            : `Échéance dans ${items[0].days} j : ${items[0].tender.title_fr}`,
        body: items.map((i) => i.tender.title_fr).slice(0, 3).join(' · '),
        url: '/app/pipeline',
        meta: { days, count: items.length },
      })

      const { subject, html, text } = deadlineEmail({ locale: person.locale, items })
      const r = await sendEmail(person.user_id, person.email, subject, html, text)
      if (r.status === 'sent') sent++
      if (person.telegram_chat_id) {
        await sendTelegram(
          person.user_id,
          person.telegram_chat_id,
          `⏳ <b>${items.length}</b> échéance(s) sous ${days} j\n` +
            items.map((i) => `• ${i.tender.title_fr.slice(0, 100)} — ${i.days} j`).join('\n'),
        )
      }
    }
    log(`deadline reminders: org ${orgId}, ${items.length} item(s)`)
  }

  return sent
}

/** Notices published in the last `hours` — powers the "new since" indicator. */
export function recentlyPublished(hours = 24): TenderRow[] {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  return searchTenders({ publishedSince: since, sort: 'newest', limit: 200 }).rows
}
