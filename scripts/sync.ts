import { SQL_NOW } from '@/db/sql'
import './_env'
import { ensureDb } from '@/db'
import { config } from '@/lib/config'
import { probe } from '@/lib/tuneps/client'
import { syncBuyers } from '@/lib/tuneps/buyers'
import {
  enrichDetails,
  finishRun,
  rebuildFts,
  startRun,
  syncConsultations,
  syncTenders,
  type IngestResult,
} from '@/lib/tuneps/ingest'
import { runMatching } from '@/lib/match/run'

/**
 * Ingestion CLI.
 *
 *   npm run sync                     incremental pass over both sources
 *   npm run sync -- --backfill       walk history (use --max to bound it)
 *   npm run sync -- --source=ao      one source only
 *   npm run sync -- --max=2000       cap rows per source
 *   npm run sync -- --details=800    detail-enrichment budget
 *   npm run sync -- --buyers         refresh the buyer directory
 *   npm run sync -- --rebuild-fts    reindex full-text search
 *   npm run sync -- --no-match       skip watchlist evaluation
 */

interface Args {
  backfill: boolean
  source: 'ao' | 'consultation' | 'both'
  max?: number
  details?: number
  buyers: boolean
  rebuildFts: boolean
  match: boolean
  quiet: boolean
}

function parseArgs(argv: string[]): Args {
  const has = (name: string) => argv.includes(`--${name}`)
  const val = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit?.split('=').slice(1).join('=')
  }
  const int = (name: string): number | undefined => {
    const raw = val(name)
    if (raw === undefined) return undefined
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : undefined
  }

  const src = val('source')
  return {
    backfill: has('backfill'),
    source: src === 'ao' || src === 'consultation' ? src : 'both',
    max: int('max'),
    details: int('details'),
    buyers: has('buyers') || has('backfill'),
    rebuildFts: has('rebuild-fts'),
    match: !has('no-match'),
    quiet: has('quiet'),
  }
}

const args = parseArgs(process.argv.slice(2))
const t0 = Date.now()
const log = args.quiet ? () => {} : (m: string) => process.stdout.write(`  ${m}\n`)
const step = (m: string) => process.stdout.write(`\n▸ ${m}\n`)

function summarise(r: IngestResult): string {
  return `fetched ${r.fetched}, new ${r.inserted}, changed ${r.updated}, unchanged ${r.unchanged}`
}

async function main() {
  ensureDb()
  console.log(`Mounaqasat sync — ${args.backfill ? 'BACKFILL' : 'incremental'}`)
  console.log(`source: ${config.tuneps.base}`)

  step('probing TUNEPS')
  const health = await probe()
  if (!health.ok) {
    console.error(`  unreachable: ${health.error}`)
    process.exitCode = 1
    return
  }
  console.log(`  ok — ${health.total?.toLocaleString('fr-FR')} published notices upstream`)

  if (args.rebuildFts) {
    step('rebuilding full-text index')
    rebuildFts(log)
  }

  if (args.buyers) {
    step('syncing buyer directory')
    const runId = startRun('buyers', 'full')
    try {
      const n = await syncBuyers(log)
      finishRun(runId, { fetched: n, inserted: 0, updated: 0 })
      console.log(`  ${n} institutions`)
    } catch (err) {
      finishRun(runId, { fetched: 0, inserted: 0, updated: 0 }, (err as Error).message)
      console.error(`  failed: ${(err as Error).message}`)
    }
  }

  const mode = args.backfill ? 'backfill' : 'incremental'
  const touched: string[] = []

  const passes: Array<{ name: string; run: () => Promise<IngestResult> }> = []
  if (args.source === 'ao' || args.source === 'both') {
    passes.push({
      name: "appels d'offres",
      run: () => syncTenders({ mode, maxRows: args.max, log }),
    })
  }
  if (args.source === 'consultation' || args.source === 'both') {
    passes.push({
      name: 'consultations',
      run: () => syncConsultations({ mode, maxRows: args.max, log }),
    })
  }

  for (const pass of passes) {
    step(`syncing ${pass.name}`)
    const runId = startRun(pass.name.includes('offres') ? 'ao' : 'consultation', mode)
    try {
      const r = await pass.run()
      touched.push(...r.touched)
      finishRun(runId, r)
      console.log(`  ${summarise(r)}`)
      if (r.cursor) console.log(`  cursor → ${r.cursor}`)
    } catch (err) {
      finishRun(runId, { fetched: 0, inserted: 0, updated: 0 }, (err as Error).message)
      console.error(`  failed: ${(err as Error).message}`)
    }
  }

  const detailBudget = args.details ?? config.tuneps.detailBudget
  if (detailBudget > 0) {
    step(`enriching details (budget ${detailBudget})`)
    const runId = startRun('detail', 'detail')
    try {
      const r = await enrichDetails({ budget: detailBudget, log })
      touched.push(...r.touched)
      finishRun(runId, r)
      console.log(`  ${summarise(r)}`)
    } catch (err) {
      finishRun(runId, { fetched: 0, inserted: 0, updated: 0 }, (err as Error).message)
      console.error(`  failed: ${(err as Error).message}`)
    }
  }

  if (args.match) {
    const unique = [...new Set(touched)]
    step(`matching watchlists over ${unique.length} touched notices`)
    const m = await runMatching(unique, log)
    console.log(
      `  ${m.watchlists} watchlists, ${m.matches} matches, ` +
        `${m.notifications} notifications, ${m.deliveries} deliveries`,
    )
  }

  const d = ensureDb()
  const stats = d
    .prepare<[], { total: number; ao: number; cons: number; open: number; buyers: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tenders) AS total,
         (SELECT COUNT(*) FROM tenders WHERE source = 'ao') AS ao,
         (SELECT COUNT(*) FROM tenders WHERE source = 'consultation') AS cons,
         (SELECT COUNT(*) FROM tenders WHERE deadline_at > ${SQL_NOW}) AS open,
         (SELECT COUNT(*) FROM buyers) AS buyers`,
    )
    .get()!

  step('local corpus')
  console.log(`  ${stats.total.toLocaleString('fr-FR')} notices — ${stats.ao} AO, ${stats.cons} consultations`)
  console.log(`  ${stats.open.toLocaleString('fr-FR')} still open · ${stats.buyers} buyers`)
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('\nsync failed:', err)
  process.exitCode = 1
})
