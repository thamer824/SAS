import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/guard'
import { ensureDb } from '@/db'
import { formatDateTime, formatRelative, getLocale, pickLang, translator } from '@/lib/i18n'
import { itemEvents, parseChecklist, type PipelineItem } from '@/lib/queries/pipeline'
import { getTender } from '@/lib/queries/tenders'
import { untrackTender } from '@/lib/actions/pipeline-actions'
import { Button, Icon, PageHeader, Panel, PanelHeader } from '@/components/ui/primitives'
import { DeadlinePill, SourceBadge } from '@/components/tender/bits'
import { ItemEditor } from '@/components/pipeline/item-editor'

export const metadata: Metadata = { title: 'Dossier' }

export default async function PipelineItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  const user = await requireUser(`/app/pipeline/${itemId}`)
  const locale = await getLocale()
  const t = translator(locale)

  const item = ensureDb()
    .prepare<[string, string], PipelineItem>(
      `SELECT p.*, u.full_name AS owner_name
         FROM pipeline_items p LEFT JOIN users u ON u.id = p.owner_id
        WHERE p.id = ? AND p.org_id = ?`,
    )
    .get(itemId, user.org_id)

  if (!item) notFound()

  const tender = getTender(item.tender_id)
  if (!tender) notFound()

  const events = itemEvents(itemId, 20)
  const checklist = parseChecklist(item.checklist)
  const title = pickLang(locale, tender.title_fr, tender.title_ar, tender.title_en)

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/app/pipeline" className="underline-offset-2 hover:text-[var(--accent)] hover:underline">
          {t('pipeline.title')}
        </Link>
        <Icon.chevronRight size={12} className="flip-rtl text-[var(--text-faint)]" />
        <span className="truncate">{t(`pipeline.stage.${item.stage}` as 'pipeline.stage.watching')}</span>
      </nav>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <SourceBadge source={tender.source} t={t} />
            <span className="font-mono">{tender.reference}</span>
          </span>
        }
        title={
          <Link
            href={`/app/tenders/${encodeURIComponent(tender.id)}`}
            className="underline-offset-4 hover:text-[var(--accent)] hover:underline bidi-isolate"
          >
            {title}
          </Link>
        }
        subtitle={tender.buyer_name}
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5">
              <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} />
            </span>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <ItemEditor
          itemId={itemId}
          initial={{
            notes: item.notes,
            expectedValue: item.expected_value,
            checklist,
          }}
          labels={{
            notes: t('pipeline.notes'),
            value: t('pipeline.value'),
            checklist: t('pipeline.checklist'),
            addItem: t('pipeline.checklist.add'),
            save: t('common.save'),
            saving: t('common.saving'),
            saved: t('settings.saved'),
          }}
        />

        <aside className="space-y-4">
          <Panel>
            <PanelHeader title={t('pipeline.activity')} />
            {events.length === 0 ? (
              <p className="px-4 py-5 text-xs text-[var(--text-muted)]">—</p>
            ) : (
              <ol className="divide-y divide-[var(--border-subtle)]">
                {events.map((e, i) => (
                  <li key={`${e.created_at}-${i}`} className="px-4 py-2.5">
                    <p className="text-xs">
                      {e.kind === 'stage'
                        ? t(`pipeline.stage.${e.detail}` as 'pipeline.stage.watching')
                        : e.kind === 'checklist'
                          ? `${t('pipeline.checklist')} ${e.detail}`
                          : t('pipeline.notes')}
                    </p>
                    <p className="mt-0.5 text-2xs text-[var(--text-faint)]">
                      {e.user_name ? `${e.user_name} · ` : ''}
                      {formatRelative(e.created_at, locale)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel className="p-3.5">
            <p className="label-xs mb-1.5">{t('pipeline.owner')}</p>
            <p className="mb-3 text-xs">{item.owner_name ?? '—'}</p>
            <p className="label-xs mb-1.5">{t('tender.published')}</p>
            <p className="num mb-3 text-xs">{formatDateTime(tender.published_at, locale)}</p>
            <form action={untrackTender.bind(null, item.tender_id)}>
              <Button variant="ghost" size="sm" className="w-full">
                <Icon.trash size={13} />
                {t('pipeline.remove')}
              </Button>
            </form>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
