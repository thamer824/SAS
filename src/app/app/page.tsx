import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SQL_NOW, SQL_NOW_PLUS } from '@/db/sql'
import { ensureDb } from '@/db'
import { requireUser, orgProfile } from '@/lib/auth/guard'
import { formatNumber, getLocale, translator } from '@/lib/i18n'
import { searchTenders } from '@/lib/queries/tenders'
import {
  buildQuery,
  FEED_PAGE_SIZE,
  feedToCriteria,
  parseFeedParams,
  type SearchParams,
} from '@/lib/queries/params'
import { trackedTenderIds } from '@/lib/queries/pipeline'
import { describeIntake, getIntake } from '@/lib/queries/intake'
import { fitScore, orgWatchlists } from '@/lib/match/engine'
import { CriteriaHeader } from '@/components/feed/criteria-header'
import { Panel } from '@/components/ui/primitives'
import { ActiveFilterChips, FilterPanel } from '@/components/feed/filters'
import { FeedToolbar, Pagination } from '@/components/feed/toolbar'
import { AlertStrip, QuickBar } from '@/components/feed/quick-bar'
import { OfferCard, OfferGrid } from '@/components/tender/offer-card'
import { TenderTable, type TenderListItem } from '@/components/tender/list'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('feed.simple.title') }
}

/** The feed IS the home page. Log in, see the offers. Nothing in between. */
const FEED_PATH = '/app'

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser('/app')
  const locale = await getLocale()
  const t = translator(locale)
  const org = orgProfile(user)
  const d = ensureDb()

  const intake = getIntake(org.id, user.id)
  const watchlists = orgWatchlists(org.id)

  // Nobody sees an unfiltered feed before answering the four questions: an
  // unfiltered list teaches nothing, whereas the form makes the product explain
  // itself and produces the alert in the same step.
  if (!intake?.completed) redirect('/bienvenue')

  const params = await searchParams
  const parsed = parseFeedParams(params)

  // Default to the user's own criteria. Seeing "everything" is the exception,
  // reached by an explicit "Voir tout".
  const showingMine = params.all !== '1'

  let filters = parsed.filters
  if (showingMine) {
    filters = {
      ...filters,
      // An explicit chip choice always wins over the saved criteria, so the
      // quick filters still work while "mes offres" is on.
      categoryCodes: filters.categoryCodes?.length ? filters.categoryCodes : intake.categoryCodes,
      govCodes: filters.govCodes?.length
        ? filters.govCodes
        : intake.regionScope === 'regions'
          ? intake.govCodes
          : undefined,
    }
  }

  const { rows, total } = searchTenders(filters)
  const tracked = trackedTenderIds(org.id, rows.map((r) => r.id))

  const openTotal = d
    .prepare<[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tenders WHERE is_real = 1 AND deadline_at > ${SQL_NOW}`,
    )
    .get()!.n

  // Matches recorded in the last 7 days, for the strip above the grid.
  const freshMatches = d
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM watchlist_matches m JOIN watchlists w ON w.id = m.watchlist_id
        WHERE w.org_id = ? AND m.matched_at >= ${SQL_NOW_PLUS("'-7 days'")}`,
    )
    .get(org.id)!.n

  const items: TenderListItem[] = rows.map((tender) => {
    const fit = fitScore(tender, org)
    return {
      tender,
      score: fit?.score,
      scoreLabel: fit ? t(`fit.${fit.band}`) : undefined,
      inPipeline: tracked.has(tender.id),
    }
  })

  const csvHref = `/api/export/tenders${buildQuery(params, { page: null, view: null, adv: null })}`
  const criteria = encodeURIComponent(JSON.stringify(feedToCriteria(parsed)))
  const saveHref = `/app/watchlists/new?criteria=${criteria}${
    parsed.raw.q ? `&name=${encodeURIComponent(parsed.raw.q)}` : ''
  }`

  const described = describeIntake(intake, locale, t('criteria.allTunisia'))

  return (
    <>
      <CriteriaHeader
        t={t}
        sectors={described.sectors}
        regions={described.regions}
        count={formatNumber(showingMine ? total : openTotal, locale)}
        showingMine={showingMine}
        toggleHref={showingMine ? `${FEED_PATH}?all=1` : FEED_PATH}
        editHref="/bienvenue?edit=1"
      />

      <AlertStrip
        count={freshMatches}
        t={t}
        href={FEED_PATH}
        emptyHref="/bienvenue?edit=1"
        hasAlerts={watchlists.length > 0}
      />

      <QuickBar
        params={params}
        parsed={parsed}
        locale={locale}
        t={t}
        feedPath={FEED_PATH}
        showAdvanced={parsed.advanced}
      />

      {/* The full filter panel is opt-in via ?adv=1 — power without the tax. */}
      {parsed.advanced ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[15rem_1fr]">
          <FilterPanel params={params} parsed={parsed} locale={locale} t={t} />
          <div className="min-w-0">
            <ActiveFilterChips params={params} parsed={parsed} locale={locale} t={t} />
            <FeedResults
              parsed={parsed}
              params={params}
              items={items}
              total={total}
              locale={locale}
              t={t}
              csvHref={csvHref}
              saveHref={saveHref}
            />
          </div>
        </div>
      ) : (
        <>
          <ActiveFilterChips params={params} parsed={parsed} locale={locale} t={t} />
          <FeedResults
            parsed={parsed}
            params={params}
            items={items}
            total={total}
            locale={locale}
            t={t}
            csvHref={csvHref}
            saveHref={saveHref}
          />
        </>
      )}
    </>
  )
}

function FeedResults({
  parsed,
  params,
  items,
  total,
  locale,
  t,
  csvHref,
  saveHref,
}: {
  parsed: ReturnType<typeof parseFeedParams>
  params: SearchParams
  items: TenderListItem[]
  total: number
  locale: 'fr' | 'ar'
  t: ReturnType<typeof translator>
  csvHref: string
  saveHref: string
}) {
  return (
    <>
      <FeedToolbar
        params={params}
        parsed={parsed}
        t={t}
        total={total}
        formattedTotal={formatNumber(total, locale)}
        csvHref={csvHref}
        saveHref={saveHref}
      />

      {items.length === 0 ? (
        <Panel className="px-6 py-16 text-center">
          <p className="text-sm font-semibold">{t('common.noResults')}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[0.8125rem] text-[var(--text-muted)]">
            {t('common.noResultsHint')}
          </p>
        </Panel>
      ) : parsed.view === 'table' ? (
        <Panel className="overflow-hidden">
          <TenderTable
            items={items}
            locale={locale}
            t={t}
            showScore={items.some((i) => i.score !== undefined)}
          />
        </Panel>
      ) : (
        <OfferGrid>
          {items.map((i) => (
            <OfferCard
              key={i.tender.id}
              tender={i.tender}
              locale={locale}
              t={t}
              saved={i.inPipeline}
              score={i.score}
            />
          ))}
        </OfferGrid>
      )}

      <Pagination params={params} page={parsed.page} total={total} pageSize={FEED_PAGE_SIZE} t={t} />
    </>
  )
}
