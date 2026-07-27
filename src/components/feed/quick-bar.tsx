import Link from 'next/link'
import { Icon, cx } from '@/components/ui/primitives'
import { buildQuery, toggleQuery, type ParsedFeed, type SearchParams } from '@/lib/queries/params'
import { entries } from '@/lib/tuneps/reference'
import type { Locale, Translator } from '@/lib/i18n'

/**
 * The only filter UI most users will ever touch.
 *
 * One horizontal row: a few intent presets, then the four natures, then the
 * sectors that actually have volume. The full 10-section panel still exists but
 * lives behind "Plus de filtres" — power without the tax on everyone else.
 *
 * Sector chips are chosen by real publication volume rather than alphabetically,
 * because a list that starts at "Ascenseur" looks empty and a list that starts
 * at "Génie Civil" looks like the product works.
 */

/** Sector codes worth a chip, ordered by 90-day volume (see reference tables). */
const TOP_SECTORS = ['301', '501', '115', '503', '109', '121', '303', '319', '330', '701'] as const

function Chip({
  href,
  active,
  children,
  tone = 'default',
}: {
  href: string
  active: boolean
  children: React.ReactNode
  tone?: 'default' | 'accent' | 'warn'
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-xs font-medium transition-colors bidi-isolate',
        active
          ? tone === 'warn'
            ? 'border-soon-500 bg-[var(--color-soon-100)] text-soon-600 dark:text-soon-500'
            : 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
      )}
    >
      {children}
    </Link>
  )
}

export function QuickBar({
  params,
  parsed,
  locale,
  t,
  feedPath,
  hasAlerts,
  showAdvanced,
}: {
  params: SearchParams
  parsed: ParsedFeed
  locale: Locale
  t: Translator
  feedPath: string
  /** Enables the "Pour moi" preset, which needs at least one alert to mean anything. */
  hasAlerts: boolean
  showAdvanced: boolean
}) {
  const { raw } = parsed
  const pick = (fr: string, ar: string) => (locale === 'ar' ? ar || fr : fr || ar)

  const natures = entries('domain')
  const sectorTable = new Map(entries('category').map((c) => [c.code, c]))
  const sectors = TOP_SECTORS.map((code) => sectorTable.get(code)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  )

  const nothingActive =
    !raw.domains.length && !raw.categories.length && raw.status === 'open' && !raw.mine

  return (
    <div className="mb-4 space-y-2.5">
      {/* --- row 1: intent presets --- */}
      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:px-0">
        <Chip href={feedPath} active={nothingActive}>
          {t('feed.quick.all')}
        </Chip>

        {hasAlerts ? (
          <Chip href={buildQuery(params, { mine: !raw.mine })} active={raw.mine}>
            <Icon.spark size={12} />
            {t('feed.quick.forMe')}
          </Chip>
        ) : null}

        <Chip
          href={buildQuery(params, { status: raw.status === 'closing' ? null : 'closing' })}
          active={raw.status === 'closing'}
          tone="warn"
        >
          <Icon.clock size={12} />
          {t('feed.quick.closing')}
        </Chip>

        <Chip
          href={buildQuery(params, { since: raw.since === 3 ? null : 3 })}
          active={raw.since === 3}
        >
          {t('feed.quick.new')}
        </Chip>

        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border-subtle)]" aria-hidden="true" />

        {natures.map((n) => (
          <Chip
            key={n.code}
            href={toggleQuery(params, 'domain', n.code)}
            active={raw.domains.includes(n.code)}
          >
            {pick(n.fr, n.ar)}
          </Chip>
        ))}
      </div>

      {/* --- row 2: high-volume sectors --- */}
      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:px-0">
        {sectors.map((s) => (
          <Chip
            key={s.code}
            href={toggleQuery(params, 'cat', s.code)}
            active={raw.categories.includes(s.code)}
          >
            {pick(s.fr, s.ar)}
          </Chip>
        ))}

        <Link
          href={buildQuery(params, { adv: showAdvanced ? null : true })}
          scroll={false}
          className={cx(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            showAdvanced
              ? 'bg-[var(--surface-active)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
          )}
        >
          <Icon.filter size={12} />
          {showAdvanced ? t('feed.less') : t('feed.more')}
          {parsed.activeCount > 0 && !showAdvanced ? (
            <span className="num rounded-full bg-[var(--accent)] px-1.5 text-[0.5625rem] font-bold text-[var(--accent-fg)]">
              {parsed.activeCount}
            </span>
          ) : null}
        </Link>
      </div>
    </div>
  )
}

/**
 * "You have N new matches" strip. Sits above the grid so the value of having set
 * up alerts is visible on the page they land on, not buried in a bell icon.
 */
export function AlertStrip({
  count,
  t,
  href,
  emptyHref,
  hasAlerts,
}: {
  count: number
  t: Translator
  href: string
  emptyHref: string
  hasAlerts: boolean
}) {
  if (!hasAlerts) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
        <p className="inline-flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
          <Icon.bell size={15} className="shrink-0 text-[var(--text-faint)]" />
          {t('feed.noAlerts')}
        </p>
        <Link
          href={emptyHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          {t('feed.noAlerts.cta')}
          <Icon.arrowRight size={13} className="flip-rtl" />
        </Link>
      </div>
    )
  }

  if (count <= 0) return null

  return (
    <Link
      href={href}
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 transition-colors hover:border-[var(--accent)]/50"
    >
      <p className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-[var(--accent)]">
        <Icon.spark size={15} className="shrink-0" />
        {t('feed.newSince', { n: count })}
      </p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
        {t('feed.newSince.cta')}
        <Icon.chevronRight size={13} className="flip-rtl" />
      </span>
    </Link>
  )
}
