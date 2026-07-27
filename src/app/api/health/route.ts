import { SQL_NOW } from '@/db/sql'
import { NextResponse } from 'next/server'
import { ensureDb } from '@/db'
import { lastSyncRuns } from '@/lib/tuneps/ingest'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Liveness + freshness. Freshness is the one that matters: an alerting product
 * whose ingestion silently stopped is worse than one that is plainly down, so
 * `stale` is surfaced as a first-class signal for an uptime monitor to alarm on.
 */
export async function GET() {
  const d = ensureDb()

  const counts = d
    .prepare<[], { tenders: number; buyers: number; watchlists: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tenders) AS tenders,
         (SELECT COUNT(*) FROM buyers) AS buyers,
         (SELECT COUNT(*) FROM watchlists WHERE is_active = 1) AS watchlists,
         (SELECT COUNT(*) FROM tenders WHERE deadline_at > ${SQL_NOW}) AS open`,
    )
    .get()!

  const runs = lastSyncRuns(3)
  const lastOk = runs.find((r) => r.status === 'ok' && r.finished_at)
  const ageMinutes = lastOk?.finished_at
    ? Math.round((Date.now() - Date.parse(lastOk.finished_at)) / 60_000)
    : null

  // 3h without a successful pass means the cron is not running.
  const stale = ageMinutes === null || ageMinutes > 180

  return NextResponse.json(
    {
      ok: true,
      stale,
      lastSyncAgeMinutes: ageMinutes,
      counts,
      channels: {
        email: Boolean(config.mail.host) ? 'smtp' : 'outbox',
        webpush: config.push.enabled,
        telegram: config.telegram.enabled,
      },
      recentRuns: runs,
    },
    { status: stale ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
