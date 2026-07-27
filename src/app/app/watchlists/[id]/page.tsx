import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/guard'
import { config } from '@/lib/config'
import { ensureDb } from '@/db'
import { formatNumber, formatRelative, getLocale, translator, type Translator } from '@/lib/i18n'
import {
  getWatchlist,
  parseCriteria,
  parseJsonArray,
  watchlistMatches,
  type MatchReason,
} from '@/lib/match/engine'
import { getTendersByIds } from '@/lib/queries/tenders'
import { label } from '@/lib/tuneps/reference'
import { deleteWatchlist, testWatchlist, toggleWatchlist } from '@/lib/actions/watchlist-actions'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Icon,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from '@/components/ui/primitives'
import { TenderTable, type TenderListItem } from '@/components/tender/list'
import { EditWatchlistForm } from '@/components/watchlist/form'
import { referenceOptions, watchlistFormLabels } from '@/components/watchlist/labels'
import { CopyField } from '@/components/ui/copy-field'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const w = getWatchlist(id)
  return { title: w?.name ?? 'Veille' }
}

export default async function WatchlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const user = await requireUser(`/app/watchlists/${id}`)
  const locale = await getLocale()
  const t = translator(locale)

  const w = getWatchlist(id)
  if (!w || w.org_id !== user.org_id) notFound()

  const criteria = parseCriteria(w.criteria)
  const channels = parseJsonArray(w.channels)

  const matches = watchlistMatches(id, 50)
  const tenders = getTendersByIds(matches.map((m) => m.tender_id))
  const byId = new Map(tenders.map((x) => [x.id, x]))

  const items: TenderListItem[] = matches
    .map<TenderListItem | null>((m) => {
      const tender = byId.get(m.tender_id)
      return tender ? { tender, score: m.score, scoreLabel: reasonSummary(m.reasons, t) } : null
    })
    .filter((x): x is TenderListItem => x !== null)

  const pendingCount = matches.filter((m) => m.notified_at === null).length

  const feedToken = ensureDb()
    .prepare<[string], { token: string }>(
      "SELECT token FROM feed_tokens WHERE kind = 'ics-watchlist' AND ref_id = ?",
    )
    .get(id)?.token

  const icsUrl = feedToken ? `${config.appUrl}/api/ics/watchlist/${feedToken}` : null

  const editing = tab === 'edit'

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/app/watchlists" className="underline-offset-2 hover:text-[var(--accent)] hover:underline">
          {t('watchlist.title')}
        </Link>
        <Icon.chevronRight size={12} className="flip-rtl text-[var(--text-faint)]" />
        <span className="truncate">{w.name}</span>
      </nav>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="bidi-isolate">{w.name}</span>
            <Badge tone={w.is_active ? 'live' : 'gone'}>
              {w.is_active ? t('watchlist.active') : t('watchlist.paused')}
            </Badge>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t(`watchlist.cadence.${w.cadence}` as 'watchlist.cadence.instant')}</span>
            <span className="text-[var(--text-faint)]">·</span>
            <span>{channels.map((c) => t(`watchlist.channel.${c}` as 'watchlist.channel.email')).join(' · ')}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/watchlists/${id}${editing ? '' : '?tab=edit'}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-[0.8125rem] font-medium transition-colors hover:bg-[var(--surface-hover)]"
            >
              {editing ? <Icon.x size={14} /> : <Icon.settings size={14} />}
              {editing ? t('common.close') : t('common.edit')}
            </Link>
            <form action={testWatchlist.bind(null, id)}>
              <Button variant="secondary" size="md" title={t('watchlist.testRun.hint')}>
                <Icon.spark size={14} />
                {t('watchlist.testRun')}
              </Button>
            </form>
            <form action={toggleWatchlist.bind(null, id)}>
              <Button variant="ghost" size="md">
                {w.is_active ? t('watchlist.paused') : t('watchlist.active')}
              </Button>
            </form>
          </div>
        }
      />

      {editing ? (
        <div className="space-y-5">
          <EditWatchlistForm
            id={id}
            labels={watchlistFormLabels(t, Boolean(user.telegram_chat_id))}
            initial={{
              name: w.name,
              criteria,
              cadence: w.cadence,
              channels,
            }}
            refs={referenceOptions(locale)}
            telegramLinked={Boolean(user.telegram_chat_id)}
          />

          <Panel className="border-brand-700/30">
            <PanelHeader title={t('common.dangerZone')} hint={t('watchlist.delete.confirm')} />
            <div className="p-4">
              <form action={deleteWatchlist.bind(null, id)}>
                <Button variant="danger" size="sm">
                  <Icon.trash size={13} />
                  {t('common.delete')}
                </Button>
              </form>
            </div>
          </Panel>
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t('watchlist.matchesLabel')} value={formatNumber(w.match_count, locale)} />
            <Stat
              label={t('watchlist.pendingLabel')}
              value={formatNumber(pendingCount, locale)}
              tone={pendingCount > 0 ? 'soon' : undefined}
              hint={w.cadence === 'instant' ? undefined : t(`watchlist.cadence.${w.cadence}.hint` as 'watchlist.cadence.daily.hint')}
            />
            <Stat
              label={t('watchlist.lastMatch')}
              value={w.last_matched_at ? formatRelative(w.last_matched_at, locale) : '—'}
            />
            <Stat label={t('watchlist.minScore')} value={String(criteria.minScore ?? 0)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <Panel className="min-w-0 overflow-hidden">
              <PanelHeader
                title={t('feed.title')}
                hint={t('watchlist.previewCount', { n: formatNumber(items.length, locale) })}
              />
              {items.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Icon.radar size={20} />}
                  title={t('watchlist.matchesNone')}
                  body={t('watchlist.testRun.hint')}
                />
              ) : (
                <TenderTable
                  items={items}
                  locale={locale}
                  t={t}
                  showScore
                  scoreHeader={t('watchlist.relevance')}
                />
              )}
            </Panel>

            <aside className="space-y-4">
              <Panel>
                <PanelHeader title={t('feed.filters')} />
                <div className="space-y-3 p-4">
                  <CriteriaSummary criteria={criteria} locale={locale} t={t} />
                </div>
              </Panel>

              {icsUrl ? (
                <Panel>
                  <PanelHeader title={t('watchlist.icsFeed')} hint={t('watchlist.icsFeed.hint')} />
                  <div className="p-4">
                    <CopyField value={icsUrl} copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
                  </div>
                </Panel>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function CriteriaSummary({
  criteria,
  locale,
  t,
}: {
  criteria: ReturnType<typeof parseCriteria>
  locale: 'fr' | 'ar'
  t: Translator
}) {
  const groups: Array<{ title: string; values: string[] }> = [
    { title: t('watchlist.keywords'), values: criteria.keywords ?? [] },
    { title: t('watchlist.excludeKeywords'), values: criteria.excludeKeywords ?? [] },
    {
      title: t('tender.domain'),
      values: (criteria.domainCodes ?? []).map((c) => label('domain', c, locale)),
    },
    {
      title: t('tender.category'),
      values: (criteria.categoryCodes ?? []).map((c) => label('category', c, locale)),
    },
    {
      title: t('tender.governorate'),
      values: (criteria.govCodes ?? []).map((c) => label('gov', c, locale)),
    },
    {
      title: t('tender.source'),
      values: (criteria.sources ?? []).map((s) => (s === 'ao' ? t('source.ao') : t('source.consultation'))),
    },
  ].filter((g) => g.values.length > 0)

  if (!groups.length) {
    return <p className="text-xs text-[var(--text-muted)]">{t('common.none')}</p>
  }

  return (
    <>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="label-xs mb-1.5">{g.title}</p>
          <div className="flex flex-wrap gap-1">
            {g.values.map((v, i) => (
              <Chip key={`${v}-${i}`}>{v}</Chip>
            ))}
          </div>
        </div>
      ))}
      {criteria.minLeadDays ? (
        <div>
          <p className="label-xs mb-1.5">{t('feed.minLeadTime')}</p>
          <Chip>
            ≥ {criteria.minLeadDays} {t('tender.days')}
          </Chip>
        </div>
      ) : null}
    </>
  )
}

/** Human-readable "why this matched", for the score tooltip. */
function reasonSummary(raw: string, t: Translator): string {
  let reasons: MatchReason[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) reasons = parsed as MatchReason[]
  } catch {
    return t('watchlist.why')
  }

  if (!reasons.length) return t('watchlist.why')

  return reasons
    .slice(0, 4)
    .map((r) =>
      r.code === 'keyword'
        ? t('reason.keyword', { value: r.value ?? '' })
        : t(`reason.${r.code}` as 'reason.buyer'),
    )
    .join(' · ')
}
