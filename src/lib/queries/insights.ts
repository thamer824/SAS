import { SQL_NOW, SQL_NOW_PLUS } from '@/db/sql'
import { ensureDb } from '@/db'

/**
 * Market intelligence.
 *
 * These are the questions a supplier cannot answer by reading notices one at a
 * time on TUNEPS — which is exactly why aggregating 28k+ of them is worth doing.
 * Every query is bounded by an explicit window and hits an existing index.
 */

export type Window = 30 | 90 | 365 | 0 // 0 = all history

function sinceClause(window: Window): { clause: string; args: unknown[] } {
  if (!window) return { clause: '', args: [] }
  const since = new Date(Date.now() - window * 86_400_000).toISOString()
  return { clause: ' AND published_at >= ?', args: [since] }
}

export interface Headline {
  total: number
  openNow: number
  closingWeek: number
  activeBuyers: number
  perDay: number
  aoShare: number
}

export function headline(window: Window): Headline {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)

  const row = d
    .prepare<unknown[], { total: number; ao: number; buyers: number; span: number | null }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN source = 'ao' THEN 1 ELSE 0 END) AS ao,
              COUNT(DISTINCT buyer_code) AS buyers,
              CAST(julianday(MAX(published_at)) - julianday(MIN(published_at)) AS REAL) AS span
         FROM tenders WHERE is_real = 1${clause}`,
    )
    .get(...args)!

  const openNow = d
    .prepare<[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tenders
        WHERE is_real = 1 AND deadline_at > ${SQL_NOW}`,
    )
    .get()!.n

  const closingWeek = d
    .prepare<[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tenders
        WHERE is_real = 1 AND deadline_at > ${SQL_NOW}
          AND deadline_at <= ${SQL_NOW_PLUS("'+7 days'")}`,
    )
    .get()!.n

  const days = Math.max(1, row.span ?? 1)

  return {
    total: row.total,
    openNow,
    closingWeek,
    activeBuyers: row.buyers,
    perDay: Math.round((row.total / days) * 10) / 10,
    aoShare: row.total ? Math.round(((row.ao ?? 0) / row.total) * 100) : 0,
  }
}

export interface WeeklyPoint {
  weekStart: string
  count: number
}

/**
 * Publication volume by ISO week.
 *
 * SQLite has no ISO-week function, so weeks are bucketed to the preceding
 * Monday: `date(published_at, 'weekday 1', '-7 days')` lands on Monday for
 * every day of the week including Monday itself.
 */
export function weeklyVolume(window: Window, limit = 26): WeeklyPoint[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)

  return d
    .prepare<unknown[], WeeklyPoint>(
      `SELECT date(published_at, 'weekday 1', '-7 days') AS weekStart, COUNT(*) AS count
         FROM tenders
        WHERE is_real = 1 AND published_at IS NOT NULL${clause}
        GROUP BY weekStart
        ORDER BY weekStart DESC
        LIMIT ?`,
    )
    .all(...args, limit)
    .reverse()
}

export interface CodeCount {
  code: string | null
  count: number
}

export function byDomain(window: Window): CodeCount[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)
  return d
    .prepare<unknown[], CodeCount>(
      `SELECT domain_code AS code, COUNT(*) AS count FROM tenders
        WHERE is_real = 1 AND domain_code IS NOT NULL${clause}
        GROUP BY domain_code ORDER BY count DESC`,
    )
    .all(...args)
}

export function byGovernorate(window: Window, limit = 12): CodeCount[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)
  return d
    .prepare<unknown[], CodeCount>(
      `SELECT gov_code AS code, COUNT(*) AS count FROM tenders
        WHERE is_real = 1 AND gov_code IS NOT NULL${clause}
        GROUP BY gov_code ORDER BY count DESC LIMIT ?`,
    )
    .all(...args, limit)
}

export function byCategory(window: Window, limit = 12): CodeCount[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)
  return d
    .prepare<unknown[], CodeCount>(
      `SELECT category_code AS code, COUNT(*) AS count FROM tenders
        WHERE is_real = 1 AND category_code IS NOT NULL${clause}
        GROUP BY category_code ORDER BY count DESC LIMIT ?`,
    )
    .all(...args, limit)
}

export interface BuyerActivity {
  code: string
  name: string
  count: number
  lastPublished: string | null
}

export function topBuyers(window: Window, limit = 12): BuyerActivity[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)
  return d
    .prepare<unknown[], BuyerActivity>(
      `SELECT t.buyer_code AS code,
              COALESCE(NULLIF(t.buyer_name, ''), b.name, t.buyer_code) AS name,
              COUNT(*) AS count,
              MAX(t.published_at) AS lastPublished
         FROM tenders t LEFT JOIN buyers b ON b.code = t.buyer_code
        WHERE t.is_real = 1 AND t.buyer_code IS NOT NULL${clause.replace(/published_at/g, 't.published_at')}
        GROUP BY t.buyer_code
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(...args, limit)
}

export interface LeadTimeStats {
  buckets: Array<{ label: string; count: number; from: number; to: number }>
  median: number | null
  sample: number
}

/**
 * Days between publication and deadline — the single most actionable statistic
 * in the dataset. A buyer that habitually gives 8 days is one you must have
 * pre-qualified paperwork for.
 */
export function leadTimes(window: Window): LeadTimeStats {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)

  const rows = d
    .prepare<unknown[], { days: number }>(
      `SELECT CAST(julianday(deadline_at) - julianday(published_at) AS INTEGER) AS days
         FROM tenders
        WHERE is_real = 1 AND deadline_at IS NOT NULL AND published_at IS NOT NULL${clause}`,
    )
    .all(...args)
    .map((r) => r.days)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 180)
    .sort((a, b) => a - b)

  const edges: Array<[number, number, string]> = [
    [0, 7, '≤ 7 j'],
    [8, 14, '8–14'],
    [15, 21, '15–21'],
    [22, 30, '22–30'],
    [31, 45, '31–45'],
    [46, 60, '46–60'],
    [61, 180, '> 60'],
  ]

  const buckets = edges.map(([from, to, label]) => ({
    label,
    from,
    to,
    count: rows.filter((n) => n >= from && n <= to).length,
  }))

  const median = rows.length ? rows[Math.floor(rows.length / 2)] : null
  return { buckets, median, sample: rows.length }
}

export interface WeekdayCount {
  weekday: number // 0 = Sunday, per SQLite %w
  count: number
}

/** Which weekday notices land on — useful for scheduling review time. */
export function weekdayCadence(window: Window): WeekdayCount[] {
  const d = ensureDb()
  const { clause, args } = sinceClause(window)

  const rows = d
    .prepare<unknown[], { w: string; count: number }>(
      `SELECT strftime('%w', published_at) AS w, COUNT(*) AS count
         FROM tenders WHERE is_real = 1 AND published_at IS NOT NULL${clause}
        GROUP BY w`,
    )
    .all(...args)

  const map = new Map(rows.map((r) => [Number(r.w), r.count]))
  // Monday-first ordering; Sunday (0) goes last, as in Tunisian work weeks.
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, count: map.get(weekday) ?? 0 }))
}

// --- buyer profile ---------------------------------------------------------

export interface BuyerProfile {
  code: string
  name: string
  name_ar: string | null
  tender_count: number
  last_published_at: string | null
}

export function getBuyer(code: string): BuyerProfile | null {
  return (
    ensureDb()
      .prepare<[string], BuyerProfile>(
        'SELECT code, name, name_ar, tender_count, last_published_at FROM buyers WHERE code = ?',
      )
      .get(code) ?? null
  )
}

export interface BuyerListRow extends BuyerProfile {
  open_count: number
}

export function listBuyers(opts: { q?: string; limit?: number; offset?: number } = {}): {
  rows: BuyerListRow[]
  total: number
} {
  const d = ensureDb()
  const limit = Math.min(opts.limit ?? 40, 200)
  const offset = Math.max(opts.offset ?? 0, 0)

  const where: string[] = ['b.tender_count > 0']
  const args: unknown[] = []
  if (opts.q?.trim()) {
    where.push('(b.name LIKE ? OR b.name_ar LIKE ? OR b.code LIKE ?)')
    const like = `%${opts.q.trim()}%`
    args.push(like, like, like)
  }
  const clause = where.join(' AND ')

  const total = d
    .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM buyers b WHERE ${clause}`)
    .get(...args)!.n

  const rows = d
    .prepare<unknown[], BuyerListRow>(
      `SELECT b.code, b.name, b.name_ar, b.tender_count, b.last_published_at,
              (SELECT COUNT(*) FROM tenders t
                WHERE t.buyer_code = b.code AND t.deadline_at > ${SQL_NOW}) AS open_count
         FROM buyers b WHERE ${clause}
        ORDER BY b.tender_count DESC, b.name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset)

  return { rows, total }
}

export function buyerDomainMix(code: string): CodeCount[] {
  return ensureDb()
    .prepare<[string], CodeCount>(
      `SELECT domain_code AS code, COUNT(*) AS count FROM tenders
        WHERE buyer_code = ? AND domain_code IS NOT NULL
        GROUP BY domain_code ORDER BY count DESC`,
    )
    .all(code)
}

export function buyerMonthlyVolume(code: string, months = 18): WeeklyPoint[] {
  return ensureDb()
    .prepare<[string, number], WeeklyPoint>(
      `SELECT strftime('%Y-%m-01', published_at) AS weekStart, COUNT(*) AS count
         FROM tenders WHERE buyer_code = ? AND published_at IS NOT NULL
        GROUP BY weekStart ORDER BY weekStart DESC LIMIT ?`,
    )
    .all(code, months)
    .reverse()
}

/** Median lead time this specific buyer grants. */
export function buyerLeadTime(code: string): number | null {
  const rows = ensureDb()
    .prepare<[string], { days: number }>(
      `SELECT CAST(julianday(deadline_at) - julianday(published_at) AS INTEGER) AS days
         FROM tenders
        WHERE buyer_code = ? AND deadline_at IS NOT NULL AND published_at IS NOT NULL`,
    )
    .all(code)
    .map((r) => r.days)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365)
    .sort((a, b) => a - b)

  return rows.length ? rows[Math.floor(rows.length / 2)] : null
}
