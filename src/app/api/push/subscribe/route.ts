import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureDb, nowIso } from '@/db'
import { sha256 } from '@/lib/ids'
import { currentUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(400), auth: z.string().max(200) }),
})

/** Store a browser push subscription, keyed by a hash of its endpoint. */
export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const { endpoint, keys } = parsed.data

  ensureDb()
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         failed_count = 0`,
    )
    .run(sha256(endpoint), user.id, endpoint, keys.p256dh, keys.auth, nowIso())

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = z
    .object({ endpoint: z.string().url() })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  ensureDb()
    .prepare('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?')
    .run(sha256(parsed.data.endpoint), user.id)

  return NextResponse.json({ ok: true })
}
