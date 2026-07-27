'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ensureDb, nowIso } from '@/db'
import { newId, newToken } from '@/lib/ids'
import { requireUserOrThrow } from '@/lib/auth/guard'
import { getWatchlist, type WatchCriteria } from '@/lib/match/engine'
import { backfillWatchlist } from '@/lib/match/run'
import { countTenders } from '@/lib/queries/tenders'
import { label } from '@/lib/tuneps/reference'

export interface OnboardingState {
  error?: string
}

/**
 * One-screen setup: sectors (+ optional regions) + how to be told.
 *
 * This creates a real watchlist, but the user never sees that word. The whole
 * concept is compressed into "choose your sectors" because that is the mental
 * model a contractor already has, and every extra field here is a signup we lose.
 *
 * No keywords are asked for: sector codes come straight from TUNEPS and match
 * far more reliably than free text a first-time user would guess at.
 */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUserOrThrow()

  const categoryCodes = formData
    .getAll('sectors')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 60)

  if (!categoryCodes.length) return { error: 'onb.needSector' }

  const govCodes = formData
    .getAll('regions')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 30)

  const cadence = formData.get('cadence') === 'instant' ? 'instant' : 'daily'

  const criteria: WatchCriteria = {
    // No keywords: structural criteria only, so the alert cannot silently match
    // nothing because of a typo.
    keywords: [],
    categoryCodes,
    govCodes,
    openOnly: true,
    // Structural-only matching scores lower than keyword matching by design, so
    // the floor has to be low or a sector alert would never fire.
    minScore: 10,
  }

  // Name it after what the user picked, so the list stays legible later.
  const firstTwo = categoryCodes.slice(0, 2).map((c) => label('category', c, 'fr'))
  const name =
    categoryCodes.length > 2
      ? `${firstTwo.join(', ')} +${categoryCodes.length - 2}`
      : firstTwo.join(', ')

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
      name.slice(0, 120),
      JSON.stringify(criteria),
      cadence,
      JSON.stringify(['inapp', 'email']),
      ts,
      ts,
    )

    d.prepare(
      `INSERT INTO feed_tokens (token, kind, org_id, ref_id, created_at)
       VALUES (?, 'ics-watchlist', ?, ?, ?)`,
    ).run(newToken(18), user.org_id, id, ts)

    // Seed the company profile from the same choice, so the fit score works
    // immediately without a second form.
    d.prepare('UPDATE orgs SET domain_codes = ?, gov_code = COALESCE(gov_code, ?) WHERE id = ?').run(
      JSON.stringify([...new Set(categoryCodes.map(domainOf).filter(Boolean))]),
      govCodes[0] ?? null,
      user.org_id,
    )
  })()

  // Populate against history so the first visit is not an empty page.
  const created = getWatchlist(id)
  if (created) backfillWatchlist(created, 300)

  revalidatePath('/app')
  revalidatePath('/app/watchlists')
  redirect('/app?mine=1')
}

function domainOf(categoryCode: string): string {
  switch (categoryCode.trim()[0]) {
    case '1':
      return '2391'
    case '3':
      return '2392'
    case '5':
      return '2393'
    case '7':
      return '2394'
    default:
      return ''
  }
}

/** Live count for the "≈ N avis correspondent" reassurance on the picker. */
export async function previewSectorCount(
  categoryCodes: string[],
  govCodes: string[],
): Promise<number> {
  await requireUserOrThrow()
  if (!categoryCodes.length) return 0
  return countTenders({
    categoryCodes,
    govCodes: govCodes.length ? govCodes : undefined,
    status: 'open',
  })
}

/** Let a user postpone setup without blocking them from browsing. */
export async function skipOnboarding(): Promise<void> {
  const user = await requireUserOrThrow()
  ensureDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
    )
    .run(`onboarded:${user.org_id}`, nowIso())
  redirect('/app')
}
