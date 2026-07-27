import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { markAllRead } from '@/lib/notify/channels'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const changed = markAllRead(user.id)
  return NextResponse.json({ ok: true, changed })
}
