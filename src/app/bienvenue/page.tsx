import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ensureDb } from '@/db'
import { requireUser } from '@/lib/auth/guard'
import { getLocale, translator } from '@/lib/i18n'
import { orgWatchlists } from '@/lib/match/engine'
import { skipOnboarding } from '@/lib/actions/onboarding-actions'
import { categoriesByDomain, governorates } from '@/lib/tuneps/reference'
import { SectorPicker, type SectorGroup } from '@/components/onboarding/sector-picker'
import { Brand } from '@/components/shell/nav'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('onb.title') }
}

/**
 * First-run setup. Deliberately outside the app shell: no sidebar, no bell, no
 * search — one decision on the screen. An org that already has an alert is sent
 * straight to the feed.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ again?: string }>
}) {
  const user = await requireUser('/bienvenue')
  const locale = await getLocale()
  const t = translator(locale)

  // First run only, unless ?again=1 — which is how "Nouvelle alerte" reuses this
  // screen instead of sending people to the advanced form.
  const { again } = await searchParams
  if (again !== '1' && orgWatchlists(user.org_id).length > 0) redirect('/app')

  const d = ensureDb()

  // Open-notice count per sector. This is the persuasion on each tile, so it has
  // to be the live number rather than a static list.
  const counts = new Map(
    d
      .prepare<[], { code: string; n: number }>(
        `SELECT category_code AS code, COUNT(*) AS n FROM tenders
          WHERE is_real = 1 AND category_code IS NOT NULL
            AND deadline_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
          GROUP BY category_code`,
      )
      .all()
      .map((r) => [r.code, r.n]),
  )

  // Empty sectors are hidden: a tile reading "0" is an argument against signing up.
  const groups: SectorGroup[] = categoriesByDomain(locale)
    .map((g) => ({
      domain: g.domain,
      domainLabel: g.domainLabel,
      items: g.items
        .map((c) => ({
          code: c.code,
          label: locale === 'ar' ? c.ar || c.fr : c.fr || c.ar,
          count: counts.get(c.code) ?? 0,
        }))
        .filter((i) => i.count > 0)
        .sort((a, b) => b.count - a.count),
    }))
    .filter((g) => g.items.length > 0)

  const regions = governorates().map((g) => ({
    code: g.code,
    label: locale === 'ar' ? g.ar || g.fr : g.fr || g.ar,
  }))

  const firstName = (user.full_name || user.email).split(/[\s@]/)[0]

  return (
    <div className="min-h-dvh bg-[var(--surface-app)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <Brand href="/app" />
          <form action={skipOnboarding}>
            <button
              type="submit"
              className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              {t('onb.skip')}
            </button>
          </form>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="label-xs mb-2">
          {t('onb.welcome')}, {firstName}
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
          {t('onb.title')}
        </h1>
        <p className="mb-9 mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {t('onb.subtitle')}
        </p>

        <SectorPicker
          groups={groups}
          regions={regions}
          labels={{
            sectors: t('onb.step.sectors'),
            sectorsHint: t('onb.step.sectors.hint'),
            regions: t('onb.step.regions'),
            regionsHint: t('onb.step.regions.hint'),
            notify: t('onb.step.notify'),
            instant: t('onb.notify.instant'),
            instantHint: t('onb.notify.instant.hint'),
            daily: t('onb.notify.daily'),
            dailyHint: t('onb.notify.daily.hint'),
            submit: t('onb.submit'),
            submitting: t('onb.submitting'),
            selected: t('onb.selected', { n: '{n}' }),
            selectedPlural: t('onb.selectedPlural', { n: '{n}' }),
            needSector: t('onb.needSector'),
            matchesNow: t('onb.matchesNow'),
            error: t('common.error'),
          }}
        />
      </main>
    </div>
  )
}
