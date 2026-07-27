import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { formatCurrency, formatNumber, getLocale, pickLang, translator, type Translator } from '@/lib/i18n'
import {
  BOARD_STAGES,
  CLOSED_STAGES,
  listPipeline,
  parseChecklist,
  pipelineStats,
  type PipelineItem,
  type Stage,
} from '@/lib/queries/pipeline'
import { getTendersByIds, type TenderRow } from '@/lib/queries/tenders'
import { moveStage } from '@/lib/actions/pipeline-actions'
import {
  Badge,
  EmptyState,
  Icon,
  LinkButton,
  PageHeader,
  Panel,
  Stat,
  cx,
} from '@/components/ui/primitives'
import { DeadlinePill } from '@/components/tender/bits'
import { StageMover } from '@/components/pipeline/stage-mover'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('pipeline.title') }
}

export default async function PipelinePage() {
  const user = await requireUser('/app/pipeline')
  const locale = await getLocale()
  const t = translator(locale)

  const items = listPipeline(user.org_id)
  const tenders = getTendersByIds(items.map((i) => i.tender_id))
  const byId = new Map(tenders.map((x) => [x.id, x]))
  const stats = pipelineStats(user.org_id)

  const grouped = new Map<Stage, Array<{ item: PipelineItem; tender: TenderRow }>>()
  for (const stage of [...BOARD_STAGES, ...CLOSED_STAGES]) grouped.set(stage, [])
  for (const item of items) {
    const tender = byId.get(item.tender_id)
    if (!tender) continue
    grouped.get(item.stage)?.push({ item, tender })
  }

  // Inside a column, the nearest deadline is the most urgent thing to see.
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.tender.deadline_at ?? '9999').localeCompare(b.tender.deadline_at ?? '9999'))
  }

  const stageLabels = Object.fromEntries(
    [...BOARD_STAGES, ...CLOSED_STAGES].map((s) => [s, t(`pipeline.stage.${s}` as 'pipeline.stage.watching')]),
  ) as Record<Stage, string>

  const closedCount = CLOSED_STAGES.reduce((n, s) => n + (grouped.get(s)?.length ?? 0), 0)

  return (
    <>
      <PageHeader
        title={t('pipeline.title')}
        subtitle={t('pipeline.subtitle')}
        actions={
          <LinkButton href="/app/tenders" variant="secondary" size="md">
            <Icon.plus size={15} />
            {t('feed.title')}
          </LinkButton>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('pipeline.stats.total')} value={formatNumber(stats.total, locale)} />
        <Stat label={t('pipeline.stats.submitted')} value={formatNumber(stats.submitted, locale)} />
        <Stat
          label={t('pipeline.stats.winRate')}
          value={stats.winRate === null ? '—' : `${stats.winRate}%`}
          tone={stats.winRate !== null && stats.winRate >= 30 ? 'live' : undefined}
          hint={`${formatNumber(stats.won, locale)} / ${formatNumber(stats.won + stats.lost, locale)}`}
        />
        <Stat
          label={t('pipeline.stats.atRisk')}
          value={formatNumber(stats.atRisk, locale)}
          tone={stats.atRisk > 0 ? 'soon' : undefined}
        />
      </div>

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Icon.target size={22} />}
            title={t('pipeline.empty')}
            body={t('pipeline.subtitle')}
            action={
              <LinkButton href="/app/tenders" size="md">
                {t('feed.title')}
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <>
          {/* Board: horizontal scroll on small screens rather than stacking —
              the point of a board is seeing the stages side by side. */}
          <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-[62rem] grid-cols-4 gap-3">
              {BOARD_STAGES.map((stage) => {
                const list = grouped.get(stage) ?? []
                const value = list.reduce((n, x) => n + (x.item.expected_value ?? 0), 0)
                return (
                  <section key={stage} className="flex min-w-0 flex-col">
                    <header className="mb-2 flex items-center justify-between gap-2 px-1">
                      <h2 className="text-xs font-semibold">{stageLabels[stage]}</h2>
                      <span className="num text-2xs text-[var(--text-faint)]">{list.length}</span>
                    </header>

                    {value > 0 ? (
                      <p className="num mb-2 px-1 text-2xs text-[var(--text-muted)]">
                        {formatCurrency(value, locale)}
                      </p>
                    ) : null}

                    <ul className="flex min-h-24 flex-col gap-2 rounded-xl bg-[var(--surface-sunken)] p-2">
                      {list.length === 0 ? (
                        <li className="px-2 py-6 text-center text-2xs text-[var(--text-faint)]">—</li>
                      ) : (
                        list.map(({ item, tender }) => (
                          <PipelineCard
                            key={item.id}
                            item={item}
                            tender={tender}
                            locale={locale}
                            t={t}
                            stageLabels={stageLabels}
                          />
                        ))
                      )}
                    </ul>
                  </section>
                )
              })}
            </div>
          </div>

          {/* Decided deals: an archive, not a column. */}
          {closedCount > 0 ? (
            <Panel className="mt-5">
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
                <h2 className="text-xs font-semibold">
                  {stageLabels.won} · {stageLabels.lost} · {stageLabels.skipped}
                </h2>
                <span className="num text-2xs text-[var(--text-faint)]">{closedCount}</span>
              </header>
              <ul className="divide-y divide-[var(--border-subtle)]">
                {CLOSED_STAGES.flatMap((stage) =>
                  (grouped.get(stage) ?? []).map(({ item, tender }) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Badge tone={stage === 'won' ? 'live' : stage === 'lost' ? 'brand' : 'gone'}>
                        {stageLabels[stage]}
                      </Badge>
                      <Link
                        href={`/app/tenders/${encodeURIComponent(tender.id)}`}
                        className="clamp-1 min-w-0 flex-1 text-xs underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
                      >
                        {pickLang(locale, tender.title_fr, tender.title_ar)}
                      </Link>
                      {item.expected_value ? (
                        <span className="num shrink-0 text-xs text-[var(--text-muted)]">
                          {formatCurrency(item.expected_value, locale)}
                        </span>
                      ) : null}
                      <StageMover
                        itemId={item.id}
                        current={item.stage}
                        action={moveStage}
                        labels={stageLabels}
                        moveLabel={t('pipeline.moveTo')}
                      />
                    </li>
                  )),
                )}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </>
  )
}

function PipelineCard({
  item,
  tender,
  locale,
  t,
  stageLabels,
}: {
  item: PipelineItem
  tender: TenderRow
  locale: 'fr' | 'ar'
  t: Translator
  stageLabels: Record<Stage, string>
}) {
  const checklist = parseChecklist(item.checklist)
  const done = checklist.filter((c) => c.done).length
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0

  const deadlineMs = tender.deadline_at ? Date.parse(tender.deadline_at) - Date.now() : null
  const atRisk = deadlineMs !== null && deadlineMs > 0 && deadlineMs <= 72 * 3_600_000

  return (
    <li
      className={cx(
        'panel p-2.5 shadow-[0_1px_2px_rgb(14_18_24/0.04)]',
        atRisk && 'border-soon-500/45',
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <Link
          href={`/app/tenders/${encodeURIComponent(tender.id)}`}
          className="clamp-2 min-w-0 text-xs font-medium leading-snug underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
        >
          {pickLang(locale, tender.title_fr, tender.title_ar)}
        </Link>
        {atRisk ? (
          <span className="shrink-0">
            <Badge tone="soon">{t('pipeline.atRisk')}</Badge>
          </span>
        ) : null}
      </div>

      <p className="clamp-1 mb-2 text-2xs text-[var(--text-muted)] bidi-isolate">{tender.buyer_name || '—'}</p>

      <div className="mb-2 flex items-center justify-between gap-2">
        <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} showDate={false} />
        {item.expected_value ? (
          <span className="num text-2xs font-semibold">{formatCurrency(item.expected_value, locale)}</span>
        ) : null}
      </div>

      {checklist.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-2xs text-[var(--text-muted)]">
            <span>{t('pipeline.checklist')}</span>
            <span className="num">
              {done}/{checklist.length}
            </span>
          </div>
          <span className="block h-1 overflow-hidden rounded-full bg-[var(--surface-active)]">
            <span
              className={cx('block h-full rounded-full', pct === 100 ? 'bg-live-500' : 'bg-viz-1')}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
        <Link
          href={`/app/pipeline/${item.id}`}
          className="text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          {t('common.edit')}
        </Link>
        <StageMover
          itemId={item.id}
          current={item.stage}
          action={moveStage}
          labels={stageLabels}
          moveLabel={t('pipeline.moveTo')}
        />
      </div>
    </li>
  )
}
