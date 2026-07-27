import { NextResponse } from 'next/server'
import { ensureDb } from '@/db'
import { getWatchlist, watchlistMatches } from '@/lib/match/engine'
import { getTendersByIds } from '@/lib/queries/tenders'
import { tendersToIcs } from '@/lib/export/ics'

export const dynamic = 'force-dynamic'

/**
 * Token-authenticated ICS feed.
 *
 * Calendar clients cannot send cookies, so the unguessable token in the path IS
 * the credential. It grants read access to one watchlist's deadlines and nothing
 * else, and can be rotated by deleting the row.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const row = ensureDb()
    .prepare<[string], { ref_id: string | null }>(
      "SELECT ref_id FROM feed_tokens WHERE token = ? AND kind = 'ics-watchlist'",
    )
    .get(token)

  if (!row?.ref_id) return new NextResponse('Not found', { status: 404 })

  const watchlist = getWatchlist(row.ref_id)
  if (!watchlist) return new NextResponse('Not found', { status: 404 })

  const matches = watchlistMatches(watchlist.id, 200)
  const tenders = getTendersByIds(matches.map((m) => m.tender_id))

  // Only future deadlines: a calendar cluttered with expired events is worse
  // than an empty one.
  const upcoming = tenders.filter((t) => t.deadline_at && Date.parse(t.deadline_at) > Date.now())

  const ics = tendersToIcs(upcoming, { calendarName: `Mounaqasat — ${watchlist.name}` })

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="mounaqasat-${watchlist.id}.ics"`,
      'Cache-Control': 'public, max-age=1800',
    },
  })
}
