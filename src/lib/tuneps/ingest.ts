import type Database from 'better-sqlite3'
import { ensureDb, kvGet, kvSet, nowIso } from '@/db'
import { config } from '@/lib/config'
import { buildSearchBlob } from '@/lib/text/normalize'
import {
  fetchConsultationPage,
  fetchTenderDetail,
  fetchTenderPage,
  type Criteria,
} from './client'
import { isoToTuneps } from './dates'
import { mapConsultation, mapTenderDetail, mapTenderList, type CanonicalTender } from './map'
import { domainFromCategory, labelFor } from './reference'
import { buyerNameMap } from './buyers'

export type SourceKind = 'ao' | 'consultation'

export interface IngestResult {
  source: SourceKind | 'detail'
  fetched: number
  inserted: number
  updated: number
  unchanged: number
  /** Tender ids that are new or materially changed — the matcher's input. */
  touched: string[]
  revisions: number
  cursor?: string | null
}

const CURSOR_KEY = (s: SourceKind) => `cursor:${s}`
/**
 * Re-read a small overlap before the cursor on every run. TUNEPS `publicDt`
 * values are written by several application servers, so a notice can land with
 * a timestamp slightly behind one already seen. A 6-hour overlap costs a few
 * hundred rows and closes that gap.
 */
const OVERLAP_MS = 6 * 3_600_000

// --- SQL -------------------------------------------------------------------

const COLUMNS = [
  'id',
  'source',
  'source_id',
  'reference',
  'mod_seq',
  'buyer_ref',
  'title_fr',
  'title_ar',
  'title_en',
  'search_blob',
  'buyer_code',
  'buyer_name',
  'domain_code',
  'domain_label_fr',
  'domain_label_ar',
  'category_code',
  'category_label_fr',
  'category_label_ar',
  'procedure_code',
  'procedure_label_fr',
  'procedure_label_ar',
  'gov_code',
  'gov_label_fr',
  'gov_label_ar',
  'place_detail',
  'is_online',
  'is_international',
  'is_framework',
  'allows_consortium',
  'is_real',
  'doc_price',
  'doc_currency',
  'guarantee_label_fr',
  'eval_label_fr',
  'price_type_label_fr',
  'financing_label_fr',
  'validity_days',
  'published_at',
  'receipt_start_at',
  'deadline_at',
  'bid_open_at',
  'contact_name',
  'department',
  'address',
  'content_hash',
  'raw_json',
] as const

interface Statements {
  select: Database.Statement<[string], ExistingRow>
  insert: Database.Statement
  update: Database.Statement
  touch: Database.Statement
  ftsDelete: Database.Statement
  ftsInsert: Database.Statement
  revision: Database.Statement
  buyerSeen: Database.Statement
}

interface ExistingRow {
  rowid: number
  content_hash: string
  deadline_at: string | null
  title_fr: string
  mod_seq: string
  detail_fetched_at: string | null
}

let stmts: Statements | null = null

function statements(): Statements {
  if (stmts) return stmts
  const d = ensureDb()

  const cols = COLUMNS.join(', ')
  const placeholders = COLUMNS.map((c) => `@${c}`).join(', ')
  // `first_seen_at` is deliberately absent from COLUMNS: it is set once on
  // insert and must survive every later update.
  const updates = COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = @${c}`)
    .join(', ')

  stmts = {
    select: d.prepare<[string], ExistingRow>(
      `SELECT rowid, content_hash, deadline_at, title_fr, mod_seq, detail_fetched_at
         FROM tenders WHERE id = ?`,
    ),
    insert: d.prepare(
      `INSERT INTO tenders (${cols}, first_seen_at, last_seen_at, updated_at)
       VALUES (${placeholders}, @ts, @ts, @ts)`,
    ),
    update: d.prepare(
      `UPDATE tenders SET ${updates}, last_seen_at = @ts, updated_at = @ts WHERE id = @id`,
    ),
    touch: d.prepare('UPDATE tenders SET last_seen_at = ? WHERE id = ?'),
    ftsDelete: d.prepare('DELETE FROM tenders_fts WHERE rowid = ?'),
    ftsInsert: d.prepare(
      'INSERT INTO tenders_fts (rowid, search_blob, reference, buyer_name) VALUES (?, ?, ?, ?)',
    ),
    revision: d.prepare(
      `INSERT INTO tender_revisions (tender_id, kind, before_json, after_json, detected_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    buyerSeen: d.prepare(
      `INSERT INTO buyers (code, name, first_seen_at) VALUES (?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         name = CASE WHEN buyers.name = '' AND excluded.name <> '' THEN excluded.name ELSE buyers.name END`,
    ),
  }
  return stmts
}

/**
 * Which fields changed, in the language of things a supplier cares about.
 * A moved deadline is an alert; a re-serialised raw payload is not.
 */
function classifyChange(before: ExistingRow, after: CanonicalTender): string | null {
  if (before.deadline_at !== after.deadline_at) return 'deadline'
  if (before.mod_seq !== after.mod_seq) return 'modseq'
  if (before.title_fr !== after.title_fr) return 'title'
  return 'other'
}

/** Apply one canonical record. Returns what happened, for stats and matching. */
function upsert(
  t: CanonicalTender,
  ts: string,
  opts: { isDetail?: boolean } = {},
): 'inserted' | 'updated' | 'unchanged' {
  const s = statements()
  const existing = s.select.get(t.id)

  if (!existing) {
    const info = s.insert.run({ ...t, ts })
    s.ftsInsert.run(info.lastInsertRowid, t.search_blob, t.reference, t.buyer_name)
    s.revision.run(t.id, 'new', null, JSON.stringify({ deadline_at: t.deadline_at }), ts)
    if (t.buyer_code) s.buyerSeen.run(t.buyer_code, t.buyer_name, ts)
    return 'inserted'
  }

  if (existing.content_hash === t.content_hash && !opts.isDetail) {
    s.touch.run(ts, t.id)
    return 'unchanged'
  }

  const kind = classifyChange(existing, t)
  s.update.run({ ...t, ts })
  s.ftsDelete.run(existing.rowid)
  s.ftsInsert.run(existing.rowid, t.search_blob, t.reference, t.buyer_name)

  // A first detail fetch is enrichment, not a modification the user should be
  // told about, so it gets no revision row.
  if (kind && !(opts.isDetail && existing.detail_fetched_at === null)) {
    s.revision.run(
      t.id,
      kind,
      JSON.stringify({
        deadline_at: existing.deadline_at,
        title_fr: existing.title_fr,
        mod_seq: existing.mod_seq,
      }),
      JSON.stringify({ deadline_at: t.deadline_at, title_fr: t.title_fr, mod_seq: t.mod_seq }),
      ts,
    )
  }
  if (t.buyer_code) s.buyerSeen.run(t.buyer_code, t.buyer_name, ts)
  return 'updated'
}

// --- cursor ----------------------------------------------------------------

function readCursor(source: SourceKind): string | null {
  return kvGet(CURSOR_KEY(source))
}

function writeCursor(source: SourceKind, isoOrRaw: string): void {
  kvSet(CURSOR_KEY(source), isoOrRaw)
}

/** The TUNEPS-format `publicDt` floor for an incremental run. */
function incrementalFloor(source: SourceKind): string | null {
  const cur = readCursor(source)
  if (!cur) return null
  const t = Date.parse(cur)
  if (!Number.isFinite(t)) return null
  return isoToTuneps(new Date(t - OVERLAP_MS).toISOString())
}

// --- main passes -----------------------------------------------------------

export interface SyncOptions {
  /** 'incremental' honours the cursor; 'backfill' walks history. */
  mode?: 'incremental' | 'backfill'
  /** Hard cap on rows pulled in this run. */
  maxRows?: number
  pageSize?: number
  log?: (msg: string) => void
}

export async function syncTenders(opts: SyncOptions = {}): Promise<IngestResult> {
  return syncList('ao', opts)
}

export async function syncConsultations(opts: SyncOptions = {}): Promise<IngestResult> {
  return syncList('consultation', opts)
}

async function syncList(source: SourceKind, opts: SyncOptions): Promise<IngestResult> {
  const mode = opts.mode ?? 'incremental'
  const pageSize = opts.pageSize ?? (mode === 'backfill' ? 500 : 200)
  const maxRows = opts.maxRows ?? (mode === 'backfill' ? 20_000 : 4_000)
  const log = opts.log ?? (() => {})
  const d = ensureDb()

  const criteria: Criteria[] = []
  const floor = mode === 'incremental' ? incrementalFloor(source) : null
  if (floor) criteria.push({ key: 'publicDt', value: floor, specificSearch: '>=' })

  const result: IngestResult = {
    source,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    touched: [],
    revisions: 0,
  }

  const names = source === 'consultation' ? buyerNameMap() : null
  let pageIndex = 0
  let total = Infinity
  let newestSeen: string | null = null
  let emptyStreak = 0

  // `pageSize` must stay constant across the run: the upstream offset is a page
  // index, so shrinking the page mid-walk would skip or repeat rows.
  const limit = pageSize

  while (result.fetched < maxRows) {
    const page =
      source === 'ao'
        ? await fetchTenderPage(pageIndex, limit, criteria)
        : await fetchConsultationPage(pageIndex, limit, criteria)

    total = page.total
    const rows = page.data
    if (!rows.length) {
      // One empty page is the end of the result set.
      if (++emptyStreak >= 1) break
      pageIndex++
      continue
    }
    emptyStreak = 0

    const ts = nowIso()

    d.transaction(() => {
      for (const row of rows) {
        let canonical =
          source === 'ao'
            ? mapTenderList(row as never)
            : mapConsultation(row as never)

        if (source === 'consultation') {
          canonical = enrichConsultation(canonical, names!)
        }

        const outcome = upsert(canonical, ts)
        result[outcome]++
        if (outcome !== 'unchanged') result.touched.push(canonical.id)
        if (canonical.published_at && (!newestSeen || canonical.published_at > newestSeen)) {
          newestSeen = canonical.published_at
        }
      }
    })()

    result.fetched += rows.length
    pageIndex++
    log(
      `${source} ${result.fetched}/${Math.min(total, maxRows)} ` +
        `(+${result.inserted} new, ~${result.updated} changed)`,
    )

    // A short page means we reached the end of the result set.
    if (rows.length < limit) break

    // Incremental runs stop once two consecutive pages bring nothing new: the
    // date floor already bounds the window, this just avoids re-walking it.
    if (mode === 'incremental' && result.inserted === 0 && result.updated === 0 && pageIndex >= 2) {
      break
    }
  }

  if (newestSeen) {
    writeCursor(source, newestSeen)
    result.cursor = newestSeen
  }

  return result
}

/**
 * Consultations arrive without a buyer name and without a nature code. Both are
 * recoverable locally: the name from the buyer directory, the nature from the
 * sector code's leading digit.
 */
function enrichConsultation(t: CanonicalTender, names: Map<string, string>): CanonicalTender {
  const buyerName = (t.buyer_code && names.get(t.buyer_code)) || ''
  const domain = domainFromCategory(t.category_code)

  const next: CanonicalTender = {
    ...t,
    buyer_name: buyerName,
    domain_code: domain,
    domain_label_fr: labelFor('domain', domain, 'fr'),
    domain_label_ar: labelFor('domain', domain, 'ar'),
  }

  if (buyerName) {
    next.search_blob = buildSearchBlob([
      t.title_fr,
      t.title_ar,
      t.title_en,
      buyerName,
      t.reference,
      t.buyer_ref,
      t.category_label_fr,
      t.category_label_ar,
      t.gov_label_fr,
      t.gov_label_ar,
      next.domain_label_fr,
    ])
  }
  return next
}

/**
 * Second pass: pull the 108-field detail for notices we only know from the list
 * endpoint. Newest first, because that is what users are looking at, and budget
 * capped so a run never turns into an unbounded crawl of 58k notices.
 */
export async function enrichDetails(opts: { budget?: number; log?: (m: string) => void } = {}): Promise<IngestResult> {
  const budget = opts.budget ?? config.tuneps.detailBudget
  const log = opts.log ?? (() => {})
  const d = ensureDb()

  const pending = d
    .prepare<[number], { id: string; source_id: number }>(
      `SELECT id, source_id FROM tenders
        WHERE source = 'ao' AND detail_fetched_at IS NULL
        ORDER BY published_at DESC
        LIMIT ?`,
    )
    .all(budget)

  const result: IngestResult = {
    source: 'detail',
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    touched: [],
    revisions: 0,
  }

  const markFetched = d.prepare('UPDATE tenders SET detail_fetched_at = ? WHERE id = ?')

  for (const row of pending) {
    const detail = await fetchTenderDetail(row.source_id)
    result.fetched++

    const ts = nowIso()
    if (!detail) {
      // Mark it anyway: a 404 here is permanent, and retrying forever would
      // starve the budget for notices that do resolve.
      markFetched.run(ts, row.id)
      continue
    }

    const canonical = mapTenderDetail(detail)
    d.transaction(() => {
      const outcome = upsert(canonical, ts, { isDetail: true })
      result[outcome]++
      if (outcome === 'updated') result.touched.push(canonical.id)
      markFetched.run(ts, canonical.id)
    })()

    if (result.fetched % 25 === 0) log(`details ${result.fetched}/${pending.length}`)
  }

  return result
}

// --- run bookkeeping -------------------------------------------------------

export function startRun(source: string, mode: string): number {
  const info = ensureDb()
    .prepare('INSERT INTO sync_runs (source, mode, started_at) VALUES (?, ?, ?)')
    .run(source, mode, nowIso())
  return Number(info.lastInsertRowid)
}

export function finishRun(
  id: number,
  stats: { fetched: number; inserted: number; updated: number; matched?: number },
  error?: string,
): void {
  ensureDb()
    .prepare(
      `UPDATE sync_runs SET finished_at = ?, fetched = ?, inserted = ?, updated = ?,
              matched = ?, status = ?, error = ?
        WHERE id = ?`,
    )
    .run(
      nowIso(),
      stats.fetched,
      stats.inserted,
      stats.updated,
      stats.matched ?? 0,
      error ? 'failed' : 'ok',
      error ?? null,
      id,
    )
}

export interface LastSync {
  source: string
  mode: string
  started_at: string
  finished_at: string | null
  fetched: number
  inserted: number
  updated: number
  status: string
}

export function lastSyncRuns(limit = 6): LastSync[] {
  return ensureDb()
    .prepare<[number], LastSync>(
      `SELECT source, mode, started_at, finished_at, fetched, inserted, updated, status
         FROM sync_runs ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit)
}

/** Rebuild the FTS index from scratch. Needed after a normalisation change. */
export function rebuildFts(log: (m: string) => void = () => {}): number {
  const d = ensureDb()
  d.exec('DELETE FROM tenders_fts')
  const insert = d.prepare(
    'INSERT INTO tenders_fts (rowid, search_blob, reference, buyer_name) VALUES (?, ?, ?, ?)',
  )
  const rows = d
    .prepare<[], { rowid: number; search_blob: string; reference: string; buyer_name: string }>(
      'SELECT rowid, search_blob, reference, buyer_name FROM tenders',
    )
    .all()

  d.transaction(() => {
    for (const r of rows) insert.run(r.rowid, r.search_blob, r.reference, r.buyer_name)
  })()

  log(`rebuilt FTS over ${rows.length} rows`)
  return rows.length
}
