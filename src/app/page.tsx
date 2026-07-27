import { SQL_NOW, SQL_NOW_PLUS } from '@/db/sql'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { ensureDb } from '@/db'
import { formatNumber, getLocale, LOCALE_META, LOCALES, translator } from '@/lib/i18n'
import { Brand } from '@/components/shell/nav'
import { LocaleSwitcher, ThemeToggle } from '@/components/shell/controls'
import { Icon, LinkButton, cx } from '@/components/ui/primitives'

export default async function LandingPage() {
  // Signed-in users have no use for a marketing page.
  if (await currentUser()) redirect('/app')

  const locale = await getLocale()
  const t = translator(locale)
  const jar = await cookies()
  const themePref = jar.get('mq_theme')?.value ?? 'system'

  const d = ensureDb()
  const stats = d
    .prepare<[], { tenders: number; buyers: number; week: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tenders) AS tenders,
         (SELECT COUNT(*) FROM buyers WHERE tender_count > 0) AS buyers,
         (SELECT COUNT(*) FROM tenders WHERE published_at >= ${SQL_NOW_PLUS("'-7 days'")}) AS week,
         (SELECT COUNT(*) FROM tenders WHERE deadline_at > ${SQL_NOW}) AS open`,
    )
    .get()!

  const nf = (n: number) => formatNumber(n, locale)

  const features = [
    { icon: 'layers' as const, title: t('landing.feature.unified.title'), body: t('landing.feature.unified.body') },
    { icon: 'radar' as const, title: t('landing.feature.alerts.title'), body: t('landing.feature.alerts.body') },
    // `bookmark`, not `target`: the radar icon above is also concentric circles
    // and the two read as the same mark at 17px.
    { icon: 'bookmark' as const, title: t('landing.feature.pipeline.title'), body: t('landing.feature.pipeline.body') },
    { icon: 'chart' as const, title: t('landing.feature.insights.title'), body: t('landing.feature.insights.body') },
    { icon: 'calendar' as const, title: t('landing.feature.calendar.title'), body: t('landing.feature.calendar.body') },
    { icon: 'external' as const, title: t('landing.feature.api.title'), body: t('landing.feature.api.body') },
  ]

  const steps = [
    { n: '1', title: t('landing.how.1.title'), body: t('landing.how.1.body') },
    { n: '2', title: t('landing.how.2.title'), body: t('landing.how.2.body') },
    { n: '3', title: t('landing.how.3.title'), body: t('landing.how.3.body') },
  ]

  return (
    <div className="min-h-dvh">
      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-app)]/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Brand href="/" />
          <div className="flex items-center gap-1">
            <LocaleSwitcher
              current={locale}
              options={LOCALES.map((l) => ({ code: l, label: LOCALE_META[l].nativeLabel }))}
            />
            <ThemeToggle initial={themePref} />
            <Link
              href="/signin"
              className="ms-1 hidden h-8 items-center rounded-lg px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] sm:inline-flex"
            >
              {t('nav.signin')}
            </Link>
            <LinkButton href="/signup" size="sm" className="ms-1">
              {t('nav.signup')}
            </LinkButton>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------------- hero ---------------- */}
        <section className="relative overflow-hidden border-b border-[var(--border-subtle)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, var(--text-primary) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-40 -top-40 size-[34rem] rounded-full opacity-[0.07] blur-3xl"
            style={{ background: 'var(--accent)' }}
          />

          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="label-xs mb-4">{t('landing.hero.eyebrow')}</p>
            <h1 className="max-w-3xl text-[2rem] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.75rem]">
              {t('landing.hero.title')}
            </h1>
            <p className="mt-5 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
              {t('landing.hero.body')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/signup" size="lg">
                {t('landing.hero.cta')}
                <Icon.arrowRight size={16} className="flip-rtl" />
              </LinkButton>
              <LinkButton href="/signin" variant="secondary" size="lg">
                {t('landing.hero.cta2')}
              </LinkButton>
            </div>

            {/* Real counts from the local corpus — verifiable, not marketing. */}
            <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
              {[
                { v: nf(stats.tenders), l: t('landing.stat.tenders') },
                { v: nf(stats.buyers), l: t('landing.stat.buyers') },
                { v: nf(stats.week), l: t('landing.stat.today') },
                { v: '< 15 min', l: t('landing.stat.latency') },
              ].map((s) => (
                <div key={s.l}>
                  <dd className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{s.v}</dd>
                  <dt className="mt-1 text-xs leading-snug text-[var(--text-muted)]">{s.l}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------------- how it works ---------------- */}
        <section className="border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="mb-9 text-xl font-semibold tracking-[-0.015em]">{t('landing.how.title')}</h2>
            <ol className="grid gap-6 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.n} className="relative">
                  <span
                    className="num mb-3 grid size-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]"
                    aria-hidden="true"
                  >
                    {s.n}
                  </span>
                  <h3 className="text-[0.9375rem] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {s.body}
                  </p>
                  {i < steps.length - 1 ? (
                    <Icon.chevronRight
                      size={16}
                      className="flip-rtl absolute -end-4 top-1.5 hidden text-[var(--text-faint)] sm:block"
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- features ---------------- */}
        <section className="border-b border-[var(--border-subtle)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => {
                const Ico = Icon[f.icon]
                return (
                  <div key={f.title}>
                    <span
                      className="mb-3.5 grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--accent)]"
                      aria-hidden="true"
                    >
                      <Ico size={17} />
                    </span>
                    <h3 className="text-[0.9375rem] font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {f.body}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ---------------- provenance ---------------- */}
        <section className="border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.015em]">{t('landing.source.title')}</h2>
              <p className="mt-3 max-w-xl text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                {t('landing.source.body')}
              </p>
              <a
                href="https://www.tuneps.tn/"
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                <Icon.external size={13} />
                tuneps.tn
              </a>
            </div>

            {/* Source-of-truth table: exactly what we ingest and how often. */}
            <div className="panel overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th scope="col" className="label-xs px-4 pb-2 pt-3 text-start">
                      {t('tender.source')}
                    </th>
                    <th scope="col" className="label-xs px-4 pb-2 pt-3 text-end">
                      Endpoint
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { k: t('source.ao'), v: 'bid/master' },
                    { k: t('source.consultation'), v: 'spShopMaster' },
                    { k: t('nav.buyers'), v: 'umInst' },
                  ].map((r) => (
                    <tr key={r.v} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-4 py-2.5">{r.k}</td>
                      <td className="num px-4 py-2.5 text-end font-mono text-2xs text-[var(--text-muted)]">
                        {r.v}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--surface-sunken)]">
                    <td className="px-4 py-2.5 font-medium">{t('insights.openNow')}</td>
                    <td className="num px-4 py-2.5 text-end font-semibold">{nf(stats.open)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="mx-auto max-w-xl text-2xl font-semibold leading-tight tracking-[-0.02em]">
            {t('landing.hero.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[0.875rem] text-[var(--text-secondary)]">
            {t('auth.signup.subtitle')}
          </p>
          <div className="mt-7 flex justify-center">
            <LinkButton href="/signup" size="lg">
              {t('landing.hero.cta')}
              <Icon.arrowRight size={16} className="flip-rtl" />
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-subtle)]">
        <div
          className={cx(
            'mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6',
          )}
        >
          <p className="text-2xs leading-relaxed text-[var(--text-faint)]">{t('auth.legal')}</p>
          <p className="flex shrink-0 items-center gap-4 text-2xs text-[var(--text-faint)]">
            <Link href="/signin" className="underline-offset-2 hover:underline">
              {t('nav.signin')}
            </Link>
            <Link href="/signup" className="underline-offset-2 hover:underline">
              {t('nav.signup')}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
