'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ensureDb, nowIso } from '@/db'
import { newId, newToken } from '@/lib/ids'
import { requireUserOrThrow } from '@/lib/auth/guard'
import { backfillWatchlist } from '@/lib/match/run'
import { getWatchlist, type WatchCriteria } from '@/lib/match/engine'
import { parseKeywords } from '@/lib/text/normalize'

const CADENCES = ['instant', 'daily', 'weekly', 'off'] as const
const CHANNELS = ['inapp', 'email', 'webpush', 'telegram'] as const

const criteriaSchema = z.object({
  keywords: z.array(z.string()).max(60).optional(),
  excludeKeywords: z.array(z.string()).max(60).optional(),
  buyerCodes: z.array(z.string()).max(60).optional(),
  domainCodes: z.array(z.string()).max(20).optional(),
  categoryCodes: z.array(z.string()).max(80).optional(),
  govCodes: z.array(z.string()).max(30).optional(),
  procedureCodes: z.array(z.string()).max(20).optional(),
  sources: z.array(z.enum(['ao', 'consultation'])).optional(),
  minLeadDays: z.number().int().min(0).max(180).optional(),
  onlineOnly: z.boolean().optional(),
  internationalOnly: z.boolean().optional(),
  openOnly: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
})

export interface WatchlistFormState {
  error?: string
  ok?: boolean
}

/** Pull criteria out of the form. Multi-selects arrive as repeated fields. */
function readCriteria(formData: FormData): WatchCriteria {
  const many = (name: string) =>
    formData
      .getAll(name)
      .map((v) => String(v).trim())
      .filter(Boolean)

  const num = (name: string): number | undefined => {
    const raw = String(formData.get(name) ?? '').trim()
    if (!raw) return undefined
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : undefined
  }

  const raw: WatchCriteria = {
    keywords: parseKeywords(String(formData.get('keywords') ?? '')),
    excludeKeywords: parseKeywords(String(formData.get('excludeKeywords') ?? '')),
    buyerCodes: many('buyerCodes'),
    domainCodes: many('domainCodes'),
    categoryCodes: many('categoryCodes'),
    govCodes: many('govCodes'),
    procedureCodes: many('procedureCodes'),
    sources: many('sources').filter((s): s is 'ao' | 'consultation' => s === 'ao' || s === 'consultation'),
    minLeadDays: num('minLeadDays'),
    onlineOnly: formData.get('onlineOnly') === 'on',
    internationalOnly: formData.get('internationalOnly') === 'on',
    openOnly: formData.get('openOnly') !== null ? formData.get('openOnly') === 'on' : true,
    minScore: num('minScore') ?? 40,
  }

  const parsed = criteriaSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}

function readChannels(formData: FormData): string[] {
  const selected = formData
    .getAll('channels')
    .map((v) => String(v))
    .filter((c): c is (typeof CHANNELS)[number] => (CHANNELS as readonly string[]).includes(c))
  // In-app is always on: it is the record of what was alerted, not a preference.
  return [...new Set(['inapp', ...selected])]
}

export async function createWatchlist(
  _prev: WatchlistFormState,
  formData: FormData,
): Promise<WatchlistFormState> {
  const user = await requireUserOrThrow()

  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  if (!name) return { error: 'common.required' }

  const cadenceRaw = String(formData.get('cadence') ?? 'instant')
  const cadence = (CADENCES as readonly string[]).includes(cadenceRaw) ? cadenceRaw : 'instant'

  const criteria = readCriteria(formData)
  const channels = readChannels(formData)

  const id = newId('wl')
  const ts = nowIso()
  const d = ensureDb()

  d.transaction(() => {
    d.prepare(
      `INSERT INTO watchlists
         (id, org_id, created_by, name, criteria, cadence, channels, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      user.org_id,
      user.id,
      name,
      JSON.stringify(criteria),
      cadence,
      JSON.stringify(channels),
      ts,
      ts,
    )

    // Unguessable ICS token so a calendar client can subscribe without cookies.
    d.prepare(
      `INSERT INTO feed_tokens (token, kind, org_id, ref_id, created_at)
       VALUES (?, 'ics-watchlist', ?, ?, ?)`,
    ).run(newToken(18), user.org_id, id, ts)
  })()

  // Seed against history so a new watchlist is immediately useful rather than
  // empty until the next publication.
  const w = getWatchlist(id)
  if (w) backfillWatchlist(w, 300)

  revalidatePath('/app/watchlists')
  redirect(`/app/watchlists/${id}`)
}

export async function updateWatchlist(
  id: string,
  _prev: WatchlistFormState,
  formData: FormData,
): Promise<WatchlistFormState> {
  const user = await requireUserOrThrow()
  const d = ensureDb()

  const owned = d
    .prepare('SELECT id FROM watchlists WHERE id = ? AND org_id = ?')
    .get(id, user.org_id)
  if (!owned) return { error: 'common.error' }

  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  if (!name) return { error: 'common.required' }

  const cadenceRaw = String(formData.get('cadence') ?? 'instant')
  const cadence = (CADENCES as readonly string[]).includes(cadenceRaw) ? cadenceRaw : 'instant'

  d.prepare(
    `UPDATE watchlists SET name = ?, criteria = ?, cadence = ?, channels = ?, updated_at = ?
      WHERE id = ? AND org_id = ?`,
  ).run(
    name,
    JSON.stringify(readCriteria(formData)),
    cadence,
    JSON.stringify(readChannels(formData)),
    nowIso(),
    id,
    user.org_id,
  )

  // Criteria changed, so previously recorded matches no longer describe it.
  // Clear and re-seed rather than leaving a stale, misleading list.
  d.prepare('DELETE FROM watchlist_matches WHERE watchlist_id = ?').run(id)
  const w = getWatchlist(id)
  if (w) backfillWatchlist(w, 300)

  revalidatePath('/app/watchlists')
  revalidatePath(`/app/watchlists/${id}`)
  return { ok: true }
}

export async function toggleWatchlist(id: string): Promise<void> {
  const user = await requireUserOrThrow()
  ensureDb()
    .prepare(
      `UPDATE watchlists SET is_active = 1 - is_active, updated_at = ?
        WHERE id = ? AND org_id = ?`,
    )
    .run(nowIso(), id, user.org_id)
  revalidatePath('/app/watchlists')
  revalidatePath(`/app/watchlists/${id}`)
}

export async function deleteWatchlist(id: string): Promise<void> {
  const user = await requireUserOrThrow()
  ensureDb().prepare('DELETE FROM watchlists WHERE id = ? AND org_id = ?').run(id, user.org_id)
  revalidatePath('/app/watchlists')
  redirect('/app/watchlists')
}

/** "Test now": re-run the criteria across the whole corpus. */
export async function testWatchlist(id: string): Promise<void> {
  const user = await requireUserOrThrow()
  const w = getWatchlist(id)
  if (!w || w.org_id !== user.org_id) return
  backfillWatchlist(w, 500)
  revalidatePath(`/app/watchlists/${id}`)
}
