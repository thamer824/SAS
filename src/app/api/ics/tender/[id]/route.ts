import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { getTender } from '@/lib/queries/tenders'
import { tendersToIcs } from '@/lib/export/ics'

export const dynamic = 'force-dynamic'

/** Single-event .ics download — "add this deadline to my calendar". */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params
  const tender = getTender(decodeURIComponent(id))
  if (!tender) return new NextResponse('Not found', { status: 404 })

  const ics = tendersToIcs([tender], {
    calendarName: `Mounaqasat — ${tender.reference}`,
    reminderMinutes: 48 * 60,
  })

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tender.reference}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
