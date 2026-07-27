import { SQL_NOW } from '@/db/sql'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { getLocale, LOCALE_META, LOCALES, translator } from '@/lib/i18n'
import { Brand } from '@/components/shell/nav'
import { LocaleSwitcher, ThemeToggle } from '@/components/shell/controls'
import { cookies } from 'next/headers'
import { ensureDb } from '@/db'
import { Icon } from '@/components/ui/primitives'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect('/app')

  const locale = await getLocale()
  const t = translator(locale)
  const jar = await cookies()
  const themePref = jar.get('mq_theme')?.value ?? 'system'

  const stats = ensureDb()
    .prepare<[], { tenders: number; buyers: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tenders) AS tenders,
         (SELECT COUNT(*) FROM buyers WHERE tender_count > 0) AS buyers,
         (SELECT COUNT(*) FROM tenders WHERE deadline_at > ${SQL_NOW}) AS open`,
    )
    .get()!

  const nf = new Intl.NumberFormat(locale === 'ar' ? 'ar-TN-u-nu-latn' : 'fr-TN')

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* --- form column --- */}
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header className="mb-auto flex items-center justify-between gap-3">
          <Brand href="/" />
          <div className="flex items-center gap-0.5">
            <LocaleSwitcher
              current={locale}
              options={LOCALES.map((l) => ({ code: l, label: LOCALE_META[l].nativeLabel }))}
            />
            <ThemeToggle initial={themePref} />
          </div>
        </header>

        <div className="mx-auto w-full max-w-sm py-12">{children}</div>

        <footer className="mt-auto">
          <p className="max-w-sm text-2xs leading-relaxed text-[var(--text-faint)]">{t('auth.legal')}</p>
        </footer>
      </div>

      {/* --- proof column: real numbers from the local corpus, not marketing --- */}
      <aside className="relative hidden overflow-hidden border-s border-[var(--border-subtle)] bg-[var(--surface-sunken)] lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--text-primary) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative max-w-md">
          <p className="label-xs mb-3">{t('landing.hero.eyebrow')}</p>
          <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em]">
            {t('landing.hero.title')}
          </h2>
          <p className="mt-4 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            {t('landing.hero.body')}
          </p>

          <dl className="mt-9 grid grid-cols-3 gap-4">
            {[
              { v: stats.tenders, l: t('landing.stat.tenders') },
              { v: stats.buyers, l: t('landing.stat.buyers') },
              { v: stats.open, l: t('insights.openNow') },
            ].map((s) => (
              <div key={s.l}>
                <dd className="num text-xl font-semibold tabular-nums">{nf.format(s.v)}</dd>
                <dt className="mt-0.5 text-2xs leading-snug text-[var(--text-muted)]">{s.l}</dt>
              </div>
            ))}
          </dl>

          <ul className="mt-9 space-y-2.5">
            {[
              t('landing.feature.unified.title'),
              t('landing.feature.alerts.title'),
              t('landing.feature.pipeline.title'),
              t('landing.feature.calendar.title'),
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[0.8125rem]">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon.check size={11} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <p className="mt-9 text-2xs text-[var(--text-faint)]">
            <Link href="/" className="underline-offset-2 hover:underline">
              ← {t('common.back')}
            </Link>
          </p>
        </div>
      </aside>
    </div>
  )
}
