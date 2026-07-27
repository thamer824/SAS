/**
 * SQL time helpers.
 *
 * All timestamp columns store ISO-8601 UTC with milliseconds and a `Z`:
 *
 *     2026-08-13T09:00:00.000Z
 *
 * SQLite's `datetime('now')` returns a DIFFERENT shape — `2026-07-25 11:30:00`
 * — and comparing the two is a **string** comparison, not a date comparison.
 * Because `'T'` (0x54) sorts after `' '` (0x20), any ISO value compares GREATER
 * than a `datetime()` value on the same calendar day. In practice that meant a
 * deadline of 09:00 today still counted as "open" for the rest of the day.
 *
 * `strftime('%Y-%m-%dT%H:%M:%fZ', …)` produces the exact stored shape, so
 * comparisons are correct to the millisecond. Always use these helpers when a
 * query compares a timestamp column against "now".
 */

/** `now`, formatted to match stored ISO timestamps exactly. */
export const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

/**
 * `now` shifted by a SQLite modifier, e.g. `SQL_NOW_PLUS("'+7 days'")`.
 * Pass the modifier as a quoted SQL literal or as `?` for a bound parameter.
 */
export function SQL_NOW_PLUS(modifier: string): string {
  return `strftime('%Y-%m-%dT%H:%M:%fZ','now',${modifier})`
}
