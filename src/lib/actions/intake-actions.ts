'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUserOrThrow } from '@/lib/auth/guard'
import { normaliseWhatsApp } from '@/lib/notify/channels'
import { countTenders } from '@/lib/queries/tenders'
import { saveIntake, type NotifyChannel, type RegionScope } from '@/lib/queries/intake'

export interface IntakeState {
  /** A translation key, resolved by the page that owns the locale. */
  error?: string
}

/**
 * Save the four answers and send the user straight to their matching offers.
 *
 * Validation returns translation KEYS, never rendered strings — a server action
 * has no locale context.
 */
export async function submitIntake(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const user = await requireUserOrThrow()

  // 1 — company
  const companyName = String(formData.get('companyName') ?? '').trim().slice(0, 160)
  if (!companyName) return { error: 'common.required' }

  // 2 — sectors
  const categoryCodes = formData
    .getAll('sectors')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 60)
  if (!categoryCodes.length) return { error: 'form.q2.needOne' }

  // 3 — where
  const regionScope: RegionScope = formData.get('regionScope') === 'regions' ? 'regions' : 'all'
  const govCodes = formData
    .getAll('regions')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 30)
  if (regionScope === 'regions' && !govCodes.length) return { error: 'form.q3.needOne' }

  // 4 — how to be notified
  const raw = String(formData.get('notifyChannel') ?? 'email')
  const notifyChannel: NotifyChannel =
    raw === 'whatsapp' || raw === 'both' ? (raw as NotifyChannel) : 'email'

  let whatsappNumber: string | null = null
  if (notifyChannel === 'whatsapp' || notifyChannel === 'both') {
    const normalised = normaliseWhatsApp(String(formData.get('whatsapp') ?? ''))
    if (!normalised) return { error: 'form.q4.phone.invalid' }
    whatsappNumber = normalised
  }

  saveIntake({
    orgId: user.org_id,
    userId: user.id,
    companyName,
    categoryCodes,
    regionScope,
    govCodes,
    notifyChannel,
    whatsappNumber,
  })

  revalidatePath('/app')
  revalidatePath('/app/watchlists')
  // Land on their own offers, not on everything.
  redirect('/app')
}

/** Live count while the user ticks sectors, for the reassurance line. */
export async function countMatching(
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
