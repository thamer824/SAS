import type { TenderRow } from '@/lib/queries/tenders'
import { tunepsSourceUrl } from '@/lib/tuneps/map'

/**
 * CSV export tuned for Excel on a Tunisian desktop.
 *
 *  - UTF-8 BOM, or Excel mangles Arabic titles and French accents.
 *  - `sep=;` hint line, because a French/Arabic Windows locale uses `;` as the
 *    list separator and would otherwise put every row in one column.
 *  - CRLF line endings.
 */

const SEP = ';'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Guard against CSV formula injection when a title starts with = + - @.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  if (safe.includes('"') || safe.includes(SEP) || /[\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

const COLUMNS: Array<{ header: string; get: (t: TenderRow) => unknown }> = [
  { header: 'Référence', get: (t) => t.reference },
  { header: 'Révision', get: (t) => t.mod_seq },
  { header: 'Type', get: (t) => (t.source === 'ao' ? "Appel d'offres" : 'Consultation') },
  { header: 'Objet (FR)', get: (t) => t.title_fr },
  { header: 'Objet (AR)', get: (t) => t.title_ar },
  { header: 'Acheteur', get: (t) => t.buyer_name },
  { header: 'Code acheteur', get: (t) => t.buyer_code },
  { header: 'Nature', get: (t) => t.domain_label_fr },
  { header: 'Secteur', get: (t) => t.category_label_fr },
  { header: 'Procédure', get: (t) => t.procedure_label_fr },
  { header: 'Gouvernorat', get: (t) => t.gov_label_fr },
  { header: 'Publication', get: (t) => isoDate(t.published_at) },
  { header: 'Date limite', get: (t) => isoDateTime(t.deadline_at) },
  { header: 'Ouverture', get: (t) => isoDateTime(t.bid_open_at) },
  { header: 'Jours restants', get: (t) => daysLeft(t.deadline_at) },
  { header: 'Prix dossier', get: (t) => t.doc_price },
  { header: 'Devise', get: (t) => t.doc_currency },
  { header: 'International', get: (t) => (t.is_international ? 'Oui' : 'Non') },
  { header: 'Accord-cadre', get: (t) => (t.is_framework ? 'Oui' : 'Non') },
  { header: 'Lien TUNEPS', get: (t) => tunepsSourceUrl(t) },
]

function isoDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function isoDateTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

function daysLeft(iso: string | null): string {
  if (!iso) return ''
  const n = Math.floor((Date.parse(iso) - Date.now()) / 86_400_000)
  return Number.isFinite(n) ? String(n) : ''
}

export function tendersToCsv(rows: TenderRow[]): string {
  const lines: string[] = [
    `sep=${SEP}`,
    COLUMNS.map((c) => cell(c.header)).join(SEP),
    ...rows.map((r) => COLUMNS.map((c) => cell(c.get(r))).join(SEP)),
  ]
  return `﻿${lines.join('\r\n')}\r\n`
}

export function csvFilename(prefix = 'mounaqasat'): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${prefix}-${stamp}.csv`
}
