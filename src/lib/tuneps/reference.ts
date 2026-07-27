import { RAW_REFERENCE } from './reference.data'
import type { Locale } from '@/lib/i18n/dictionaries'

/**
 * TUNEPS code tables, harvested from live detail payloads (see
 * scripts/probe-codes.mjs). Baked in rather than fetched so filter menus render
 * instantly and the app stays usable if TUNEPS is down.
 */

export type Dimension = keyof typeof RAW_REFERENCE
export interface RefEntry {
  code: string
  fr: string
  ar: string
}

const CACHE = new Map<Dimension, RefEntry[]>()

export function entries(dim: Dimension): RefEntry[] {
  const hit = CACHE.get(dim)
  if (hit) return hit

  const table = RAW_REFERENCE[dim] as Record<string, { fr: string; ar: string }>
  const list = Object.entries(table)
    .map(([code, v]) => ({ code, fr: v.fr, ar: v.ar }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))

  CACHE.set(dim, list)
  return list
}

export function labelFor(dim: Dimension, code: string | null | undefined, locale: Locale): string | null {
  if (!code) return null
  const table = RAW_REFERENCE[dim] as Record<string, { fr: string; ar: string }>
  const hit = table[code]
  if (!hit) return null
  return (locale === 'ar' ? hit.ar || hit.fr : hit.fr || hit.ar) || null
}

/** Localised label with a graceful fallback to the raw code. */
export function label(dim: Dimension, code: string | null | undefined, locale: Locale): string {
  return labelFor(dim, code, locale) ?? (code ? String(code) : '—')
}

// --- domain inference ------------------------------------------------------

/**
 * The leading digit of a `bizKind` (sector) code encodes the procurement
 * nature. This is not documented anywhere; it falls out of the harvested table:
 *
 *   1xx → Fourniture de biens   (pbk 2391)
 *   3xx → Travaux               (pbk 2392)
 *   5xx → Fourniture de services(pbk 2393)
 *   7xx → Etudes                (pbk 2394)
 *
 * It matters because the consultations stream exposes `bizKind` but NOT `pbk`,
 * so without this the two sources could not share one "nature" filter — and a
 * unified filter is the whole point of the product.
 */
export const DOMAIN_CODES = {
  goods: '2391',
  works: '2392',
  services: '2393',
  studies: '2394',
} as const

export function domainFromCategory(categoryCode: string | null | undefined): string | null {
  if (!categoryCode) return null
  switch (categoryCode.trim()[0]) {
    case '1':
      return DOMAIN_CODES.goods
    case '3':
      return DOMAIN_CODES.works
    case '5':
      return DOMAIN_CODES.services
    case '7':
      return DOMAIN_CODES.studies
    default:
      return null
  }
}

/** Governorates, with the catch-all "99 / Autres" pushed to the end. */
export function governorates(): RefEntry[] {
  const all = entries('gov')
  const real = all.filter((g) => g.code !== '99')
  const other = all.filter((g) => g.code === '99')
  return [...real, ...other]
}

/** Sectors grouped under their inferred nature — how the filter menu reads. */
export function categoriesByDomain(locale: Locale): Array<{
  domain: string
  domainLabel: string
  items: RefEntry[]
}> {
  const groups = new Map<string, RefEntry[]>()
  for (const c of entries('category')) {
    const d = domainFromCategory(c.code)
    if (!d) continue
    const list = groups.get(d) ?? []
    list.push(c)
    groups.set(d, list)
  }
  const order = [DOMAIN_CODES.works, DOMAIN_CODES.goods, DOMAIN_CODES.services, DOMAIN_CODES.studies]
  return order
    .filter((d) => groups.has(d))
    .map((d) => ({
      domain: d,
      domainLabel: label('domain', d, locale),
      items: groups.get(d)!,
    }))
}

/** Short accent colour per nature — used consistently in badges and charts. */
export function domainAccent(code: string | null | undefined): 1 | 2 | 3 | 4 | 6 {
  switch (code) {
    case DOMAIN_CODES.works:
      return 2
    case DOMAIN_CODES.goods:
      return 1
    case DOMAIN_CODES.services:
      return 3
    case DOMAIN_CODES.studies:
      return 4
    default:
      return 6
  }
}
