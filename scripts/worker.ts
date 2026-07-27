import './_env'
import { ensureDb, kvGet, kvSet, nowIso } from '@/db'
import { pruneSessions } from '@/lib/auth/session'
import { runDeadlineReminders, runDigests, runMatching } from '@/lib/match/run'
import { syncBuyers } from '@/lib/tuneps/buyers'
import {
  enrichDetails,
  finishRun,
  startRun,
  syncConsultations,
  syncTenders,
} from '@/lib/tuneps/ingest'

/**
 * Long-running worker: the whole backend loop in one process.
 *
 * Cadence
 *   every  10 min  incremental ingest of both sources + instant matching
 *   every  60 min  detail enrichment for newly seen notices
 *   every   6 h    buyer directory refresh
 *   every  30 min  digest dispatch (each watchlist gated by its own cadence)
 *   daily  ~06:30  deadline reminders for pipeline items
 *
 * Prefer this to five cron entries: one process means one SQLite writer, so
 * there is no lock contention between passes. If you would rather use cron,
 * `npm run sync` is idempotent and safe to schedule directly.
 */

const MIN = 60_000
const INTERVALS = {
  ingest: 10 * MIN,
  details: 60 * MIN,
  buyers: 6 * 60 * MIN,
  digests: 30 * MIN,
  reminders: 60 * MIN,
  prune: 12 * 60 * MIN,
}

const log = (scope: string, msg: string) =>
  process.stdout.write(`${new Date().toISOString()} [${scope}] ${msg}\n`)

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1)
    stopping = true
    log('worker', `${signal} received — finishing current task then exiting`)
  })
}

/** Run `fn` at most once per `intervalMs`, tracked in kv so restarts are safe. */
async function every(key: string, intervalMs: number, fn: () => Promise<void>): Promise<void> {
  if (stopping) return
  const last = kvGet(`worker:${key}`)
  const lastMs = last ? Date.parse(last) : 0
  if (Number.isFinite(lastMs) && Date.now() - lastMs < intervalMs) return

  try {
    await fn()
  } catch (err) {
    log(key, `FAILED: ${(err as Error).message}`)
  } finally {
    // Stamp even on failure: a persistently broken pass must not spin.
    kvSet(`worker:${key}`, nowIso())
  }
}

async function ingestPass(): Promise<void> {
  const touched: string[] = []

  for (const [source, run] of [
    ['ao', () => syncTenders({ mode: 'incremental', log: (m) => log('ingest', m) })],
    ['consultation', () => syncConsultations({ mode: 'incremental', log: (m) => log('ingest', m) })],
  ] as const) {
    const runId = startRun(source, 'incremental')
    try {
      const r = await run()
      touched.push(...r.touched)
      finishRun(runId, r)
      log('ingest', `${source}: +${r.inserted} new, ~${r.updated} changed`)
    } catch (err) {
      finishRun(runId, { fetched: 0, inserted: 0, updated: 0 }, (err as Error).message)
      log('ingest', `${source} FAILED: ${(err as Error).message}`)
    }
  }

  const unique = [...new Set(touched)]
  if (!unique.length) return

  const summary = await runMatching(unique, (m) => log('match', m))
  if (summary.matches > 0) {
    log(
      'match',
      `${summary.matches} match(es) across ${summary.watchlists} watchlist(s), ` +
        `${summary.deliveries} delivery/ies`,
    )
  }
}

/** Deadline reminders belong in the morning, not at 03:00. */
function isMorningWindow(): boolean {
  // Africa/Tunis is UTC+1 year-round, so 05:00–08:00 UTC ≈ 06:00–09:00 local.
  const hourUtc = new Date().getUTCHours()
  return hourUtc >= 5 && hourUtc < 8
}

async function tick(): Promise<void> {
  await every('ingest', INTERVALS.ingest, ingestPass)

  await every('details', INTERVALS.details, async () => {
    const runId = startRun('detail', 'detail')
    try {
      const r = await enrichDetails({ log: (m) => log('details', m) })
      finishRun(runId, r)
      if (r.fetched) log('details', `enriched ${r.fetched}`)
      if (r.touched.length) await runMatching(r.touched, (m) => log('match', m))
    } catch (err) {
      finishRun(runId, { fetched: 0, inserted: 0, updated: 0 }, (err as Error).message)
      throw err
    }
  })

  await every('buyers', INTERVALS.buyers, async () => {
    const n = await syncBuyers((m) => log('buyers', m))
    log('buyers', `${n} institutions`)
  })

  await every('digests', INTERVALS.digests, async () => {
    const s = await runDigests((m) => log('digest', m))
    if (s.watchlists) log('digest', `${s.watchlists} due, ${s.deliveries} sent`)
  })

  await every('reminders', INTERVALS.reminders, async () => {
    if (!isMorningWindow()) return
    const sent = await runDeadlineReminders(3, (m) => log('remind', m))
    if (sent) log('remind', `${sent} reminder email(s)`)
  })

  await every('prune', INTERVALS.prune, async () => {
    const n = pruneSessions()
    if (n) log('prune', `${n} expired session(s)`)
  })
}

async function main(): Promise<void> {
  ensureDb()
  log('worker', 'started')
  log('worker', `intervals: ${JSON.stringify(INTERVALS)}`)

  // First tick immediately so a fresh deploy is not 10 minutes stale.
  await tick()

  while (!stopping) {
    await new Promise((r) => setTimeout(r, 30_000))
    if (stopping) break
    await tick()
  }

  log('worker', 'stopped')
  process.exit(0)
}

main().catch((err) => {
  log('worker', `fatal: ${err instanceof Error ? err.stack : String(err)}`)
  process.exit(1)
})
