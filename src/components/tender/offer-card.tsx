import Link from 'next/link'
import { Icon, cx } from '@/components/ui/primitives'
import { formatDate, pickLang, type Locale, type Translator } from '@/lib/i18n'
import { daysUntil } from '@/lib/tuneps/dates'
import { domainAccent } from '@/lib/tuneps/reference'
import type { TenderRow } from '@/lib/queries/tenders'

/**
 * The offer box — the one component that carries the product.
 *
 * Design rule: a contractor scanning on a phone must be able to answer three
 * questions without reading a full sentence — WHAT is it, WHO is buying, HOW
 * LONG do I have. Everything else (reference, procedure, price of the file) is
 * one tap away on the detail page and is deliberately not here.
 *
 * The remaining-days figure is the loudest thing in the box on purpose: it is
 * the only number that makes someone act today rather than next week.
 */

const DOMAIN_BAR: Record<number, string> = {
  1: 'bg-viz-1',
  2: 'bg-viz-2',
  3: 'bg-viz-3',
  4: 'bg-viz-4',
  6: 'bg-[var(--border-strong)]',
}

export function OfferCard({
  tender,
  locale,
  t,
  saved,
  score,
}: {
  tender: TenderRow
  locale: Locale
  t: Translator
  saved?: boolean
  /** Relevance or fit, shown only when it is high enough to be worth saying. */
  score?: number
}) {
  const title = pickLang(locale, tender.title_fr, tender.title_ar, tender.title_en)
  const sector = pickLang(locale, tender.category_label_fr, tender.category_label_ar)
  const nature = pickLang(locale, tender.domain_label_fr, tender.domain_label_ar)
  const gov = pickLang(locale, tender.gov_label_fr, tender.gov_label_ar)
  const left = daysUntil(tender.deadline_at)
  const accent = domainAccent(tender.domain_code)

  // Four states, four visual treatments. Grey for closed so the eye skips it.
  const urgency =
    left === null ? 'none' : left < 0 ? 'closed' : left === 0 ? 'today' : left <= 3 ? 'urgent' : 'ok'

  const countdown = {
    none: { text: '—', sub: '', cls: 'text-[var(--text-faint)]' },
    closed: { text: t('card.closed'), sub: '', cls: 'text-[var(--text-faint)]' },
    today: { text: t('card.today'), sub: '', cls: 'text-soon-600 dark:text-soon-500' },
    urgent: {
      text: String(left),
      sub: left === 1 ? t('card.dayLeft') : t('card.daysLeft'),
      cls: 'text-soon-600 dark:text-soon-500',
    },
    ok: {
      text: String(left),
      sub: left === 1 ? t('card.dayLeft') : t('card.daysLeft'),
      cls: 'text-[var(--text-primary)]',
    },
  }[urgency]

  const href = `/app/tenders/${encodeURIComponent(tender.id)}`

  return (
    <article
      className={cx(
        'panel group relative flex flex-col overflow-hidden transition-all duration-150',
        'hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-panel)]',
        urgency === 'urgent' || urgency === 'today' ? 'border-soon-500/40' : '',
        urgency === 'closed' && 'opacity-65',
      )}
    >
      {/* A 3px colour strip encodes the nature without spending a badge on it. */}
      <span
        className={cx('absolute inset-x-0 top-0 h-[3px]', DOMAIN_BAR[accent] ?? DOMAIN_BAR[6])}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col gap-3 p-4 pt-5">
        {/* --- top row: sector + countdown --- */}
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="clamp-1 text-2xs font-semibold uppercase tracking-wide text-[var(--text-muted)] bidi-isolate">
              {/* Fall back through sector → nature → type. A notice whose detail
                  has not been fetched yet has neither label, and a card headed
                  "—" reads as broken data rather than as pending enrichment. */}
              {sector || nature || t(tender.source === 'ao' ? 'source.ao' : 'source.consultation')}
            </span>
            {/* Only appels d'offres get a type badge. They are the minority and
                the larger contracts, so the badge carries information;
                stamping "Consultation" on ~90% of cards carried none. */}
            {tender.source === 'ao' ? (
              <span className="shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-px text-[0.5625rem] font-bold uppercase tracking-wide text-[var(--accent)]">
                {t('source.ao.short')}
              </span>
            ) : null}
          </span>

          <span className="flex shrink-0 items-baseline gap-1 leading-none">
            {urgency === 'urgent' ? (
              <span
                className="mb-0.5 inline-block size-1.5 self-center rounded-full bg-soon-500 animate-pulse-ring"
                aria-hidden="true"
              />
            ) : null}
            <span className={cx('num text-xl font-semibold tracking-tight', countdown.cls)}>
              {countdown.text}
            </span>
            {countdown.sub ? (
              <span className={cx('text-2xs font-medium', countdown.cls)}>{countdown.sub}</span>
            ) : null}
          </span>
        </div>

        {/* --- title: the biggest text in the box --- */}
        <h3 className="min-h-[2.6rem]">
          <Link
            href={href}
            className="clamp-2 text-[0.9375rem] font-semibold leading-snug tracking-[-0.008em] underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
            title={title}
          >
            {title}
          </Link>
        </h3>

        {/* --- who + where --- */}
        <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          <p className="flex items-start gap-1.5">
            <Icon.building size={13} className="mt-px shrink-0 text-[var(--text-faint)]" />
            <span className="clamp-1 bidi-isolate">{tender.buyer_name || '—'}</span>
          </p>
          <p className="flex items-center gap-3 text-[var(--text-muted)]">
            {gov ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon.globe size={12} className="shrink-0 text-[var(--text-faint)]" />
                <span className="truncate bidi-isolate">{gov}</span>
              </span>
            ) : null}
            <span className="num inline-flex items-center gap-1.5">
              <Icon.calendar size={12} className="shrink-0 text-[var(--text-faint)]" />
              {formatDate(tender.deadline_at, locale)}
            </span>
          </p>
        </div>

        {/* --- action row --- */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {t('feed.viewOffer')}
            <Icon.chevronRight size={13} className="flip-rtl" />
          </Link>

          {/* No relevance number here. The feed is already filtered to the
              user's own criteria, so a bare "62" explained nothing and read as
              a mysterious code — the exact kind of thing that makes software
              feel unapproachable. The score still drives ordering and lives on
              the detail page with a label. */}
          {saved ? (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]"
              title={t('feed.saved')}
            >
              <Icon.bookmark size={14} />
              {t('feed.saved')}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/** The grid the cards live in. Three across on desktop, one on a phone. */
export function OfferGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>
  )
}
