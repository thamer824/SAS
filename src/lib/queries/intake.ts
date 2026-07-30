import { ensureDb, nowIso } from '@/db'
import { newId, newToken } from '@/lib/ids'
import { getWatchlist, type WatchCriteria } from '@/lib/match/engine'
import { backfillWatchlist } from '@/lib/match/run'
import { domainFromCategory, label } from '@/lib/tuneps/reference'
import type { Locale } from '@/lib/i18n/dictionaries'

/**
 * The intake questionnaire, as a single readable object.
 *
 * Four questions — company, sectors, where, how to be told — are the entire
 * configuration surface for a normal user. They are stored as columns rather
 * than buried in a watchlist's criteria JSON so that:
 *   - the form can be pre-filled and re-opened for editing,
 *   - any screen can print "vos critères" in plain language without parsing,
 *   - and there is exactly ONE watchlist behind it all, updated in place.
 */

export type RegionScope = 'all' | 'regions'
export type NotifyChannel = 'email' | 'whatsapp' | 'both'

export interface IntakeProfile {
  companyName: string
  categoryCodes: string[]
  regionScope: RegionScope
  govCodes: string[]
  notifyChannel: NotifyChannel
  whatsappNumber: string
  completed: boolean
  primaryWatchlistId: string | null
}

interface Row {
  name: string
  category_codes: string
  region_scope: string
  gov_codes: string
  notify_channel: string
  intake_completed_at: string | null
  primary_watchlist_id: string | null
  whatsapp_number: string | null
}

function jsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function getIntake(orgId: string, userId: string): IntakeProfile | null {
  const row = ensureDb()
    .prepare<[string, string], Row>(
      `SELECT o.name, o.category_codes, o.region_scope, o.gov_codes, o.notify_channel,
              o.intake_completed_at, o.primary_watchlist_id, u.whatsapp_number
         FROM orgs o, users u
        WHERE o.id = ? AND u.id = ?`,
    )
    .get(orgId, userId)

  if (!row) return null

  return {
    companyName: row.name,
    categoryCodes: jsonArray(row.category_codes),
    regionScope: row.region_scope === 'regions' ? 'regions' : 'all',
    govCodes: jsonArray(row.gov_codes),
    notifyChannel:
      row.notify_channel === 'whatsapp' || row.notify_channel === 'both'
        ? row.notify_channel
        : 'email',
    whatsappNumber: row.whatsapp_number ?? '',
    completed: Boolean(row.intake_completed_at),
    primaryWatchlistId: row.primary_watchlist_id,
  }
}

export interface SaveIntakeInput {
  orgId: string
  userId: string
  companyName: string
  categoryCodes: string[]
  regionScope: RegionScope
  govCodes: string[]
  notifyChannel: NotifyChannel
  whatsappNumber: string | null
}

/**
 * Persist the answers and (re)build the single watchlist behind them.
 *
 * Idempotent: saving again updates the same watchlist rather than adding one, so
 * a user who edits their criteria five times still has one alert, not five.
 */
export function saveIntake(input: SaveIntakeInput): string {
  const d = ensureDb()
  const ts = nowIso()

  const channels: string[] = ['inapp']
  if (input.notifyChannel === 'email' || input.notifyChannel === 'both') channels.push('email')
  if (input.notifyChannel === 'whatsapp' || input.notifyChannel === 'both') channels.push('whatsapp')

  const govCodes = input.regionScope === 'regions' ? input.govCodes : []

  const criteria: WatchCriteria = {
    // Structural criteria only — no free-text keywords. Sector codes come from
    // TUNEPS itself and cannot be misspelled, which matters when the person
    // filling the form is not going to debug why their alert is silent.
    keywords: [],
    categoryCodes: input.categoryCodes,
    govCodes,
    openOnly: true,
    // Low floor: structural matches score lower than keyword matches by design,
    // so a sector alert would never fire at the default 40.
    minScore: 10,
  }

  const existing = d
    .prepare<[string], { primary_watchlist_id: string | null }>(
      'SELECT primary_watchlist_id FROM orgs WHERE id = ?',
    )
    .get(input.orgId)

  const watchlistId = existing?.primary_watchlist_id ?? newId('wl')
  const isNew = !existing?.primary_watchlist_id

  const domainCodes = [...new Set(input.categoryCodes.map(domainFromCategory).filter(Boolean))]

  d.transaction(() => {
    d.prepare(
      `UPDATE orgs SET
         name = ?, category_codes = ?, region_scope = ?, gov_codes = ?,
         notify_channel = ?, domain_codes = ?, gov_code = ?,
         intake_completed_at = ?, primary_watchlist_id = ?
       WHERE id = ?`,
    ).run(
      input.companyName,
      JSON.stringify(input.categoryCodes),
      input.regionScope,
      JSON.stringify(govCodes),
      input.notifyChannel,
      JSON.stringify(domainCodes),
      govCodes[0] ?? null,
      ts,
      watchlistId,
      input.orgId,
    )

    d.prepare('UPDATE users SET whatsapp_number = ? WHERE id = ?').run(
      input.whatsappNumber || null,
      input.userId,
    )

    const name = watchlistName(input.categoryCodes, 'fr')

    if (isNew) {
      d.prepare(
        `INSERT INTO watchlists
           (id, org_id, created_by, name, criteria, cadence, channels, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'daily', ?, ?, ?)`,
      ).run(
        watchlistId,
        input.orgId,
        input.userId,
        name,
        JSON.stringify(criteria),
        JSON.stringify(channels),
        ts,
        ts,
      )

      d.prepare(
        `INSERT INTO feed_tokens (token, kind, org_id, ref_id, created_at)
         VALUES (?, 'ics-watchlist', ?, ?, ?)`,
      ).run(newToken(18), input.orgId, watchlistId, ts)
    } else {
      d.prepare(
        `UPDATE watchlists SET name = ?, criteria = ?, channels = ?, is_active = 1, updated_at = ?
          WHERE id = ?`,
      ).run(name, JSON.stringify(criteria), JSON.stringify(channels), ts, watchlistId)

      // The criteria changed, so the recorded matches no longer describe them.
      d.prepare('DELETE FROM watchlist_matches WHERE watchlist_id = ?').run(watchlistId)
    }
  })()

  // Seed against history so the user's first screen is never empty.
  const w = getWatchlist(watchlistId)
  if (w) backfillWatchlist(w, 400)

  return watchlistId
}

/** Name the alert after the sectors, so the list stays legible. */
export function watchlistName(categoryCodes: string[], locale: Locale): string {
  const names = categoryCodes.slice(0, 2).map((c) => label('category', c, locale))
  const rest = categoryCodes.length - names.length
  const base = names.join(', ')
  return (rest > 0 ? `${base} +${rest}` : base).slice(0, 120) || 'Mes critères'
}

/**
 * "Génie Civil, Électricité · Tunis, Sfax" — the criteria in one line, for the
 * header of the offers page. A user must be able to see what they asked for
 * without opening a form.
 */
export function describeIntake(
  intake: IntakeProfile,
  locale: Locale,
  allRegionsLabel: string,
): { sectors: string; regions: string } {
  const sectors = intake.categoryCodes.map((c) => label('category', c, locale)).join(' · ')
  const regions =
    intake.regionScope === 'all' || intake.govCodes.length === 0
      ? allRegionsLabel
      : intake.govCodes.map((g) => label('gov', g, locale)).join(' · ')
  return { sectors, regions }
}
