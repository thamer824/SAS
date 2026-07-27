import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { formatDate, formatNumber, getLocale, translator } from '@/lib/i18n'
import { listBuyers } from '@/lib/queries/insights'
import { buildQuery, type SearchParams } from '@/lib/queries/params'
import { EmptyState, Icon, PageHeader, Panel, cx, inputClass } from '@/components/ui/primitives'
import { Pagination } from '@/components/feed/toolbar'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('buyers.title') }
}

const PAGE_SIZE = 40

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireUser('/app/buyers')
  const locale = await getLocale()
  const t = translator(locale)
  const params = await searchParams

  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(String(params.page ?? '1'), 10) || 1)

  const { rows, total } = listBuyers({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })

  return (
    <>
      <PageHeader
        title={t('buyers.title')}
        subtitle={t('buyers.subtitle', { n: formatNumber(total, locale) })}
        actions={
          // GET form: the search term lives in the URL like every other filter.
          <form method="get" action="/app/buyers" className="relative w-full sm:w-72">
            <span className="pointer-events-none absolute inset-y-0 start-0 grid w-9 place-items-center text-[var(--text-faint)]">
              <Icon.search size={14} />
            </span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t('buyers.search')}
              className={cx(inputClass, 'ps-9')}
            />
          </form>
        }
      />

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon.building size={20} />}
            title={t('common.noResults')}
            body={t('common.noResultsHint')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th scope="col" className="label-xs px-4 pb-2 pt-3 text-start">
                    {t('buyers.profile')}
                  </th>
                  <th scope="col" className="label-xs px-3 pb-2 pt-3 text-end">
                    {t('buyers.tenderCount')}
                  </th>
                  <th scope="col" className="label-xs px-3 pb-2 pt-3 text-end">
                    {t('insights.openNow')}
                  </th>
                  <th scope="col" className="label-xs px-4 pb-2 pt-3 text-end">
                    {t('buyers.lastActivity')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.code}
                    className="border-b border-[var(--border-subtle)] transition-colors last:border-0 hover:bg-[var(--surface-hover)]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/app/buyers/${encodeURIComponent(b.code)}`}
                        className="block min-w-0 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                      >
                        <span className="clamp-1 block text-xs font-medium bidi-isolate">{b.name}</span>
                        {b.name_ar && locale === 'fr' ? (
                          <span className="clamp-1 mt-0.5 block text-2xs text-[var(--text-faint)] bidi-isolate">
                            {b.name_ar}
                          </span>
                        ) : null}
                      </Link>
                      <span className="num mt-0.5 block font-mono text-2xs text-[var(--text-faint)]">
                        {b.code}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-end text-xs font-semibold">
                      {formatNumber(b.tender_count, locale)}
                    </td>
                    <td className="num px-3 py-2.5 text-end text-xs">
                      {b.open_count > 0 ? (
                        <Link
                          href={`/app/tenders?buyer=${encodeURIComponent(b.code)}&status=open`}
                          className="text-live-600 underline-offset-2 hover:underline dark:text-live-500"
                        >
                          {formatNumber(b.open_count, locale)}
                        </Link>
                      ) : (
                        <span className="text-[var(--text-faint)]">0</span>
                      )}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-xs text-[var(--text-muted)]">
                      {formatDate(b.last_published_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Pagination params={params} page={page} total={total} pageSize={PAGE_SIZE} t={t} />
    </>
  )
}
