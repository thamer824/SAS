import { config } from '@/lib/config'
import { requestJson, sleep } from './http'

/**
 * TUNEPS portal API — the shapes below were recovered from the production
 * Angular bundle (main.js: AppeloffreService / ConsultationService,
 * src/app/domain/search/{SearchObject,Pagination,Sort,CriteriaSearch}).
 *
 * Everything under /api2/portail is public and unauthenticated.
 */

export type Comparator = '=' | '>=' | '<=' | 'like' | '!='

export interface Criteria {
  key: string
  value: string | number
  specificSearch: Comparator
}

export interface SearchObject {
  /**
   * CAREFUL: despite the name, `offSet` is a **page index**, not a row offset.
   * The server computes `LIMIT limit OFFSET offSet * limit`.
   *
   * Verified empirically: with limit=500, offSet=117 returns the last 124 of
   * 58,624 notices (117 × 500 + 124 = 58,624) and offSet=118 returns none.
   * Treating it as a row offset silently caps ingestion at the newest `limit`
   * notices, because offSet=500 lands past the end of the table and yields [].
   */
  pagination: { offSet: number; limit: number }
  sort?: { nameCol: string; direction: 'asc' | 'desc' | 'desc nulls last' | 'asc nulls last' }
  dataSearch: Criteria[]
  listSort: unknown[]
  listCol: unknown[]
}

interface Envelope<T> {
  code: string
  payload: T
}

interface Page<T> {
  total: number
  data: T[]
}

/** Row shape of POST /portail/bid/master/data (appels d'offres list). */
export interface RawTenderListRow {
  epBidMasterId: number
  bidNo: string
  bidModSeq: string
  bidNmFr?: string
  bidNmAr?: string
  bidNmEn?: string
  bidInstNm?: string
  publicDt?: string
  publicYn?: string
  bdRecvEndDt?: string
}

/** Row shape of POST /portail/spShopMaster/data (consultations list). */
export interface RawConsultationListRow {
  spShopMasterId: number
  shopNo: string
  shopModSeq: string
  shopNmFr?: string
  shopNmAr?: string
  shopNmEn?: string
  shopInstCd?: string
  refNo?: string
  publicDt?: string
  publicYn?: string
  realYn?: string
  bizKind?: string
  executionPlace?: string
  executionPlaceDetail?: string
  internationalShopYn?: string
  onOffType?: string
  shopExpiredDays?: number
  spRecvStartDt?: string
  spRecvEndDt?: string
  spOpenDt?: string
}

/** GET /portail/bid/master/{id} — 108 fields; only what we consume is typed. */
export interface RawTenderDetail extends RawTenderListRow {
  refNo?: string
  bidInstCd?: string
  instRegNo?: string
  bdDepartFr?: string
  bdDepartAr?: string
  bdRecvAddrsFr?: string
  bdRecvAddrsAr?: string
  bdRecvStartDt?: string
  bdOpenDt?: string
  bidExpiredDays?: string
  biddingDocPrice?: number
  biddingDocPriceCurr?: string
  pbkStrFr?: string
  pbkStrAr?: string
  pbkStrId?: number
  bizKind?: string
  bizKindStrFr?: string
  bizKindStrAr?: string
  procedureType?: string
  procedureTypeStrFr?: string
  procedureTypeStrAr?: string
  executionPlace?: string
  executionPlaceStrFr?: string
  executionPlaceStrAr?: string
  guaranteeTypeStrFr?: string
  evalMethodStrFr?: string
  priceTypeStrFr?: string
  financialMethodStrFr?: string
  onOffType?: string
  internationalBidYn?: string
  frameworkYn?: string
  consorYn?: string
  realYn?: string
  staffNm?: string
  [key: string]: unknown
}

// --- pacing ----------------------------------------------------------------

let lastCallAt = 0

/**
 * Serialise and pace upstream calls. TUNEPS is a public service run by the
 * Tunisian state; hammering it would be both rude and a fast route to a block.
 * One request at a time, with a configurable gap.
 */
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const wait = config.tuneps.delayMs - (Date.now() - lastCallAt)
  if (wait > 0) await sleep(wait)
  try {
    return await fn()
  } finally {
    lastCallAt = Date.now()
  }
}

function url(path: string): string {
  return `${config.tuneps.base}/${path.replace(/^\//, '')}`
}

export function searchObject(
  page: number,
  limit: number,
  sortCol: string,
  direction: NonNullable<SearchObject['sort']>['direction'],
  criteria: Criteria[] = [],
): SearchObject {
  return {
    pagination: { offSet: page, limit },
    sort: { nameCol: sortCol, direction },
    dataSearch: criteria,
    listSort: [],
    listCol: [],
  }
}

// --- public surface --------------------------------------------------------

/**
 * Appels d'offres — the main tender stream (~58k published notices).
 * `page` is zero-based; see the note on SearchObject.pagination.
 */
export async function fetchTenderPage(
  page: number,
  limit: number,
  criteria: Criteria[] = [],
): Promise<Page<RawTenderListRow>> {
  const body = searchObject(page, limit, 'publicDt', 'desc nulls last', [
    { key: 'publicYn', value: 'Y', specificSearch: '=' },
    ...criteria,
  ])
  const res = await paced(() =>
    requestJson<Envelope<Page<RawTenderListRow>>>(url('bid/master/data'), {
      method: 'POST',
      body,
    }),
  )
  return res.payload
}

/** Consultations / bons de commande — the long tail (~241k published). */
export async function fetchConsultationPage(
  page: number,
  limit: number,
  criteria: Criteria[] = [],
): Promise<Page<RawConsultationListRow>> {
  const body = searchObject(page, limit, 'publicDt', 'desc nulls last', [
    { key: 'publicYn', value: 'Y', specificSearch: '=' },
    ...criteria,
  ])
  const res = await paced(() =>
    requestJson<Envelope<Page<RawConsultationListRow>>>(url('spShopMaster/data'), {
      method: 'POST',
      body,
    }),
  )
  return res.payload
}

/** Full detail for one appel d'offres. Returns null when TUNEPS 404s. */
export async function fetchTenderDetail(id: number): Promise<RawTenderDetail | null> {
  try {
    const res = await paced(() =>
      requestJson<Envelope<RawTenderDetail>>(url(`bid/master/${id}`), { retries: 2 }),
    )
    return res.payload ?? null
  } catch {
    return null
  }
}

/** Lots for an appel d'offres, when the buyer split it. */
export async function fetchTenderLots(id: number): Promise<unknown[]> {
  try {
    const res = await paced(() =>
      requestJson<Envelope<unknown[]>>(url(`bid/classification/${id}`), { retries: 1 }),
    )
    return Array.isArray(res.payload) ? res.payload : []
  } catch {
    return []
  }
}

/** Liveness probe used by the sync CLI and the /api/health route. */
export async function probe(): Promise<{ ok: boolean; total?: number; error?: string }> {
  try {
    const page = await fetchTenderPage(0, 1)
    return { ok: true, total: page.total }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
