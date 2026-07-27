import Link from 'next/link'
import { Icon, cx } from '@/components/ui/primitives'
import { buildQuery, toggleQuery, type ParsedFeed, type SearchParams } from '@/lib/queries/params'
import { categoriesByDomain, entries, governorates, label } from '@/lib/tuneps/reference'
import type { Locale, Translator } from '@/lib/i18n'

/**
 * Filters are links, not form state.
 *
 * Every control is an <a> that patches the query string, so the panel works
 * with JavaScript disabled, every state is addressable, and the server does the
 * filtering it is already doing anyway. No client bundle at all.
 */

const SECTION_TITLE = 'label-xs mb-2 block'

function FilterLink({
  href,
  active,
  children,
  count,
}: {
  href: string
  active: boolean
  children: React.ReactNode
  count?: number
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cx(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors bidi-isolate',
        active
          ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
      )}
    >
      <span
        className={cx(
          'grid size-3.5 shrink-0 place-items-center rounded border transition-colors',
          active
            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
            : 'border-[var(--border-strong)]',
        )}
        aria-hidden="true"
      >
        {active ? <Icon.check size={9} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined ? <span className="num text-2xs text-[var(--text-faint)]">{count}</span> : null}
    </Link>
  )
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-b border-[var(--border-subtle)] px-3 py-3 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className={cx(SECTION_TITLE, 'mb-0')}>{title}</span>
        <Icon.chevronDown
          size={13}
          className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-2.5 space-y-0.5">{children}</div>
    </details>
  )
}

export function FilterPanel({
  params,
  parsed,
  locale,
  t,
  facets,
  collapsible,
}: {
  params: SearchParams
  parsed: ParsedFeed
  locale: Locale
  t: Translator
  facets?: { domains?: Record<string, number>; govs?: Record<string, number> }
  /**
   * Mobile: collapse the whole panel behind a summary so results sit above the
   * fold. Ten expanded filter sections is a page of scrolling before the first
   * notice — unusable on the phones much of this audience works from.
   */
  collapsible?: boolean
}) {
  const { raw } = parsed

  const statusOptions = [
    { value: 'open', label: t('status.open') },
    { value: 'closing', label: t('feed.closingSoon') },
    { value: 'all', label: t('common.all') },
    { value: 'closed', label: t('status.closed') },
  ]

  const sinceOptions = [
    { value: 1, label: t('common.today') },
    { value: 7, label: '7 j' },
    { value: 30, label: '30 j' },
    { value: 90, label: '90 j' },
  ]

  const leadOptions = [7, 14, 30]

  const heading = (
    <>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Icon.filter size={13} />
        {t('feed.filters')}
        {parsed.activeCount > 0 ? (
          <span className="num rounded-full bg-[var(--accent)] px-1.5 text-2xs font-bold text-[var(--accent-fg)]">
            {parsed.activeCount}
          </span>
        ) : null}
      </span>
      {parsed.activeCount > 0 ? (
        <Link
          href="/app"
          scroll={false}
          className="text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          {t('feed.filters.clear')}
        </Link>
      ) : null}
    </>
  )

  const Root = collapsible ? 'details' : 'div'
  const Head = collapsible ? 'summary' : 'header'

  // `group/panel` is a NAMED group on purpose: the Sections below are nested
  // <details> that also use group-open, and an unnamed group would let the outer
  // panel's open state rotate their chevrons too.
  return (
    <Root className="panel group/panel overflow-hidden">
      <Head
        className={cx(
          'flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5',
          collapsible && 'cursor-pointer list-none',
        )}
      >
        {heading}
        {collapsible ? (
          <Icon.chevronDown
            size={14}
            className="ms-auto shrink-0 text-[var(--text-faint)] transition-transform group-open/panel:rotate-180"
          />
        ) : null}
      </Head>

      {/* --- status --- */}
      <Section title={t('feed.filters.status')}>
        {statusOptions.map((o) => (
          <FilterLink
            key={o.value}
            href={buildQuery(params, { status: o.value === 'open' ? null : o.value })}
            active={raw.status === o.value}
          >
            {o.label}
          </FilterLink>
        ))}
      </Section>

      {/* --- source --- */}
      <Section title={t('tender.source')}>
        <FilterLink
          href={toggleQuery(params, 'source', 'ao')}
          active={raw.sources.includes('ao')}
        >
          {t('source.ao')}
        </FilterLink>
        <FilterLink
          href={toggleQuery(params, 'source', 'consultation')}
          active={raw.sources.includes('consultation')}
        >
          {t('source.consultation')}
        </FilterLink>
      </Section>

      {/* --- nature (pbk) --- */}
      <Section title={t('tender.domain')}>
        {entries('domain').map((d) => (
          <FilterLink
            key={d.code}
            href={toggleQuery(params, 'domain', d.code)}
            active={raw.domains.includes(d.code)}
            count={facets?.domains?.[d.code]}
          >
            {locale === 'ar' ? d.ar || d.fr : d.fr}
          </FilterLink>
        ))}
      </Section>

      {/* --- sector, grouped under its nature --- */}
      <Section title={t('tender.category')} defaultOpen={raw.categories.length > 0}>
        <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
          {categoriesByDomain(locale).map((group) => (
            <div key={group.domain}>
              <p className="mb-1 mt-1 px-2 text-2xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                {group.domainLabel}
              </p>
              {group.items.map((c) => (
                <FilterLink
                  key={c.code}
                  href={toggleQuery(params, 'cat', c.code)}
                  active={raw.categories.includes(c.code)}
                >
                  {locale === 'ar' ? c.ar || c.fr : c.fr}
                </FilterLink>
              ))}
            </div>
          ))}
        </div>
      </Section>

      {/* --- governorate --- */}
      <Section title={t('tender.governorate')} defaultOpen={raw.govs.length > 0}>
        <div className="max-h-64 overflow-y-auto pe-1">
          {governorates().map((g) => (
            <FilterLink
              key={g.code}
              href={toggleQuery(params, 'gov', g.code)}
              active={raw.govs.includes(g.code)}
              count={facets?.govs?.[g.code]}
            >
              {locale === 'ar' ? g.ar || g.fr : g.fr}
            </FilterLink>
          ))}
        </div>
      </Section>

      {/* --- procedure --- */}
      <Section title={t('tender.procedure')} defaultOpen={false}>
        {entries('procedure').map((p) => (
          <FilterLink
            key={p.code}
            href={toggleQuery(params, 'proc', p.code)}
            active={raw.procedures.includes(p.code)}
          >
            {locale === 'ar' ? p.ar || p.fr : p.fr}
          </FilterLink>
        ))}
        <FilterLink
          href={toggleQuery(params, 'proc', 'consultation')}
          active={raw.procedures.includes('consultation')}
        >
          {t('source.consultation')}
        </FilterLink>
      </Section>

      {/* --- dates --- */}
      <Section title={t('feed.publishedSince')} defaultOpen={false}>
        {sinceOptions.map((o) => (
          <FilterLink
            key={o.value}
            href={buildQuery(params, { since: raw.since === o.value ? null : o.value })}
            active={raw.since === o.value}
          >
            {o.label}
          </FilterLink>
        ))}
      </Section>

      <Section title={t('feed.minLeadTime')} defaultOpen={false}>
        {leadOptions.map((d) => (
          <FilterLink
            key={d}
            href={buildQuery(params, { lead: raw.minLead === d ? null : d })}
            active={raw.minLead === d}
          >
            ≥ {d} {t('tender.days')}
          </FilterLink>
        ))}
      </Section>

      {/* --- flags --- */}
      <Section title={t('feed.filters.options')} defaultOpen={false}>
        <FilterLink href={buildQuery(params, { intl: !raw.international })} active={raw.international}>
          {t('tender.international')}
        </FilterLink>
        <FilterLink href={buildQuery(params, { framework: !raw.framework })} active={raw.framework}>
          {t('tender.framework')}
        </FilterLink>
      </Section>
    </Root>
  )
}

/** Removable chips summarising the active filters, above the results. */
export function ActiveFilterChips({
  params,
  parsed,
  locale,
  t,
  buyerNames,
}: {
  params: SearchParams
  parsed: ParsedFeed
  locale: Locale
  t: Translator
  buyerNames?: Record<string, string>
}) {
  const { raw } = parsed
  const chips: Array<{ key: string; label: string; href: string }> = []

  if (raw.q) {
    chips.push({ key: 'q', label: `“${raw.q}”`, href: buildQuery(params, { q: null }) })
  }
  for (const s of raw.sources) {
    chips.push({
      key: `source-${s}`,
      label: s === 'ao' ? t('source.ao') : t('source.consultation'),
      href: toggleQuery(params, 'source', s),
    })
  }
  for (const d of raw.domains) {
    chips.push({ key: `domain-${d}`, label: label('domain', d, locale), href: toggleQuery(params, 'domain', d) })
  }
  for (const c of raw.categories) {
    chips.push({ key: `cat-${c}`, label: label('category', c, locale), href: toggleQuery(params, 'cat', c) })
  }
  for (const g of raw.govs) {
    chips.push({ key: `gov-${g}`, label: label('gov', g, locale), href: toggleQuery(params, 'gov', g) })
  }
  for (const p of raw.procedures) {
    chips.push({
      key: `proc-${p}`,
      label: p === 'consultation' ? t('source.consultation') : label('procedure', p, locale),
      href: toggleQuery(params, 'proc', p),
    })
  }
  for (const b of raw.buyers) {
    chips.push({
      key: `buyer-${b}`,
      label: buyerNames?.[b] ?? b,
      href: toggleQuery(params, 'buyer', b),
    })
  }
  if (raw.status !== 'open') {
    const map: Record<string, string> = {
      all: t('common.all'),
      closing: t('feed.closingSoon'),
      closed: t('status.closed'),
    }
    chips.push({ key: 'status', label: map[raw.status] ?? raw.status, href: buildQuery(params, { status: null }) })
  }
  if (raw.since) {
    chips.push({
      key: 'since',
      label: `${t('feed.publishedSince')} ${raw.since} j`,
      href: buildQuery(params, { since: null }),
    })
  }
  if (raw.minLead) {
    chips.push({
      key: 'lead',
      label: `≥ ${raw.minLead} ${t('tender.days')}`,
      href: buildQuery(params, { lead: null }),
    })
  }
  if (raw.deadlineBefore) {
    chips.push({
      key: 'before',
      label: `${t('feed.deadlineBefore')} ${raw.deadlineBefore}`,
      href: buildQuery(params, { before: null }),
    })
  }
  if (raw.international) {
    chips.push({ key: 'intl', label: t('tender.international'), href: buildQuery(params, { intl: null }) })
  }
  if (raw.framework) {
    chips.push({ key: 'framework', label: t('tender.framework'), href: buildQuery(params, { framework: null }) })
  }

  if (!chips.length) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          scroll={false}
          className="group inline-flex max-w-[16rem] items-center gap-1.5 rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-2xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-active)] bidi-isolate"
        >
          <span className="truncate">{c.label}</span>
          <Icon.x size={11} className="shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent)]" />
        </Link>
      ))}
      <Link
        href="/app"
        scroll={false}
        className="ms-1 text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
      >
        {t('feed.filters.clear')}
      </Link>
    </div>
  )
}
