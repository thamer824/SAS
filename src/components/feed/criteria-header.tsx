import Link from 'next/link'
import { Icon, cx } from '@/components/ui/primitives'
import type { Translator } from '@/lib/i18n'

/**
 * "Vos appels d'offres — Génie Civil · Électricité, à Tunis · Sfax."
 *
 * The single most important piece of copy in the app. It closes the loop on the
 * form: the user answered four questions and this line proves the answers were
 * used. Without it the feed looks like an unfiltered list and the form looks
 * like it did nothing.
 */
export function CriteriaHeader({
  t,
  sectors,
  regions,
  count,
  showingMine,
  toggleHref,
  editHref,
}: {
  t: Translator
  sectors: string
  regions: string
  count: string
  showingMine: boolean
  toggleHref: string
  editHref: string
}) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] font-bold leading-tight tracking-[-0.02em] sm:text-[1.875rem]">
            {showingMine ? t('criteria.yourOffers') : t('criteria.showingAll')}
          </h1>

          {showingMine ? (
            <p className="mt-2 max-w-2xl text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)] bidi-isolate">{sectors}</span>
              <span className="text-[var(--text-muted)]"> · </span>
              <span className="bidi-isolate">{regions}</span>
            </p>
          ) : null}

          <p className="num mt-2 text-[0.9375rem] text-[var(--text-muted)]">
            {t('feed.simple.subtitle', { n: count })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* One tap between "what I asked for" and "everything". */}
          <Link
            href={toggleHref}
            className={cx(
              'inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-[0.9375rem] font-semibold transition-colors',
              showingMine
                ? 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
                : 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]',
            )}
          >
            {showingMine ? t('criteria.showAll') : t('criteria.showMine')}
          </Link>

          <Link
            href={editHref}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--border-subtle)] px-4 text-[0.9375rem] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
          >
            <Icon.settings size={16} />
            {t('form.edit')}
          </Link>
        </div>
      </div>
    </header>
  )
}
