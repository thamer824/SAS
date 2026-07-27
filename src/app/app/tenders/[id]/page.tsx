import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser, orgProfile } from '@/lib/auth/guard'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
  getLocale,
  pickLang,
  translator,
} from '@/lib/i18n'
import { getTender, relatedTenders, tenderRevisions } from '@/lib/queries/tenders'
import { getPipelineItem } from '@/lib/queries/pipeline'
import { fitScore } from '@/lib/match/engine'
import { trackTender, untrackTender } from '@/lib/actions/pipeline-actions'
import { daysUntil } from '@/lib/tuneps/dates'
import {
  Badge,
  Button,
  DataRow,
  Icon,
  Panel,
  PanelHeader,
  buttonClass,
} from '@/components/ui/primitives'
import {
  DeadlinePill,
  DomainChip,
  ScorePill,
  SourceBadge,
  StatusBadge,
  TunepsSourceLink,
} from '@/components/tender/bits'
import { TenderMiniList } from '@/components/tender/list'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const tender = getTender(decodeURIComponent(id))
  if (!tender) return { title: 'Introuvable' }
  return { title: tender.title_fr || tender.title_ar || tender.reference }
}

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)

  const user = await requireUser(`/app/tenders/${rawId}`)
  const locale = await getLocale()
  const t = translator(locale)
  const org = orgProfile(user)

  const tender = getTender(id)
  if (!tender) notFound()

  const item = getPipelineItem(org.id, id)
  const fit = fitScore(tender, org)
  const revisions = tenderRevisions(id)
  const related = relatedTenders(tender, 6)
  const left = daysUntil(tender.deadline_at)

  const title = pickLang(locale, tender.title_fr, tender.title_ar, tender.title_en)
  const altTitle =
    locale === 'ar' ? tender.title_fr : tender.title_ar && tender.title_ar !== title ? tender.title_ar : null

  const docPrice =
    tender.doc_price === null
      ? null
      : tender.doc_price === 0
        ? t('tender.freeDocs')
        : formatCurrency(tender.doc_price, locale, tender.doc_currency ?? 'TND')

  return (
    <div className="mx-auto max-w-6xl">
      {/* --- breadcrumb --- */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/app/tenders" className="underline-offset-2 hover:text-[var(--accent)] hover:underline">
          {t('feed.title')}
        </Link>
        <Icon.chevronRight size={12} className="flip-rtl text-[var(--text-faint)]" />
        <span className="num font-mono text-2xs">{tender.reference}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        {/* ================= main column ================= */}
        <div className="min-w-0 space-y-5">
          <header>
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={tender.source} t={t} />
              <StatusBadge deadline={tender.deadline_at} t={t} />
              <DomainChip tender={tender} locale={locale} />
              {tender.mod_seq !== '00' ? (
                <Badge tone="soon">rév. {tender.mod_seq}</Badge>
              ) : null}
              {tender.is_international ? <Badge tone="info">{t('tender.international')}</Badge> : null}
              {tender.is_framework ? <Badge>{t('tender.framework')}</Badge> : null}
            </div>

            <h1 className="text-xl font-semibold leading-snug tracking-[-0.015em] bidi-isolate">{title}</h1>

            {altTitle ? (
              <p
                className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-muted)] bidi-isolate"
                dir="auto"
              >
                {altTitle}
              </p>
            ) : null}

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
              {tender.buyer_code ? (
                <Link
                  href={`/app/buyers/${encodeURIComponent(tender.buyer_code)}`}
                  className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
                >
                  <Icon.building size={13} />
                  {tender.buyer_name || '—'}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 bidi-isolate">
                  <Icon.building size={13} />
                  {tender.buyer_name || '—'}
                </span>
              )}
              <span className="text-[var(--text-faint)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Icon.clock size={13} />
                {t('tender.published')} {formatRelative(tender.published_at, locale)}
              </span>
            </p>
          </header>

          {/* --- deadline banner: the one thing that must never be missed --- */}
          <Panel
            className={
              left !== null && left >= 0 && left <= 3
                ? 'border-soon-500/40 bg-[var(--color-soon-100)]'
                : undefined
            }
          >
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              <div>
                <p className="label-xs mb-1.5">{t('tender.deadline')}</p>
                <p className="num text-[0.9375rem] font-semibold">
                  {formatDateTime(tender.deadline_at, locale)}
                </p>
                <div className="mt-1">
                  <DeadlinePill deadline={tender.deadline_at} t={t} locale={locale} showDate={false} />
                </div>
              </div>
              <div>
                <p className="label-xs mb-1.5">{t('tender.opening')}</p>
                <p className="num text-[0.9375rem]">{formatDateTime(tender.bid_open_at, locale)}</p>
              </div>
              <div>
                <p className="label-xs mb-1.5">{t('tender.receiptStart')}</p>
                <p className="num text-[0.9375rem]">{formatDateTime(tender.receipt_start_at, locale)}</p>
              </div>
            </div>
          </Panel>

          {/* --- full particulars --- */}
          <Panel>
            <PanelHeader title={t('tender.title')} />
            <dl className="px-4 py-1">
              <DataRow label={t('tender.reference')} mono>
                {tender.reference}
              </DataRow>
              {tender.buyer_ref ? (
                <DataRow label={t('tender.buyerRef')} mono>
                  {tender.buyer_ref}
                </DataRow>
              ) : null}
              <DataRow label={t('tender.procedure')}>
                {pickLang(locale, tender.procedure_label_fr, tender.procedure_label_ar) || '—'}
              </DataRow>
              <DataRow label={t('tender.domain')}>
                {pickLang(locale, tender.domain_label_fr, tender.domain_label_ar) || '—'}
              </DataRow>
              <DataRow label={t('tender.category')}>
                {pickLang(locale, tender.category_label_fr, tender.category_label_ar) || '—'}
              </DataRow>
              <DataRow label={t('tender.governorate')}>
                {pickLang(locale, tender.gov_label_fr, tender.gov_label_ar) || '—'}
                {tender.place_detail ? (
                  <span className="text-[var(--text-muted)]"> — {tender.place_detail}</span>
                ) : null}
              </DataRow>
              {docPrice ? <DataRow label={t('tender.docPrice')}>{docPrice}</DataRow> : null}
              {tender.guarantee_label_fr ? (
                <DataRow label={t('tender.guarantee')}>{tender.guarantee_label_fr}</DataRow>
              ) : null}
              {tender.eval_label_fr ? (
                <DataRow label={t('tender.evaluation')}>{tender.eval_label_fr}</DataRow>
              ) : null}
              {tender.price_type_label_fr ? (
                <DataRow label={t('tender.priceType')}>{tender.price_type_label_fr}</DataRow>
              ) : null}
              {tender.financing_label_fr ? (
                <DataRow label={t('tender.financing')}>{tender.financing_label_fr}</DataRow>
              ) : null}
              {tender.validity_days ? (
                <DataRow label={t('tender.validity')}>
                  {tender.validity_days} {t('tender.days')}
                </DataRow>
              ) : null}
              <DataRow label={t('tender.online')}>
                {tender.is_online ? t('tender.online') : t('tender.offline')}
              </DataRow>
              {tender.allows_consortium ? (
                <DataRow label={t('tender.consortium')}>{t('common.yes')}</DataRow>
              ) : null}
              {tender.department ? (
                <DataRow label={t('tender.department')}>{tender.department}</DataRow>
              ) : null}
              {tender.contact_name ? (
                <DataRow label={t('tender.contact')}>{tender.contact_name}</DataRow>
              ) : null}
              {tender.address ? <DataRow label={t('tender.address')}>{tender.address}</DataRow> : null}
            </dl>

            {tender.detail_fetched_at === null ? (
              <p className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-2xs text-[var(--text-faint)]">
                Détails complets en cours de récupération depuis TUNEPS.
              </p>
            ) : null}
          </Panel>

          {/* --- change history: the value of watching, made visible --- */}
          <Panel>
            <PanelHeader title={t('tender.revisions')} />
            {revisions.length === 0 ? (
              <p className="px-4 py-5 text-xs text-[var(--text-muted)]">{t('tender.noRevisions')}</p>
            ) : (
              <ol className="divide-y divide-[var(--border-subtle)]">
                {revisions.map((r, i) => (
                  <li key={`${r.detected_at}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-0.5">
                      <Badge tone={r.kind === 'new' ? 'live' : r.kind === 'deadline' ? 'soon' : 'neutral'}>
                        {revisionLabel(r.kind)}
                      </Badge>
                    </span>
                    <span className="min-w-0 flex-1 text-xs">
                      {r.kind === 'deadline' ? (
                        <RevisionDeadline before={r.before_json} after={r.after_json} locale={locale} />
                      ) : (
                        <span className="text-[var(--text-secondary)]">{revisionDetail(r.kind)}</span>
                      )}
                      <span className="mt-0.5 block text-2xs text-[var(--text-faint)]">
                        {formatDateTime(r.detected_at, locale)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {related.length > 0 ? (
            <Panel>
              <PanelHeader title={t('buyers.recentTenders')} hint={t('insights.topBuyers')} />
              <TenderMiniList items={related.map((r) => ({ tender: r }))} locale={locale} t={t} />
            </Panel>
          ) : null}
        </div>

        {/* ================= sidebar ================= */}
        <aside className="space-y-4 lg:sticky lg:top-[4.75rem] lg:self-start">
          {/* --- actions --- */}
          <Panel className="p-3.5">
            {item ? (
              <>
                <p className="label-xs mb-2">{t('nav.pipeline')}</p>
                <p className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--accent)]">
                  <Icon.check size={14} />
                  {t(`pipeline.stage.${item.stage}` as 'pipeline.stage.watching')}
                </p>
                <div className="flex flex-col gap-2">
                  <Link href="/app/pipeline" className={buttonClass('secondary', 'md', 'w-full')}>
                    <Icon.target size={14} />
                    {t('nav.pipeline')}
                  </Link>
                  <form action={untrackTender.bind(null, id)}>
                    <Button variant="ghost" size="sm" className="w-full">
                      <Icon.trash size={13} />
                      {t('pipeline.remove')}
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <form action={trackTender.bind(null, id)}>
                <Button variant="primary" size="md" className="w-full">
                  <Icon.bookmark size={14} />
                  {t('feed.addToPipeline')}
                </Button>
                <p className="mt-2 text-2xs leading-relaxed text-[var(--text-muted)]">
                  {t('pipeline.subtitle')}
                </p>
              </form>
            )}
          </Panel>

          {/* --- fit score --- */}
          {fit ? (
            <Panel className="p-3.5">
              <p className="label-xs mb-2">{t('dash.fitScore')}</p>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] font-semibold">{t(`fit.${fit.band}`)}</span>
                <ScorePill score={fit.score} />
              </div>
              <p className="text-2xs leading-relaxed text-[var(--text-muted)]">{t('fit.explain')}</p>
            </Panel>
          ) : (
            <Panel className="p-3.5">
              <p className="label-xs mb-2">{t('dash.fitScore')}</p>
              <p className="mb-3 text-2xs leading-relaxed text-[var(--text-muted)]">
                {t('settings.company.hint')}
              </p>
              <Link href="/app/settings" className={buttonClass('secondary', 'sm', 'w-full')}>
                <Icon.settings size={13} />
                {t('settings.company')}
              </Link>
            </Panel>
          )}

          {/* --- calendar + source --- */}
          <Panel className="p-3.5">
            <p className="label-xs mb-2.5">{t('watchlist.icsFeed')}</p>
            <a
              href={`/api/ics/tender/${encodeURIComponent(id)}`}
              className={buttonClass('secondary', 'sm', 'w-full')}
            >
              <Icon.calendar size={13} />
              {t('tender.deadline')} → .ics
            </a>
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
              <TunepsSourceLink tender={tender} t={t} />
              <p className="mt-2 text-2xs leading-relaxed text-[var(--text-faint)]">
                {t('landing.source.body')}
              </p>
            </div>
          </Panel>

          <p className="px-1 text-2xs text-[var(--text-faint)]">
            {t('tender.lastChecked')} : {formatDate(tender.last_seen_at, locale)}
          </p>
        </aside>
      </div>
    </div>
  )
}

function revisionLabel(kind: string): string {
  switch (kind) {
    case 'new':
      return 'Publication'
    case 'deadline':
      return 'Échéance'
    case 'title':
      return 'Objet'
    case 'modseq':
      return 'Révision'
    default:
      return 'Mise à jour'
  }
}

function revisionDetail(kind: string): string {
  switch (kind) {
    case 'new':
      return 'Avis détecté et indexé.'
    case 'title':
      return 'L’objet de l’avis a été modifié par l’acheteur.'
    case 'modseq':
      return 'L’acheteur a publié une nouvelle version de l’avis.'
    default:
      return 'Champs mis à jour.'
  }
}

function RevisionDeadline({
  before,
  after,
  locale,
}: {
  before: string | null
  after: string | null
  locale: 'fr' | 'ar'
}) {
  const b = parseJson(before)?.deadline_at ?? null
  const a = parseJson(after)?.deadline_at ?? null
  return (
    <span className="text-[var(--text-secondary)]">
      {b ? <s className="num text-[var(--text-faint)]">{formatDateTime(b, locale)}</s> : '—'}
      {' → '}
      <span className="num font-semibold text-soon-600 dark:text-soon-500">
        {a ? formatDateTime(a, locale) : '—'}
      </span>
    </span>
  )
}

function parseJson(raw: string | null): { deadline_at?: string | null } | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
