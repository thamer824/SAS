/**
 * TUNEPS timestamps are wall-clock strings with no timezone:
 *   "2026-08-13 10:00:00.0"          (deadlines, openings)
 *   "2026-07-24 20:34:06.040209"     (publication, microsecond precision)
 *   "202608131000"                    (the *Str compact variants)
 *
 * They are Africa/Tunis local time. Tunisia sits at UTC+1 year-round — it
 * abolished DST in 2009 — so a fixed offset is correct, not an approximation.
 */

export const TUNIS_OFFSET_MINUTES = 60

/** Parse a TUNEPS wall-clock string into an ISO-8601 UTC instant. */
export function tunepsToIso(value: string | null | undefined): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null

  // Compact form: yyyyMMddHHmm
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s)
  if (compact) {
    const [, y, mo, d, h, mi] = compact
    return build(+y, +mo, +d, +h, +mi, 0, 0)
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(s)
  if (m) {
    const [, y, mo, d, h, mi, sec, frac] = m
    const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0
    return build(+y, +mo, +d, +h, +mi, +sec, ms)
  }

  // Date only
  const dOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (dOnly) {
    const [, y, mo, d] = dOnly
    return build(+y, +mo, +d, 0, 0, 0, 0)
  }

  return null
}

function build(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  sec: number,
  ms: number,
): string | null {
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, sec, ms) - TUNIS_OFFSET_MINUTES * 60_000
  if (!Number.isFinite(utcMs)) return null
  return new Date(utcMs).toISOString()
}

/** Inverse: an ISO instant back into the wall-clock string TUNEPS filters on. */
export function isoToTuneps(iso: string): string {
  const local = new Date(new Date(iso).getTime() + TUNIS_OFFSET_MINUTES * 60_000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())} ` +
    `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`
  )
}

/** Whole days from now until `iso`. Negative once the date has passed. */
export function daysUntil(iso: string | null | undefined, from = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((t - from) / 86_400_000)
}

/** Milliseconds until `iso`, or null. */
export function msUntil(iso: string | null | undefined, from = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t - from : null
}

export type TenderStatus = 'open' | 'closing' | 'closed' | 'unknown'

/** Deadline within 72h is "closing" — that is the window suppliers care about. */
export function statusFor(deadlineIso: string | null | undefined, from = Date.now()): TenderStatus {
  const ms = msUntil(deadlineIso, from)
  if (ms === null) return 'unknown'
  if (ms <= 0) return 'closed'
  if (ms <= 72 * 3_600_000) return 'closing'
  return 'open'
}
