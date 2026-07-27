import { SQL_NOW } from '@/db/sql'
import { ensureDb } from '@/db'
import { fold, toFtsQuery } from '@/lib/text/normalize'
import type { SourceKind } from '@/lib/tuneps/ingest'

/**
 * One query builder for every read path — the feed, watchlist matching, CSV
 * export, the ICS feed and the public API. Sharing it is what guarantees that
 * "save this search as a watchlist" alerts on exactly what you were looking at.
 */

export interface TenderFilters {
  q?: string
  sources?: SourceKind[]
  domainCodes?: string[]
  categoryCodes?: string[]
  govCodes?: string[]
  procedureCodes?: string[]
  buyerCodes?: string[]
  /** 'open' excludes past deadlines; 'closing' is the ≤72h window. */
  status?: 'all' | 'open' | 'closing' | 'closed'
  publishedSince?: string
  publishedUntil?: string
  deadlineBefore?: string
  deadlineAfter?: string
  /** Minimum days between now and the deadline — "can we even prepare a bid?" */
  minLeadDays?: number
  onlineOnly?: boolean
  internationalOnly?: boolean
  frameworkOnly?: boolean
  /** Free-text terms that disqualify a notice outright. */
  excludeKeywords?: string[]
  ids?: string[]
  sort?: TenderSort
  limit?: number
  offset?: number
}

export type TenderSort = 'newest' | 'deadline' | 'relevance' | 'buyer' | 'published_asc'

export interface TenderRow {
  id: string
  source: SourceKind
  source_id: number
  reference: string
  mod_seq: string
  buyer_ref: string | null
  title_fr: string
  title_ar: string
  title_en: string
  buyer_code: string | null
  buyer_name: string
  domain_code: string | null
  domain_label_fr: string | null
  domain_label_ar: string | null
  category_code: string | null
  category_label_fr: string | null
  category_label_ar: string | null
  procedure_code: string | null
  procedure_label_fr: string | null
  procedure_label_ar: string | null
  gov_code: string | null
  gov_label_fr: string | null
  gov_label_ar: string | null
  place_detail: string | null
  is_online: number
  is_international: number
  is_framework: number
  allows_consortium: number
  doc_price: number | null
  doc_currency: string | null
  validity_days: number | null
  published_at: string | null
  receipt_start_at: string | null
  deadline_at: string | null
  bid_open_at: string | null
  detail_fetched_at: string | null
  search_blob: string
}

export interface TenderDetailRow extends TenderRow {
  guarantee_label_fr: string | null
  eval_label_fr: string | null
  price_type_label_fr: string | null
  financing_label_fr: string | null
  contact_name: string | null
  department: string | null
  address: string | null
  first_seen_at: string
  last_seen_at: string
  raw_json: string | null
}

const SELECT_COLUMNS = `
  t.id, t.source, t.source_id, t.reference, t.mod_seq, t.buyer_ref,
  t.title_fr, t.title_ar, t.title_en,
  t.buyer_code, t.buyer_name,
  t.domain_code, t.domain_label_fr, t.domain_label_ar,
  t.category_code, t.category_label_fr, t.category_label_ar,
  t.procedure_code, t.procedure_label_fr, t.procedure_label_ar,
  t.gov_code, t.gov_label_fr, t.gov_label_ar, t.place_detail,
  t.is_online, t.is_international, t.is_framework, t.allows_consortium,
  t.doc_price, t.doc_currency, t.validity_days,
  t.published_at, t.receipt_start_at, t.deadline_at, t.bid_open_at,
  t.detail_fetched_at, t.search_blob`

interface Built {
  where: string
  joins: string
  params: unknown[]
  ftsQuery: string | null
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ')
}

function build(f: TenderFilters, nowIso: string): Built {
  const where: string[] = ['t.is_real = 1']
  const params: unknown[] = []
  let joins = ''

  const ftsQuery = f.q ? toFtsQuery(f.q) : null
  if (ftsQuery) {
    joins += ' JOIN tenders_fts fts ON fts.rowid = t.rowid'
    where.push('tenders_fts MATCH ?')
    params.push(ftsQuery)
  }

  const inList = (col: string, values?: string[]) => {
    const vals = values?.filter(Boolean) ?? []
    if (!vals.length) return
    where.push(`${col} IN (${placeholders(vals.length)})`)
    params.push(...vals)
  }

  inList('t.source', f.sources)
  inList('t.domain_code', f.domainCodes)
  inList('t.category_code', f.categoryCodes)
  inList('t.gov_code', f.govCodes)
  inList('t.procedure_code', f.procedureCodes)
  inList('t.buyer_code', f.buyerCodes)
  inList('t.id', f.ids)

  switch (f.status) {
    case 'open':
      where.push('t.deadline_at > ?')
      params.push(nowIso)
      break
    case 'closing':
      where.push('t.deadline_at > ? AND t.deadline_at <= ?')
      params.push(nowIso, new Date(Date.parse(nowIso) + 72 * 3_600_000).toISOString())
      break
    case 'closed':
      where.push('(t.deadline_at IS NULL OR t.deadline_at <= ?)')
      params.push(nowIso)
      break
    default:
      break
  }

  if (f.publishedSince) {
    where.push('t.published_at >= ?')
    params.push(f.publishedSince)
  }
  if (f.publishedUntil) {
    where.push('t.published_at <= ?')
    params.push(f.publishedUntil)
  }
  if (f.deadlineBefore) {
    where.push('t.deadline_at <= ?')
    params.push(f.deadlineBefore)
  }
  if (f.deadlineAfter) {
    where.push('t.deadline_at >= ?')
    params.push(f.deadlineAfter)
  }
  if (f.minLeadDays && f.minLeadDays > 0) {
    where.push('t.deadline_at >= ?')
    params.push(new Date(Date.parse(nowIso) + f.minLeadDays * 86_400_000).toISOString())
  }
  if (f.onlineOnly) where.push('t.is_online = 1')
  if (f.internationalOnly) where.push('t.is_international = 1')
  if (f.frameworkOnly) where.push('t.is_framework = 1')

  // Exclusions run against the folded blob so they behave like the keywords.
  for (const raw of f.excludeKeywords ?? []) {
    const folded = fold(raw)
    if (folded.length < 2) continue
    where.push('t.search_blob NOT LIKE ?')
    params.push(`%${folded}%`)
  }

  return { where: where.join(' AND '), joins, params, ftsQuery }
}

function orderBy(sort: TenderSort | undefined, hasFts: boolean): string {
  switch (sort) {
    case 'deadline':
      // Nulls last, past deadlines last: what's actionable comes first.
      return `CASE WHEN t.deadline_at IS NULL THEN 2
                   WHEN t.deadline_at <= ${SQL_NOW} THEN 1 ELSE 0 END ASC,
              t.deadline_at ASC`
    case 'buyer':
      return 't.buyer_name COLLATE NOCASE ASC, t.published_at DESC'
    case 'published_asc':
      return 't.published_at ASC'
    case 'relevance':
      return hasFts ? 'bm25(tenders_fts, 10.0, 4.0, 2.0) ASC, t.published_at DESC' : 't.published_at DESC'
    case 'newest':
    default:
      return 't.published_at DESC, t.rowid DESC'
  }
}

export interface SearchResult {
  rows: TenderRow[]
  total: number
}

export function searchTenders(filters: TenderFilters = {}): SearchResult {
  const d = ensureDb()
  const now = new Date().toISOString()
  const { where, joins, params, ftsQuery } = build(filters, now)

  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 500)
  const offset = Math.max(filters.offset ?? 0, 0)

  const total = d
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tenders t${joins} WHERE ${where}`,
    )
    .get(...params)!.n

  const rows = d
    .prepare<unknown[], TenderRow>(
      `SELECT ${SELECT_COLUMNS} FROM tenders t${joins}
        WHERE ${where}
        ORDER BY ${orderBy(filters.sort, Boolean(ftsQuery))}
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset)

  return { rows, total }
}

/** Ids only — the matcher does not need the payload. */
export function searchTenderIds(filters: TenderFilters = {}): string[] {
  const d = ensureDb()
  const now = new Date().toISOString()
  const { where, joins, params } = build(filters, now)
  const limit = Math.min(Math.max(filters.limit ?? 2000, 1), 20_000)

  return d
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM tenders t${joins} WHERE ${where}
        ORDER BY t.published_at DESC LIMIT ?`,
    )
    .all(...params, limit)
    .map((r) => r.id)
}

export function countTenders(filters: TenderFilters = {}): number {
  const d = ensureDb()
  const now = new Date().toISOString()
  const { where, joins, params } = build(filters, now)
  return d
    .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tenders t${joins} WHERE ${where}`)
    .get(...params)!.n
}

export function getTender(id: string): TenderDetailRow | null {
  return (
    ensureDb()
      .prepare<[string], TenderDetailRow>(
        `SELECT ${SELECT_COLUMNS},
                t.guarantee_label_fr, t.eval_label_fr, t.price_type_label_fr,
                t.financing_label_fr, t.contact_name, t.department, t.address,
                t.first_seen_at, t.last_seen_at, t.raw_json
           FROM tenders t WHERE t.id = ?`,
      )
      .get(id) ?? null
  )
}

export function getTendersByIds(ids: string[]): TenderRow[] {
  if (!ids.length) return []
  const chunks: TenderRow[] = []
  const d = ensureDb()
  for (let i = 0; i < ids.length; i += 400) {
    const slice = ids.slice(i, i + 400)
    chunks.push(
      ...d
        .prepare<unknown[], TenderRow>(
          `SELECT ${SELECT_COLUMNS} FROM tenders t WHERE t.id IN (${placeholders(slice.length)})`,
        )
        .all(...slice),
    )
  }
  // Preserve caller order.
  const index = new Map(chunks.map((r) => [r.id, r]))
  return ids.map((id) => index.get(id)).filter((r): r is TenderRow => Boolean(r))
}

export interface TenderRevision {
  kind: string
  before_json: string | null
  after_json: string | null
  detected_at: string
}

export function tenderRevisions(id: string, limit = 12): TenderRevision[] {
  return ensureDb()
    .prepare<[string, number], TenderRevision>(
      `SELECT kind, before_json, after_json, detected_at
         FROM tender_revisions WHERE tender_id = ?
        ORDER BY detected_at DESC LIMIT ?`,
    )
    .all(id, limit)
}

/** Similar notices: same sector or buyer, used on the detail page. */
export function relatedTenders(t: TenderRow, limit = 6): TenderRow[] {
  return ensureDb()
    .prepare<unknown[], TenderRow>(
      `SELECT ${SELECT_COLUMNS} FROM tenders t
        WHERE t.id <> ? AND t.is_real = 1
          AND (t.buyer_code = ? OR t.category_code = ?)
        ORDER BY CASE WHEN t.buyer_code = ? THEN 0 ELSE 1 END,
                 t.published_at DESC
        LIMIT ?`,
    )
    .all(t.id, t.buyer_code, t.category_code, t.buyer_code, limit)
}
