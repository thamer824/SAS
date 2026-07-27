import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/guard'
import { getLocale, translator } from '@/lib/i18n'
import { PageHeader } from '@/components/ui/primitives'
import { NewWatchlistForm } from '@/components/watchlist/form'
import { referenceOptions, watchlistFormLabels } from '@/components/watchlist/labels'
import type { WatchCriteria } from '@/lib/match/engine'
import type { SearchParams } from '@/lib/queries/params'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('watchlist.new') }
}

export default async function NewWatchlistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser('/app/watchlists/new')
  const locale = await getLocale()
  const t = translator(locale)
  const params = await searchParams

  // Arrives pre-filled when the user clicked "save as watchlist" on the feed.
  const criteria = parseCriteriaParam(params.criteria)
  const name = firstParam(params.name) ?? ''

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={t('watchlist.title')}
        title={t('watchlist.new')}
        subtitle={t('feed.saveAsWatchlist.hint')}
      />

      <NewWatchlistForm
        labels={watchlistFormLabels(t, Boolean(user.telegram_chat_id))}
        initial={{ name, criteria }}
        refs={referenceOptions(locale)}
        telegramLinked={Boolean(user.telegram_chat_id)}
      />
    </div>
  )
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined
}

function parseCriteriaParam(v: string | string[] | undefined): WatchCriteria {
  const raw = firstParam(v)
  if (!raw) return { minScore: 40, openOnly: true }
  try {
    const parsed = JSON.parse(raw) as WatchCriteria
    return parsed && typeof parsed === 'object' ? parsed : { minScore: 40, openOnly: true }
  } catch {
    return { minScore: 40, openOnly: true }
  }
}
