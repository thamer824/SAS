import Link from 'next/link'
import { Badge, Chip, cx, Icon } from '@/components/ui/primitives'
import { formatCountdown, formatDate, pickLang, type Locale, type Translator } from '@/lib/i18n'
import { statusFor } from '@/lib/tuneps/dates'
import { domainAccent } from '@/lib/tuneps/reference'
import type { TenderRow } from '@/lib/queries/tenders'

/**
 * Shared tender presentation atoms.
 *
 * Everything here is a server component: the feed renders hundreds of rows, and
 * shipping this as client JS would cost far more than it could ever save.
 */

export function SourceBadge({ source, t }: { source: 'ao' | 'consultation'; t: Translator }) {
  return source === 'ao' ? (
    <Badge tone="brand" title={t('source.ao')}>
      {t('source.ao.short')}
    </Badge>
  ) : (
    <Badge tone="info" title={t('source.consultation')}>
      {t('source.consultation.short')}
    </Badge>
  )
}

/**
 * The single most important cell in the product: how long is left.
 * Colour carries the urgency, text carries the precision, and both are present
 * so the signal survives colour-blindness and greyscale printing.
 */
export function DeadlinePill({
  deadline,
  t,
  locale,
  showDate = true,
}: {
  deadline: string | null
  t: Translator
  locale: Locale
  showDate?: boolean
}) {
  const { text, urgency } = formatCountdown(deadline, t)

  const tone =
    urgency === 'past'
      ? 'text-[var(--text-faint)]'
      : urgency === 'critical'
        ? 'text-soon-600 dark:text-soon-500 font-semibold'
        : urgency === 'soon'
          ? 'text-soon-600 dark:text-soon-500'
          : 'text-[var(--text-primary)]'

  return (
    <span className="inline-flex flex-col items-start gap-0.5 leading-tight">
      <span className={cx('num inline-flex items-center gap-1 text-xs', tone)}>
        {urgency === 'critical' ? (
          <span
            className="inline-block size-1.5 shrink-0 rounded-full bg-soon-500 animate-pulse-ring"
            aria-hidden="true"
          />
        ) : null}
        {text}
      </span>
      {showDate ? (
        <span className="num text-2xs text-[var(--text-faint)]">{formatDate(deadline, locale)}</span>
      ) : null}
    </span>
  )
}

export function StatusBadge({ deadline, t }: { deadline: string | null; t: Translator }) {
  const status = statusFor(deadline)
  const map = {
    open: { tone: 'live', key: 'status.open' },
    closing: { tone: 'soon', key: 'status.closing' },
    closed: { tone: 'gone', key: 'status.closed' },
    unknown: { tone: 'neutral', key: 'status.unknown' },
  } as const
  const { tone, key } = map[status]
  return <Badge tone={tone}>{t(key)}</Badge>
}

export function DomainChip({ tender, locale }: { tender: TenderRow; locale: Locale }) {
  const label = pickLang(locale, tender.domain_label_fr, tender.domain_label_ar)
  if (!label) return null
  const accent = domainAccent(tender.domain_code)
  return (
    <Badge tone={`viz${accent === 6 ? 1 : accent}` as 'viz1' | 'viz2' | 'viz3' | 'viz4'}>{label}</Badge>
  )
}

export function MetaChips({
  tender,
  locale,
  t,
  max = 3,
}: {
  tender: TenderRow
  locale: Locale
  t: Translator
  max?: number
}) {
  const chips: string[] = []
  const category = pickLang(locale, tender.category_label_fr, tender.category_label_ar)
  const gov = pickLang(locale, tender.gov_label_fr, tender.gov_label_ar)
  const procedure = pickLang(locale, tender.procedure_label_fr, tender.procedure_label_ar)

  if (category) chips.push(category)
  if (gov) chips.push(gov)
  if (procedure && tender.source === 'ao') chips.push(procedure)

  const shown = chips.slice(0, max)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <Chip key={c} title={c}>
          {c}
        </Chip>
      ))}
      {tender.is_international ? <Chip title={t('tender.international')}>🌍</Chip> : null}
      {tender.is_framework ? <Chip>{t('tender.framework')}</Chip> : null}
    </div>
  )
}

/** Relevance / fit score, rendered as a compact meter with the number. */
export function ScorePill({ score, label }: { score: number; label?: string }) {
  const band = score >= 65 ? 'high' : score >= 40 ? 'mid' : 'low'
  const barColor =
    band === 'high' ? 'bg-live-500' : band === 'mid' ? 'bg-viz-5' : 'bg-[var(--border-strong)]'
  const textColor =
    band === 'high'
      ? 'text-live-600 dark:text-live-500'
      : band === 'mid'
        ? 'text-[var(--text-secondary)]'
        : 'text-[var(--text-muted)]'

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className="relative block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--surface-active)]"
        role="img"
        aria-label={`${score}/100`}
      >
        <span
          className={cx('absolute inset-y-0 start-0 rounded-full', barColor)}
          style={{ width: `${Math.max(4, score)}%` }}
        />
      </span>
      <span className={cx('num text-2xs font-semibold', textColor)}>{score}</span>
    </span>
  )
}

export function TenderTitleLink({
  tender,
  locale,
  className,
}: {
  tender: TenderRow
  locale: Locale
  className?: string
}) {
  const title = pickLang(locale, tender.title_fr, tender.title_ar, tender.title_en)
  return (
    <Link
      href={`/app/tenders/${encodeURIComponent(tender.id)}`}
      className={cx(
        'clamp-2 font-medium leading-snug text-[var(--text-primary)] bidi-isolate',
        'underline-offset-2 hover:text-[var(--accent)] hover:underline',
        className,
      )}
      title={title}
    >
      {title}
    </Link>
  )
}

export function TunepsSourceLink({
  tender,
  t,
  compact,
}: {
  tender: Pick<TenderRow, 'source' | 'source_id' | 'reference'>
  t: Translator
  compact?: boolean
}) {
  const href =
    tender.source === 'ao'
      ? `https://www.tuneps.tn/portail/offres/details/${tender.source_id}/${tender.reference}`
      : `https://www.tuneps.tn/portail/consultations/consultationdetails/${tender.source_id}/${tender.reference}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
    >
      <Icon.external size={13} />
      {compact ? 'TUNEPS' : t('tender.viewOnTuneps')}
    </a>
  )
}
