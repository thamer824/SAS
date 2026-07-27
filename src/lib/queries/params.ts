import type { TenderFilters, TenderSort } from './tenders'
import type { SourceKind } from '@/lib/tuneps/ingest'
import type { WatchCriteria } from '@/lib/match/engine'

/**
 * URL <-> filter translation.
 *
 * The URL is the single source of truth for the feed: every filter is
 * shareable, bookmarkable, back-button-safe, and — crucially — convertible into
 * a watchlist with one click, because both speak the same vocabulary.
 */

export type SearchParams = Record<string, string | string[] | undefined>

const PAGE_SIZE = 25
export const FEED_PAGE_SIZE = PAGE_SIZE

function list(params: SearchParams, key: string): string[] {
  const raw = params[key]
  if (raw === undefined) return []
  const parts = Array.isArray(raw) ? raw : [raw]
  return parts
    .flatMap((p) => p.split(','))
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 40)
}

function one(params: SearchParams, key: string): string | undefined {
  const raw = params[key]
  const v = Array.isArray(raw) ? raw[0] : raw
  return v?.trim() || undefined
}

function flag(params: SearchParams, key: string): boolean {
  const v = one(params, key)
  return v === '1' || v === 'true'
}

function int(params: SearchParams, key: string): number | undefined {
  const v = one(params, key)
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

const SORTS: TenderSort[] = ['newest', 'deadline', 'relevance', 'buyer', 'published_asc']

/** Relative day windows keep URLs readable: `?since=7` not an ISO timestamp. */
function sinceIso(days: number | undefined): string | undefined {
  if (!days || days <= 0) return undefined
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export interface ParsedFeed {
  filters: TenderFilters
  page: number
  view: 'table' | 'cards'
  /** Raw values, for re-rendering the controls without re-deriving. */
  raw: {
    q?: string
    sources: string[]
    domains: string[]
    categories: string[]
    govs: string[]
    procedures: string[]
    buyers: string[]
    status: string
    since?: number
    deadlineBefore?: string
    minLead?: number
    international: boolean
    framework: boolean
    /** "Pour moi" — restrict to notices matched by the org's own alerts. */
    mine: boolean
    sort: TenderSort
  }
  activeCount: number
  /** True when ?adv=1 — reveals the full filter panel. */
  advanced: boolean
}

export function parseFeedParams(params: SearchParams): ParsedFeed {
  const q = one(params, 'q')
  const sources = list(params, 'source').filter((s): s is SourceKind => s === 'ao' || s === 'consultation')
  const domains = list(params, 'domain')
  const categories = list(params, 'cat')
  const govs = list(params, 'gov')
  const procedures = list(params, 'proc')
  const buyers = list(params, 'buyer')
  const statusRaw = one(params, 'status') ?? 'open'
  const status = (['all', 'open', 'closing', 'closed'] as const).includes(statusRaw as 'all')
    ? (statusRaw as TenderFilters['status'])
    : 'open'
  const since = int(params, 'since')
  const deadlineBefore = one(params, 'before')
  const minLead = int(params, 'lead')
  const international = flag(params, 'intl')
  const framework = flag(params, 'framework')
  const mine = flag(params, 'mine')

  const sortRaw = one(params, 'sort')
  // Default to relevance when there is a query, recency otherwise.
  const sort: TenderSort =
    sortRaw && SORTS.includes(sortRaw as TenderSort)
      ? (sortRaw as TenderSort)
      : q
        ? 'relevance'
        : 'newest'

  const page = Math.max(1, int(params, 'page') ?? 1)
  // Cards are the default: the audience scans on phones, and a box answers
  // "what / who / how long" faster than a row. The table stays available for
  // users comparing dozens of notices at once.
  const viewRaw = one(params, 'view')
  const view = viewRaw === 'table' ? 'table' : 'cards'

  const filters: TenderFilters = {
    q,
    sources: sources.length ? sources : undefined,
    domainCodes: domains.length ? domains : undefined,
    categoryCodes: categories.length ? categories : undefined,
    govCodes: govs.length ? govs : undefined,
    procedureCodes: procedures.length ? procedures : undefined,
    buyerCodes: buyers.length ? buyers : undefined,
    status,
    publishedSince: sinceIso(since),
    deadlineBefore: deadlineBefore ? `${deadlineBefore}T23:59:59.999Z` : undefined,
    minLeadDays: minLead,
    internationalOnly: international || undefined,
    frameworkOnly: framework || undefined,
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }

  // "Active" counts what the user chose, ignoring the default open-only status.
  const activeCount =
    (q ? 1 : 0) +
    sources.length +
    domains.length +
    categories.length +
    govs.length +
    procedures.length +
    buyers.length +
    (status !== 'open' ? 1 : 0) +
    (since ? 1 : 0) +
    (deadlineBefore ? 1 : 0) +
    (minLead ? 1 : 0) +
    (international ? 1 : 0) +
    (framework ? 1 : 0) +
    (mine ? 1 : 0)

  return {
    filters,
    page,
    view,
    raw: {
      q,
      sources,
      domains,
      categories,
      govs,
      procedures,
      buyers,
      status: status ?? 'open',
      since,
      deadlineBefore,
      minLead,
      international,
      framework,
      mine,
      sort,
    },
    activeCount,
    advanced: flag(params, 'adv'),
  }
}

/** Rebuild a query string with `patch` applied. `null` removes a key. */
export function buildQuery(
  params: SearchParams,
  patch: Record<string, string | string[] | number | boolean | null | undefined>,
): string {
  const next = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) next.append(key, v)
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    next.delete(key)
    if (value === null || value === undefined || value === false || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) if (v) next.append(key, String(v))
    } else if (value === true) {
      next.set(key, '1')
    } else {
      next.set(key, String(value))
    }
  }

  // Any filter change invalidates the page cursor.
  if (!('page' in patch)) next.delete('page')

  const s = next.toString()
  return s ? `?${s}` : ''
}

/** Toggle one value inside a multi-select param. */
export function toggleQuery(params: SearchParams, key: string, value: string): string {
  const raw = params[key]
  const current = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((p) => p.split(',')).filter(Boolean)
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return buildQuery(params, { [key]: next.length ? next : null })
}

/**
 * The feed → watchlist bridge. Turns the current URL filters into watchlist
 * criteria so "save this search" is exact rather than approximate.
 */
export function feedToCriteria(parsed: ParsedFeed): WatchCriteria {
  const { raw } = parsed
  return {
    keywords: raw.q ? raw.q.split(/\s+/).filter((k) => k.length >= 2) : [],
    excludeKeywords: [],
    sources: raw.sources as SourceKind[],
    domainCodes: raw.domains,
    categoryCodes: raw.categories,
    govCodes: raw.govs,
    procedureCodes: raw.procedures,
    buyerCodes: raw.buyers,
    minLeadDays: raw.minLead,
    internationalOnly: raw.international || undefined,
    openOnly: true,
    minScore: 40,
  }
}
