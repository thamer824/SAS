import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SQL_NOW } from '@/db/sql'
import { ensureDb } from '@/db'
import { requireUser } from '@/lib/auth/guard'
import { getLocale, LOCALE_META, LOCALES, translator } from '@/lib/i18n'
import { getIntake } from '@/lib/queries/intake'
import { categoriesByDomain, governorates } from '@/lib/tuneps/reference'
import { IntakeForm, type SectorGroup } from '@/components/intake/intake-form'
import { Brand } from '@/components/shell/nav'
import { LocaleSwitcher } from '@/components/shell/controls'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('form.title') }
}

/**
 * The intake form.
 *
 * Deliberately outside the app shell — no sidebar, no search, no notification
 * bell. One thing on the screen. Re-openable with `?edit=1` from the offers page
 * so "modifier mes critères" reuses this exact form pre-filled.
 */
export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const user = await requireUser('/bienvenue')
  const locale = await getLocale()
  const t = translator(locale)

  const { edit } = await searchParams
  const intake = getIntake(user.org_id, user.id)

  // Already answered and not explicitly editing → straight to their offers.
  if (intake?.completed && edit !== '1') redirect('/app')

  const d = ensureDb()

  // Live count of OPEN notices per sector. Shown on every tile, because a number
  // is what convinces someone the answer is worth giving.
  const counts = new Map(
    d
      .prepare<[], { code: string; n: number }>(
        `SELECT category_code AS code, COUNT(*) AS n FROM tenders
          WHERE is_real = 1 AND category_code IS NOT NULL AND deadline_at > ${SQL_NOW}
          GROUP BY category_code`,
      )
      .all()
      .map((r) => [r.code, r.n]),
  )

  const pick = (fr: string, ar: string) => (locale === 'ar' ? ar || fr : fr || ar)

  // Empty sectors are hidden — a tile reading "0" argues against answering.
  const groups: SectorGroup[] = categoriesByDomain(locale)
    .map((g) => ({
      key: g.domain,
      label: g.domainLabel,
      items: g.items
        .map((c) => ({ code: c.code, label: pick(c.fr, c.ar), count: counts.get(c.code) ?? 0 }))
        .filter((i) => i.count > 0)
        .sort((a, b) => b.count - a.count),
    }))
    .filter((g) => g.items.length > 0)

  const regions = governorates().map((g) => ({ code: g.code, label: pick(g.fr, g.ar) }))

  return (
    <div className="min-h-dvh bg-[var(--surface-app)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Brand href={intake?.completed ? '/app' : '/'} />
          <LocaleSwitcher
            current={locale}
            options={LOCALES.map((l) => ({ code: l, label: LOCALE_META[l].nativeLabel }))}
          />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-14">
        <h1 className="text-[1.875rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]">
          {t('form.title')}
        </h1>
        <p className="mb-9 mt-3.5 max-w-2xl text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          {t('form.subtitle')}
        </p>

        <IntakeForm
          groups={groups}
          regions={regions}
          defaults={{
            companyName: intake?.companyName ?? user.org_name,
            categoryCodes: intake?.categoryCodes ?? [],
            regionScope: intake?.regionScope ?? 'all',
            govCodes: intake?.govCodes ?? [],
            notifyChannel: intake?.notifyChannel ?? 'email',
            whatsappNumber: intake?.whatsappNumber ?? '',
          }}
          labels={{
            title: t('form.title'),
            subtitle: t('form.subtitle'),
            stepOf: t('form.stepOf', { n: '{n}' }),
            q1: t('form.q1'),
            q1Placeholder: t('form.q1.placeholder'),
            q2: t('form.q2'),
            q2Hint: t('form.q2.hint'),
            q2Chosen: t('form.q2.chosen', { n: '{n}' }),
            q2ChosenPlural: t('form.q2.chosenPlural', { n: '{n}' }),
            q3: t('form.q3'),
            q3All: t('form.q3.all'),
            q3AllHint: t('form.q3.all.hint'),
            q3Some: t('form.q3.some'),
            q3SomeHint: t('form.q3.some.hint'),
            q4: t('form.q4'),
            q4Email: t('form.q4.email'),
            q4WhatsApp: t('form.q4.whatsapp'),
            q4Both: t('form.q4.both'),
            q4Phone: t('form.q4.phone'),
            q4PhoneHint: t('form.q4.phone.hint'),
            submit: t('form.submit'),
            submitting: t('form.submitting'),
            preview: t('form.preview', { n: '{n}' }),
            previewNone: t('form.previewNone'),
            showAll: t('form.q2.showAll', { n: '{n}' }),
            showLess: t('form.q2.showLess'),
            errors: {
              'common.required': t('common.required'),
              'common.error': t('common.error'),
              'form.q2.needOne': t('form.q2.needOne'),
              'form.q3.needOne': t('form.q3.needOne'),
              'form.q4.phone.invalid': t('form.q4.phone.invalid'),
            },
          }}
        />
      </main>
    </div>
  )
}
