import { config } from '@/lib/config'
import { ensureDb, nowIso } from '@/db'
import { fold } from '@/lib/text/normalize'
import { requestJson } from './http'

interface RawInst {
  umInstId: number
  instRegNo: string
  instNm?: string
  instNmAr?: string
}

/**
 * Sync the public-buyer directory (1.7k institutions).
 *
 * Worth its own pass because the consultations stream exposes only
 * `shopInstCd` with no name at all, and even the tender stream never gives the
 * Arabic name. One cheap sweep here makes both usable — and powers the buyer
 * directory pages.
 */
export async function syncBuyers(log: (m: string) => void = () => {}): Promise<number> {
  const d = ensureDb()
  const PAGE = 500
  let pageIndex = 0
  let total = Infinity
  let seen = 0

  const upsert = d.prepare(
    `INSERT INTO buyers (code, name, name_ar, first_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name    = CASE WHEN excluded.name    <> '' THEN excluded.name    ELSE buyers.name    END,
       name_ar = CASE WHEN excluded.name_ar <> '' THEN excluded.name_ar ELSE buyers.name_ar END`,
  )

  // As elsewhere in this API, `offSet` is a page index. This endpoint also
  // ignores `limit` entirely and returns the whole directory in one response,
  // so the short-page check below ends the loop after a single request.
  while (seen < total) {
    const res = await requestJson<{ payload: { total: number; data: RawInst[] } }>(
      `${config.tuneps.base}/umInst/data`,
      {
        method: 'POST',
        body: {
          pagination: { offSet: pageIndex, limit: PAGE },
          sort: { nameCol: 'instRegNo', direction: 'asc' },
          dataSearch: [],
          listSort: [],
          listCol: [],
        },
      },
    )
    total = res.payload.total
    const rows = res.payload.data
    if (!rows.length) break

    const ts = nowIso()
    d.transaction(() => {
      for (const r of rows) {
        if (!r.instRegNo) continue
        upsert.run(r.instRegNo.trim(), (r.instNm ?? '').trim(), (r.instNmAr ?? '').trim(), ts)
        seen++
      }
    })()

    pageIndex++
    log(`buyers ${Math.min(seen, total)}/${total}`)
    if (rows.length < PAGE) break
  }

  backfillBuyerNames(log)
  refreshBuyerCounters()

  return seen
}

/**
 * The consultations stream carries `shopInstCd` but no buyer name, so rows
 * ingested before the directory existed render as "—". Fill them in from the
 * directory and reindex, because the buyer name is one of the things people
 * search by.
 */
export function backfillBuyerNames(log: (m: string) => void = () => {}): number {
  const d = ensureDb()

  const missing = d
    .prepare<[], { rowid: number; id: string; name: string; search_blob: string; reference: string }>(
      `SELECT t.rowid, t.id, b.name, t.search_blob, t.reference
         FROM tenders t JOIN buyers b ON b.code = t.buyer_code
        WHERE (t.buyer_name = '' OR t.buyer_name IS NULL) AND b.name <> ''`,
    )
    .all()

  if (!missing.length) return 0

  const setName = d.prepare('UPDATE tenders SET buyer_name = ?, search_blob = ? WHERE id = ?')
  const ftsDelete = d.prepare('DELETE FROM tenders_fts WHERE rowid = ?')
  const ftsInsert = d.prepare(
    'INSERT INTO tenders_fts (rowid, search_blob, reference, buyer_name) VALUES (?, ?, ?, ?)',
  )

  d.transaction(() => {
    for (const row of missing) {
      // Append the folded buyer name rather than rebuilding the whole blob:
      // the rest of it is already correct and this keeps the pass cheap.
      const extra = fold(row.name)
        .split(' ')
        .filter((tok) => tok.length >= 2 && !row.search_blob.includes(tok))
        .join(' ')
      const blob = extra ? `${row.search_blob} ${extra}`.trim() : row.search_blob

      setName.run(row.name, blob, row.id)
      ftsDelete.run(row.rowid)
      ftsInsert.run(row.rowid, blob, row.reference, row.name)
    }
  })()

  log(`backfilled buyer name on ${missing.length} notices`)
  return missing.length
}

/** Denormalised activity counters so buyer pages need no aggregate scan. */
export function refreshBuyerCounters(): void {
  ensureDb().exec(`
    UPDATE buyers SET
      tender_count = COALESCE((
        SELECT COUNT(*) FROM tenders t WHERE t.buyer_code = buyers.code
      ), 0),
      last_published_at = (
        SELECT MAX(t.published_at) FROM tenders t WHERE t.buyer_code = buyers.code
      )
  `)
}

/** code -> display name, used to backfill the consultations stream. */
export function buyerNameMap(): Map<string, string> {
  const rows = ensureDb()
    .prepare<[], { code: string; name: string }>('SELECT code, name FROM buyers')
    .all()
  return new Map(rows.map((r) => [r.code, r.name]))
}
