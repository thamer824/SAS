import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/guard'
import { formatDate, formatNumber, getLocale, translator, type Locale } from '@/lib/i18n'
import {
  buyerDomainMix,
  buyerLeadTime,
  buyerMonthlyVolume,
  getBuyer,
} from '@/lib/queries/insights'
import { searchTenders } from '@/lib/queries/tenders'
import { label } from '@/lib/tuneps/reference'
import { Icon, LinkButton, PageHeader, Panel, PanelHeader, Stat } from '@/components/ui/primitives'
import { CompositionBar, TimeSeriesChart } from '@/components/charts/charts'
import { TenderTable } from '@/components/tender/list'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const buyer = getBuyer(decodeURIComponent(code))
  return { title: buyer?.name ?? 'Acheteur' }
}

export default async function BuyerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode)

  await requireUser(`/app/buyers/${rawCode}`)
  const locale = await getLocale()
  const t = translator(locale)

  const buyer = getBuyer(code)
  if (!buyer) notFound()

  const openNow = searchTenders({ buyerCodes: [code], status: 'open', sort: 'deadline', limit: 15 })
  const recent = searchTenders({ buyerCodes: [code], status: 'all', sort: 'newest', limit: 15 })
  const mix = buyerDomainMix(code)
  const monthly = buyerMonthlyVolume(code, 18)
  const medianLead = buyerLeadTime(code)

  const nf = (n: number) => formatNumber(n, locale)
  const displayName = locale === 'ar' ? buyer.name_ar || buyer.name : buyer.name

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/app/buyers" className="underline-offset-2 hover:text-[var(--accent)] hover:underline">
          {t('buyers.title')}
        </Link>
        <Icon.chevronRight size={12} className="flip-rtl text-[var(--text-faint)]" />
        <span className="num font-mono text-2xs">{buyer.code}</span>
      </nav>

      <PageHeader
        eyebrow={t('buyers.profile')}
        title={<span className="bidi-isolate">{displayName}</span>}
        subtitle={
          locale === 'fr' && buyer.name_ar ? (
            <span className="bidi-isolate" dir="rtl">
              {buyer.name_ar}
            </span>
          ) : undefined
        }
        actions={
          <>
            <LinkButton href={`/app/tenders?buyer=${encodeURIComponent(code)}`} variant="secondary" size="md">
              <Icon.layers size={14} />
              {t('feed.title')}
            </LinkButton>
            <LinkButton
              href={`/app/watchlists/new?criteria=${encodeURIComponent(
                JSON.stringify({ buyerCodes: [code], openOnly: true, minScore: 0 }),
              )}&name=${encodeURIComponent(displayName.slice(0, 60))}`}
              size="md"
            >
              <Icon.radar size={14} />
              {t('buyers.follow')}
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('buyers.tenderCount')} value={nf(buyer.tender_count)} />
        <Stat
          label={t('insights.openNow')}
          value={nf(openNow.total)}
          tone={openNow.total > 0 ? 'live' : undefined}
        />
        <Stat
          label={t('insights.leadTime.median')}
          value={medianLead === null ? '—' : `${medianLead}`}
          hint={medianLead === null ? undefined : t('tender.days')}
        />
        <Stat label={t('buyers.lastActivity')} value={formatDate(buyer.last_published_at, locale)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="lg:col-span-2">
          <PanelHeader title={t('buyers.rhythm')} hint={t('insights.volume.hint')} />
          <div className="px-2 pb-2 pt-3">
            <TimeSeriesChart
              points={monthly.map((m) => ({
                label: monthLabel(m.weekStart, locale),
                value: m.count,
                title: formatDate(m.weekStart, locale),
              }))}
              height={150}
            />
          </div>
        </Panel>

        {mix.length > 0 ? (
          <Panel className="lg:col-span-2">
            <PanelHeader title={t('buyers.favouriteDomains')} />
            <CompositionBar
              slices={mix.slice(0, 6).map((m, i) => ({
                label: label('domain', m.code, locale),
                value: m.count,
                slot: i,
              }))}
              valueFormatter={nf}
            />
          </Panel>
        ) : null}

        <Panel className="min-w-0 overflow-hidden lg:col-span-2">
          <PanelHeader
            title={t('insights.openNow')}
            hint={t('feed.sort.deadline')}
            action={
              <Link
                href={`/app/tenders?buyer=${encodeURIComponent(code)}&status=open`}
                className="text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {t('common.more')}
              </Link>
            }
          />
          <TenderTable
            items={openNow.rows.map((tender) => ({ tender }))}
            locale={locale}
            t={t}
          />
        </Panel>

        <Panel className="min-w-0 overflow-hidden lg:col-span-2">
          <PanelHeader title={t('buyers.recentTenders')} />
          <TenderTable items={recent.rows.map((tender) => ({ tender }))} locale={locale} t={t} />
        </Panel>
      </div>
    </div>
  )
}

function monthLabel(iso: string, locale: Locale): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN-u-nu-latn' : 'fr-TN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}
