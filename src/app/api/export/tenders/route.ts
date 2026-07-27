import { NextResponse, type NextRequest } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { parseFeedParams } from '@/lib/queries/params'
import { searchTenders } from '@/lib/queries/tenders'
import { csvFilename, tendersToCsv } from '@/lib/export/csv'

export const dynamic = 'force-dynamic'

/** CSV of the current feed filters. Capped so one click can't dump 300k rows. */
const MAX_ROWS = 2000

export async function GET(request: NextRequest) {
  const user = await currentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const parsed = parseFeedParams(params)

  const { rows } = searchTenders({ ...parsed.filters, limit: MAX_ROWS, offset: 0 })
  const csv = tendersToCsv(rows)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename()}"`,
      'Cache-Control': 'no-store',
    },
  })
}
