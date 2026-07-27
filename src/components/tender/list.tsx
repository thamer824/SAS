import Link from 'next/link'
import { cx, EmptyState, Icon } from '@/components/ui/primitives'
import {
  DeadlinePill,
  DomainChip,
  MetaChips,
  ScorePill,
  SourceBadge,
  TenderTitleLink,
} from './bits'
import { formatRelative, pickLang, type Locale, type Translator } from '@/lib/i18n'
import type { TenderRow } from '@/lib/queries/tenders'

export interface TenderListItem {
  tender: TenderRow
  /** Watchlist relevance or company-fit score, when available. */
  score?: number
  scoreLabel?: string
  inPipeline?: boolean
}

/**
 * Dense table for scanning. Deliberately not a client-side data grid: the rows
 * are server-rendered, sorting is a URL param, and the whole thing stays fast
 * on the low-end Android hardware a lot of this audience uses.
 */
export function TenderTable({
  items,
  locale,
  t,
  showScore,
  scoreHeader,
}: {
  items: TenderListItem[]
  locale: Locale
  t: Translator
  showScore?: boolean
  /** Defaults to the company-fit label; watchlists pass "relevance". */
  scoreHeader?: string
}) {
  if (!items.length) {
    return <EmptyState icon={<Icon.search size={20} />} title={t('common.noResults')} body={t('common.noResultsHint')} />
  }

  return (
    <div className="overflow-x-auto">
      {/* 46rem min-width, not 54: this table also renders inside a column that
          sits next to an 18rem sidebar, where a wider floor clipped the score.
          The sector column folds away below xl instead. */}
      <table className="w-full min-w-[46rem] border-collapse text-start">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-start">
            <Th className="w-[42%]">{t('tender.title')}</Th>
            <Th className="w-[20%]">{t('tender.buyer')}</Th>
            <Th className="hidden w-[13%] xl:table-cell">{t('tender.category')}</Th>
            <Th className="w-[11%]">{t('tender.published')}</Th>
            <Th className="w-[12%]">{t('tender.deadline')}</Th>
            {showScore ? (
              <Th className="w-[8%] text-end">{scoreHeader ?? t('dash.fitScore')}</Th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map(({ tender, score, scoreLabel, inPipeline }) => (
            <tr
              key={tender.id}
              className="group border-b border-[var(--border-subtle)] align-top transition-colors last:border-0 hover:bg-[var(--surface-hover)]"
            >
              <td className="py-2.5 pe-3 ps-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <SourceBadge source={tender.source} t={t} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <TenderTitleLink tender={tender} locale={locale} className="text-[0.8125rem]" />
                    <span className="num mt-1 flex flex-wrap items-center gap-2 text-2xs text-[var(--text-faint)]">
                      <span className="font-mono">{tender.reference}</span>
                      {tender.mod_seq !== '00' ? (
                        <span className="text-soon-600 dark:text-soon-500">rév. {tender.mod_seq}</span>
                      ) : null}
                      {inPipeline ? (
                        <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">
                          <Icon.bookmark size={10} />
                          {t('feed.inPipeline')}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </div>
              </td>
              <td className="py-2.5 pe-3">
                {tender.buyer_code ? (
                  <Link
                    href={`/app/buyers/${encodeURIComponent(tender.buyer_code)}`}
                    className="clamp-2 text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
                  >
                    {tender.buyer_name || '—'}
                  </Link>
                ) : (
                  <span className="clamp-2 text-xs text-[var(--text-secondary)] bidi-isolate">
                    {tender.buyer_name || '—'}
                  </span>
                )}
              </td>
              <td className="hidden py-2.5 pe-3 xl:table-cell">
                <span className="clamp-2 text-xs text-[var(--text-muted)] bidi-isolate">
                  {pickLang(locale, tender.category_label_fr, tender.category_label_ar) || '—'}
                </span>
              </td>
              <td className="num py-2.5 pe-3 text-xs text-[var(--text-muted)]">
                {formatRelative(tender.published_at, locale)}
              </td>
              <td className="py-2.5 pe-3">
                <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} />
              </td>
              {showScore ? (
                <td className="py-2.5 pe-3 text-end">
                  {score !== undefined ? (
                    <span className="inline-flex justify-end">
                      <ScorePill score={score} label={scoreLabel} />
                    </span>
                  ) : (
                    <span className="text-2xs text-[var(--text-faint)]">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx('label-xs px-3 pb-2 pt-3 text-start font-semibold', className)}
    >
      {children}
    </th>
  )
}

/**
 * Card view. Better on mobile and better when titles are long — which Arabic
 * titles almost always are.
 */
export function TenderCards({
  items,
  locale,
  t,
}: {
  items: TenderListItem[]
  locale: Locale
  t: Translator
}) {
  if (!items.length) {
    return <EmptyState icon={<Icon.search size={20} />} title={t('common.noResults')} body={t('common.noResultsHint')} />
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ tender, score, scoreLabel, inPipeline }) => (
        <li
          key={tender.id}
          className="panel flex flex-col gap-2.5 p-3.5 transition-colors hover:border-[var(--border-strong)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={tender.source} t={t} />
              <DomainChip tender={tender} locale={locale} />
            </div>
            {score !== undefined ? <ScorePill score={score} label={scoreLabel} /> : null}
          </div>

          <TenderTitleLink tender={tender} locale={locale} className="text-[0.8125rem]" />

          <p className="clamp-1 text-xs text-[var(--text-secondary)] bidi-isolate">
            {tender.buyer_name || '—'}
          </p>

          <MetaChips tender={tender} locale={locale} t={t} max={2} />

          <div className="mt-auto flex items-end justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
            <span className="flex flex-col gap-0.5">
              <span className="label-xs">{t('tender.deadline')}</span>
              <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} />
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="num font-mono text-2xs text-[var(--text-faint)]">{tender.reference}</span>
              {inPipeline ? (
                <span className="inline-flex items-center gap-0.5 text-2xs text-[var(--accent)]">
                  <Icon.bookmark size={10} />
                  {t('feed.inPipeline')}
                </span>
              ) : null}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Compact rows for sidebars and dashboard panels. */
export function TenderMiniList({
  items,
  locale,
  t,
  emptyLabel,
}: {
  items: TenderListItem[]
  locale: Locale
  t: Translator
  emptyLabel?: string
}) {
  if (!items.length) {
    return <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">{emptyLabel ?? t('common.noResults')}</p>
  }

  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {items.map(({ tender, score }) => (
        <li key={tender.id} className="px-4 py-2.5 transition-colors hover:bg-[var(--surface-hover)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <TenderTitleLink tender={tender} locale={locale} className="text-xs" />
              <p className="clamp-1 mt-1 text-2xs text-[var(--text-muted)] bidi-isolate">
                {tender.buyer_name || '—'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} showDate={false} />
              {score !== undefined ? <ScorePill score={score} /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
