import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { formatDate, formatNumber, getLocale, translator, type Locale } from '@/lib/i18n'
import {
  byDomain,
  byGovernorate,
  headline,
  leadTimes,
  topBuyers,
  weekdayCadence,
  weeklyVolume,
  type Window,
} from '@/lib/queries/insights'
import { label } from '@/lib/tuneps/reference'
import { PageHeader, Panel, PanelHeader, Stat, cx } from '@/components/ui/primitives'
import {
  ChartTable,
  ColumnChart,
  CompositionBar,
  RankedBars,
  TimeSeriesChart,
} from '@/components/charts/charts'
import type { SearchParams } from '@/lib/queries/params'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('insights.title') }
}

const WINDOWS: Array<{ value: Window; key: 'insights.window.30' | 'insights.window.90' | 'insights.window.365' | 'insights.window.all' }> = [
  { value: 30, key: 'insights.window.30' },
  { value: 90, key: 'insights.window.90' },
  { value: 365, key: 'insights.window.365' },
  { value: 0, key: 'insights.window.all' },
]

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireUser('/app/insights')
  const locale = await getLocale()
  const t = translator(locale)
  const params = await searchParams

  const raw = Array.isArray(params.window) ? params.window[0] : params.window
  const window: Window = ([30, 90, 365, 0] as Window[]).includes(Number(raw) as Window)
    ? (Number(raw) as Window)
    : 90

  const head = headline(window)
  const weekly = weeklyVolume(window, 26)
  const domains = byDomain(window)
  const govs = byGovernorate(window, 12)
  const buyers = topBuyers(window, 12)
  const lead = leadTimes(window)
  const cadence = weekdayCadence(window)

  const nf = (n: number) => formatNumber(n, locale)

  const domainSlices = domains.slice(0, 6).map((d, i) => ({
    label: label('domain', d.code, locale),
    value: d.count,
    slot: i,
  }))

  const weekdayNames = weekdayLabels(locale)
  const maxCadence = Math.max(...cadence.map((c) => c.count), 0)

  // Emphasise the bucket containing the median — one highlight, not a second hue.
  const leadColumns = lead.buckets.map((b) => ({
    label: b.label,
    value: b.count,
    emphasis: lead.median !== null && lead.median >= b.from && lead.median <= b.to,
    title: `${b.label} ${t('tender.days')}`,
  }))

  return (
    <>
      <PageHeader
        title={t('insights.title')}
        subtitle={t('insights.subtitle', { total: nf(head.total) })}
        actions={
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] p-0.5">
            {WINDOWS.map((w) => (
              <Link
                key={w.value}
                href={w.value === 90 ? '/app/insights' : `/app/insights?window=${w.value}`}
                className={cx(
                  'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
                  window === w.value
                    ? 'bg-[var(--surface-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                {t(w.key)}
              </Link>
            ))}
          </div>
        }
      />

      {/* --- headline figures --- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('insights.avgPerDay')} value={nf(head.perDay)} hint={`${nf(head.total)} ${t('common.results')}`} />
        <Stat
          label={t('insights.openNow')}
          value={nf(head.openNow)}
          tone="live"
          href="/app/tenders?status=open"
        />
        <Stat
          label={t('insights.closingWeek')}
          value={nf(head.closingWeek)}
          tone="soon"
          href="/app/tenders?status=closing"
        />
        <Stat label={t('insights.activeBuyers')} value={nf(head.activeBuyers)} href="/app/buyers" />
      </div>

      {/* items-start so a short panel does not stretch to match a tall neighbour. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* --- volume over time (full width) --- */}
        <Panel className="lg:col-span-2">
          <PanelHeader title={t('insights.volume')} hint={t('insights.volume.hint')} />
          <div className="px-2 pb-2 pt-3">
            <TimeSeriesChart
              points={weekly.map((w) => ({
                label: formatWeekLabel(w.weekStart, locale),
                value: w.count,
                title: `${t('insights.volume')} — ${formatDate(w.weekStart, locale)}`,
              }))}
            />
          </div>
          <ChartTable
            caption={t('common.more')}
            headers={[t('insights.window'), t('common.results')]}
            rows={weekly.slice(-12).map((w) => [formatDate(w.weekStart, locale), nf(w.count)])}
          />
        </Panel>

        {/* --- nature mix --- */}
        <Panel>
          <PanelHeader title={t('insights.byDomain')} hint={`${nf(head.aoShare)}% ${t('source.ao')}`} />
          <CompositionBar slices={domainSlices} valueFormatter={nf} />
        </Panel>

        {/* --- lead time --- */}
        <Panel>
          <PanelHeader
            title={t('insights.leadTime')}
            hint={t('insights.leadTime.hint')}
            action={
              lead.median !== null ? (
                <span className="whitespace-nowrap text-xs">
                  <span className="label-xs">{t('insights.leadTime.median')}</span>{' '}
                  <span className="num font-semibold">
                    {lead.median} {t('tender.days')}
                  </span>
                </span>
              ) : null
            }
          />
          <ColumnChart columns={leadColumns} valueFormatter={nf} />
          <ChartTable
            caption={t('common.more')}
            headers={[t('tender.days'), t('common.results')]}
            rows={lead.buckets.map((b) => [b.label, nf(b.count)])}
          />
        </Panel>

        {/* --- geography --- */}
        <Panel>
          <PanelHeader title={t('insights.byGov')} />
          <RankedBars
            data={govs.map((g) => ({
              label: label('gov', g.code, locale),
              value: g.count,
              href: `/app/tenders?gov=${encodeURIComponent(g.code ?? '')}`,
            }))}
            valueFormatter={nf}
            labelWidth="w-[38%]"
          />
        </Panel>

        {/* --- cadence --- */}
        <Panel>
          <PanelHeader title={t('insights.cadence')} hint={t('insights.cadence.hint')} />
          <ColumnChart
            columns={cadence.map((c) => ({
              label: weekdayNames[c.weekday],
              value: c.count,
              emphasis: c.count === maxCadence && maxCadence > 0,
            }))}
            height={110}
            valueFormatter={nf}
          />
        </Panel>

        {/* --- top buyers (full width) --- */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title={t('insights.topBuyers')}
            action={
              <Link
                href="/app/buyers"
                className="text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {t('common.more')}
              </Link>
            }
          />
          <RankedBars
            data={buyers.map((b) => ({
              label: b.name,
              value: b.count,
              href: `/app/buyers/${encodeURIComponent(b.code)}`,
              meta: b.lastPublished
                ? `${t('buyers.lastActivity')} ${formatDate(b.lastPublished, locale)}`
                : undefined,
            }))}
            valueFormatter={nf}
          />
        </Panel>
      </div>
    </>
  )
}

function weekdayLabels(locale: Locale): string[] {
  // Index by SQLite's %w (0 = Sunday).
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { weekday: 'short' })
  // 2024-01-07 was a Sunday, so +i walks Sunday..Saturday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))))
}

function formatWeekLabel(iso: string, locale: Locale): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN-u-nu-latn' : 'fr-TN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}
