import Link from 'next/link'
import { Icon, cx } from '@/components/ui/primitives'
import { buildQuery, type ParsedFeed, type SearchParams } from '@/lib/queries/params'
import type { Translator } from '@/lib/i18n'

/** Sort + view switch + export, all URL-driven. */
export function FeedToolbar({
  params,
  parsed,
  t,
  total,
  formattedTotal,
  csvHref,
  saveHref,
}: {
  params: SearchParams
  parsed: ParsedFeed
  t: Translator
  total: number
  formattedTotal: string
  csvHref: string
  saveHref: string
}) {
  const sorts = [
    { value: 'newest', label: t('feed.sort.newest') },
    { value: 'deadline', label: t('feed.sort.deadline') },
    ...(parsed.raw.q ? [{ value: 'relevance', label: t('feed.sort.relevance') }] : []),
    { value: 'buyer', label: t('feed.sort.buyer') },
  ]

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {/* The count is only worth restating once the view is filtered — the page
          subtitle already gives the unfiltered total. */}
      {parsed.activeCount > 0 ? (
        <p className="num text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-primary)]">{formattedTotal}</span>{' '}
          {total === 1 ? t('common.result') : t('common.results')}
        </p>
      ) : (
        <span />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* sort */}
        <div className="flex items-center rounded-lg border border-[var(--border-subtle)] p-0.5">
          {sorts.map((s) => (
            <Link
              key={s.value}
              href={buildQuery(params, { sort: s.value === 'newest' ? null : s.value })}
              scroll={false}
              className={cx(
                'rounded-md px-2 py-1 text-2xs font-medium transition-colors',
                parsed.raw.sort === s.value
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {/* view */}
        <div className="flex items-center rounded-lg border border-[var(--border-subtle)] p-0.5">
          {(
            [
              { value: 'table', icon: 'menu' as const, label: t('feed.view.table') },
              { value: 'cards', icon: 'layers' as const, label: t('feed.view.cards') },
            ] satisfies Array<{ value: string; icon: 'menu' | 'layers'; label: string }>
          ).map((v) => {
            const Ico = Icon[v.icon]
            const active = parsed.view === v.value
            return (
              <Link
                key={v.value}
                href={buildQuery(params, { view: v.value === 'table' ? null : v.value })}
                scroll={false}
                title={v.label}
                aria-label={v.label}
                className={cx(
                  'grid size-6 place-items-center rounded-md transition-colors',
                  active
                    ? 'bg-[var(--surface-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                <Ico size={13} />
              </Link>
            )
          })}
        </div>

        {/* "Créer une alerte", not "Enregistrer comme veille": same action, a
            word the audience already uses. Only offered once the view is
            actually filtered — an alert on "everything" is a spam machine. */}
        {parsed.activeCount > 0 ? (
          <Link
            href={saveHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-1.5 text-2xs font-semibold text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
            title={t('feed.saveAsWatchlist.hint')}
          >
            <Icon.bell size={13} />
            {t('feed.createAlert')}
          </Link>
        ) : null}

        <a
          href={csvHref}
          className="grid size-7 place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          title={t('feed.exportCsv')}
          aria-label={t('feed.exportCsv')}
        >
          <Icon.download size={13} />
        </a>
      </div>
    </div>
  )
}

export function Pagination({
  params,
  page,
  total,
  pageSize,
  t,
}: {
  params: SearchParams
  page: number
  total: number
  pageSize: number
  t: Translator
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null

  // Windowed page list: first, last, and ±2 around the current page.
  const window = new Set<number>([1, pages, page])
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 1) window.add(page - d)
    if (page + d <= pages) window.add(page + d)
  }
  const list = [...window].sort((a, b) => a - b)

  return (
    <nav className="mt-5 flex items-center justify-center gap-1" aria-label={t('common.page')}>
      <Link
        href={buildQuery(params, { page: page > 2 ? page - 1 : null })}
        scroll={false}
        aria-disabled={page === 1}
        className={cx(
          'grid size-8 place-items-center rounded-lg border border-[var(--border-subtle)] transition-colors',
          page === 1
            ? 'pointer-events-none opacity-40'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
        )}
        aria-label={t('common.previous')}
      >
        <Icon.chevronRight size={14} className="rotate-180 flip-rtl" />
      </Link>

      {list.map((p, i) => {
        const gap = i > 0 && p - list[i - 1] > 1
        return (
          <span key={p} className="flex items-center gap-1">
            {gap ? <span className="px-1 text-2xs text-[var(--text-faint)]">…</span> : null}
            <Link
              href={buildQuery(params, { page: p === 1 ? null : p })}
              scroll={false}
              aria-current={p === page ? 'page' : undefined}
              className={cx(
                'num grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-medium transition-colors',
                p === page
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
              )}
            >
              {p}
            </Link>
          </span>
        )
      })}

      <Link
        href={buildQuery(params, { page: page < pages ? page + 1 : page })}
        scroll={false}
        aria-disabled={page === pages}
        className={cx(
          'grid size-8 place-items-center rounded-lg border border-[var(--border-subtle)] transition-colors',
          page === pages
            ? 'pointer-events-none opacity-40'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
        )}
        aria-label={t('common.next')}
      >
        <Icon.chevronRight size={14} className="flip-rtl" />
      </Link>
    </nav>
  )
}
