import crypto from 'node:crypto'
import { buildSearchBlob } from '@/lib/text/normalize'
import { tunepsToIso } from './dates'
import { labelFor } from './reference'
import type { RawConsultationListRow, RawTenderDetail, RawTenderListRow } from './client'

/**
 * The canonical tender record. Both TUNEPS streams collapse into this shape,
 * which is the product's core value: one feed, one filter set, one alert engine
 * across `appels d'offres` and `consultations`.
 */
export interface CanonicalTender {
  id: string
  source: 'ao' | 'consultation'
  source_id: number
  reference: string
  mod_seq: string
  buyer_ref: string | null

  title_fr: string
  title_ar: string
  title_en: string
  search_blob: string

  buyer_code: string | null
  buyer_name: string

  domain_code: string | null
  domain_label_fr: string | null
  domain_label_ar: string | null
  category_code: string | null
  category_label_fr: string | null
  category_label_ar: string | null
  procedure_code: string | null
  procedure_label_fr: string | null
  procedure_label_ar: string | null
  gov_code: string | null
  gov_label_fr: string | null
  gov_label_ar: string | null
  place_detail: string | null

  is_online: number
  is_international: number
  is_framework: number
  allows_consortium: number
  is_real: number

  doc_price: number | null
  doc_currency: string | null
  guarantee_label_fr: string | null
  eval_label_fr: string | null
  price_type_label_fr: string | null
  financing_label_fr: string | null
  validity_days: number | null

  published_at: string | null
  receipt_start_at: string | null
  deadline_at: string | null
  bid_open_at: string | null

  contact_name: string | null
  department: string | null
  address: string | null

  content_hash: string
  raw_json: string
}

const yn = (v: unknown, dflt = 0): number => (v === 'Y' ? 1 : v === 'N' ? 0 : dflt)
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Fields that constitute a *meaningful* change. TUNEPS mutates rows for
 * bookkeeping reasons all the time; hashing only these keeps revision history
 * (and therefore alert noise) honest.
 */
function hashOf(t: Omit<CanonicalTender, 'content_hash' | 'raw_json'>): string {
  const material = [
    t.title_fr,
    t.title_ar,
    t.mod_seq,
    t.deadline_at ?? '',
    t.receipt_start_at ?? '',
    t.bid_open_at ?? '',
    t.buyer_name,
    t.domain_code ?? '',
    t.category_code ?? '',
    t.gov_code ?? '',
    t.procedure_code ?? '',
    String(t.doc_price ?? ''),
  ].join('')
  return crypto.createHash('sha1').update(material).digest('hex')
}

function finish(base: Omit<CanonicalTender, 'content_hash' | 'raw_json'>, raw: unknown): CanonicalTender {
  return { ...base, content_hash: hashOf(base), raw_json: JSON.stringify(raw) }
}

/** Prefer French, fall back to Arabic, then English — never render an empty title. */
function primaryTitle(fr?: string | null, ar?: string | null, en?: string | null): string {
  return (fr || en || ar || '').trim() || '(sans intitulé)'
}

// --- appels d'offres -------------------------------------------------------

export function mapTenderList(row: RawTenderListRow): CanonicalTender {
  const title_fr = (row.bidNmFr ?? '').trim()
  const title_ar = (row.bidNmAr ?? '').trim()
  const title_en = (row.bidNmEn ?? '').trim()

  return finish(
    {
      id: `ao:${row.epBidMasterId}`,
      source: 'ao',
      source_id: row.epBidMasterId,
      reference: row.bidNo,
      mod_seq: row.bidModSeq ?? '00',
      buyer_ref: null,

      title_fr: title_fr || primaryTitle(title_fr, title_ar, title_en),
      title_ar,
      title_en,
      search_blob: buildSearchBlob([title_fr, title_ar, title_en, row.bidInstNm, row.bidNo]),

      buyer_code: null,
      buyer_name: (row.bidInstNm ?? '').trim(),

      domain_code: null,
      domain_label_fr: null,
      domain_label_ar: null,
      category_code: null,
      category_label_fr: null,
      category_label_ar: null,
      procedure_code: null,
      procedure_label_fr: null,
      procedure_label_ar: null,
      gov_code: null,
      gov_label_fr: null,
      gov_label_ar: null,
      place_detail: null,

      is_online: 1,
      is_international: 0,
      is_framework: 0,
      allows_consortium: 0,
      is_real: 1,

      doc_price: null,
      doc_currency: null,
      guarantee_label_fr: null,
      eval_label_fr: null,
      price_type_label_fr: null,
      financing_label_fr: null,
      validity_days: null,

      published_at: tunepsToIso(row.publicDt),
      receipt_start_at: null,
      deadline_at: tunepsToIso(row.bdRecvEndDt),
      bid_open_at: null,

      contact_name: null,
      department: null,
      address: null,
    },
    row,
  )
}

/** Enrich a list-derived record with the 108-field detail payload. */
export function mapTenderDetail(d: RawTenderDetail): CanonicalTender {
  const title_fr = (d.bidNmFr ?? '').trim()
  const title_ar = (d.bidNmAr ?? '').trim()
  const title_en = (d.bidNmEn ?? '').trim()
  const govCode = str(d.executionPlace)
  const catCode = str(d.bizKind)
  const procCode = str(d.procedureType)
  const domainCode = d.pbkStrId != null ? String(d.pbkStrId) : null

  return finish(
    {
      id: `ao:${d.epBidMasterId}`,
      source: 'ao',
      source_id: d.epBidMasterId,
      reference: d.bidNo,
      mod_seq: d.bidModSeq ?? '00',
      buyer_ref: str(d.refNo),

      title_fr: title_fr || primaryTitle(title_fr, title_ar, title_en),
      title_ar,
      title_en,
      search_blob: buildSearchBlob([
        title_fr,
        title_ar,
        title_en,
        d.bidInstNm,
        d.bidNo,
        d.refNo,
        d.bizKindStrFr,
        d.bizKindStrAr,
        d.pbkStrFr,
        d.pbkStrAr,
        d.executionPlaceStrFr,
        d.executionPlaceStrAr,
        d.bdDepartFr,
      ]),

      buyer_code: str(d.bidInstCd) ?? str(d.instRegNo),
      buyer_name: (d.bidInstNm ?? '').trim(),

      domain_code: domainCode,
      domain_label_fr: str(d.pbkStrFr),
      domain_label_ar: str(d.pbkStrAr),
      category_code: catCode,
      category_label_fr: str(d.bizKindStrFr) ?? labelFor('category', catCode, 'fr'),
      category_label_ar: str(d.bizKindStrAr) ?? labelFor('category', catCode, 'ar'),
      procedure_code: procCode,
      procedure_label_fr: str(d.procedureTypeStrFr) ?? labelFor('procedure', procCode, 'fr'),
      procedure_label_ar: str(d.procedureTypeStrAr) ?? labelFor('procedure', procCode, 'ar'),
      gov_code: govCode,
      gov_label_fr: str(d.executionPlaceStrFr) ?? labelFor('gov', govCode, 'fr'),
      gov_label_ar: str(d.executionPlaceStrAr) ?? labelFor('gov', govCode, 'ar'),
      place_detail: str(d.executionPlaceDetail as string),

      is_online: d.onOffType === '1' ? 1 : 0,
      is_international: yn(d.internationalBidYn),
      is_framework: yn(d.frameworkYn),
      allows_consortium: yn(d.consorYn),
      is_real: yn(d.realYn, 1),

      doc_price: num(d.biddingDocPrice),
      doc_currency: str(d.biddingDocPriceCurr),
      guarantee_label_fr: str(d.guaranteeTypeStrFr),
      eval_label_fr: str(d.evalMethodStrFr),
      price_type_label_fr: str(d.priceTypeStrFr),
      financing_label_fr: str(d.financialMethodStrFr),
      validity_days: num(d.bidExpiredDays),

      published_at: tunepsToIso(d.publicDt),
      receipt_start_at: tunepsToIso(d.bdRecvStartDt),
      deadline_at: tunepsToIso(d.bdRecvEndDt),
      bid_open_at: tunepsToIso(d.bdOpenDt),

      contact_name: str(d.staffNm),
      department: str(d.bdDepartFr) ?? str(d.bdDepartAr),
      address: str(d.bdRecvAddrsFr) ?? str(d.bdRecvAddrsAr),
    },
    d,
  )
}

// --- consultations ---------------------------------------------------------

export function mapConsultation(row: RawConsultationListRow): CanonicalTender {
  const title_fr = (row.shopNmFr ?? '').trim()
  const title_ar = (row.shopNmAr ?? '').trim()
  const title_en = (row.shopNmEn ?? '').trim()
  const govCode = str(row.executionPlace)
  const catCode = str(row.bizKind)

  return finish(
    {
      id: `cons:${row.spShopMasterId}`,
      source: 'consultation',
      source_id: row.spShopMasterId,
      reference: row.shopNo,
      mod_seq: row.shopModSeq ?? '00',
      buyer_ref: str(row.refNo),

      title_fr: title_fr || primaryTitle(title_fr, title_ar, title_en),
      title_ar,
      title_en,
      search_blob: buildSearchBlob([
        title_fr,
        title_ar,
        title_en,
        row.shopNo,
        row.refNo,
        labelFor('category', catCode, 'fr'),
        labelFor('gov', govCode, 'fr'),
        labelFor('gov', govCode, 'ar'),
      ]),

      buyer_code: str(row.shopInstCd),
      buyer_name: '', // resolved from the buyers table during ingest
      domain_code: null,
      domain_label_fr: null,
      domain_label_ar: null,
      category_code: catCode,
      category_label_fr: labelFor('category', catCode, 'fr'),
      category_label_ar: labelFor('category', catCode, 'ar'),
      procedure_code: 'consultation',
      procedure_label_fr: 'Consultation / bon de commande',
      procedure_label_ar: 'استشارة / سند تزويد',
      gov_code: govCode,
      gov_label_fr: labelFor('gov', govCode, 'fr'),
      gov_label_ar: labelFor('gov', govCode, 'ar'),
      place_detail: str(row.executionPlaceDetail),

      is_online: row.onOffType === '1' ? 1 : 0,
      is_international: yn(row.internationalShopYn),
      is_framework: 0,
      allows_consortium: 0,
      is_real: yn(row.realYn, 1),

      doc_price: null,
      doc_currency: null,
      guarantee_label_fr: null,
      eval_label_fr: null,
      price_type_label_fr: null,
      financing_label_fr: null,
      validity_days: num(row.shopExpiredDays),

      published_at: tunepsToIso(row.publicDt),
      receipt_start_at: tunepsToIso(row.spRecvStartDt),
      deadline_at: tunepsToIso(row.spRecvEndDt),
      bid_open_at: tunepsToIso(row.spOpenDt),

      contact_name: null,
      department: null,
      address: null,
    },
    row,
  )
}

/** Public URL of the original notice on TUNEPS, for the "voir la source" link. */
export function tunepsSourceUrl(t: Pick<CanonicalTender, 'source' | 'source_id' | 'reference'>): string {
  return t.source === 'ao'
    ? `https://www.tuneps.tn/portail/offres/details/${t.source_id}/${t.reference}`
    : `https://www.tuneps.tn/portail/consultations/consultationdetails/${t.source_id}/${t.reference}`
}
