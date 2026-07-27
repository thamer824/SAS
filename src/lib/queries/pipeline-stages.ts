/**
 * Pure pipeline vocabulary — no database import.
 *
 * Kept separate from `pipeline.ts` on purpose: client components need STAGES as
 * a runtime value, and importing it from the query module would drag
 * better-sqlite3 (and `node:fs`) into the browser bundle.
 */

export const STAGES = [
  'watching',
  'qualifying',
  'preparing',
  'submitted',
  'won',
  'lost',
  'skipped',
] as const

export type Stage = (typeof STAGES)[number]

/** Stages shown as board columns; the rest live in an archive list. */
export const BOARD_STAGES: Stage[] = ['watching', 'qualifying', 'preparing', 'submitted']
export const CLOSED_STAGES: Stage[] = ['won', 'lost', 'skipped']

export function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v)
}

export interface ChecklistEntry {
  label: string
  done: boolean
}

/** Default document checklist for a Tunisian public-tender submission. */
export const DEFAULT_CHECKLIST: ChecklistEntry[] = [
  { label: 'Attestation fiscale', done: false },
  { label: 'Attestation CNSS', done: false },
  { label: 'Registre national des entreprises (RNE)', done: false },
  { label: 'Cautionnement provisoire', done: false },
  { label: 'Déclaration sur l’honneur', done: false },
  { label: 'Offre technique', done: false },
  { label: 'Offre financière', done: false },
]

export function parseChecklist(raw: string): ChecklistEntry[] {
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .filter((e): e is ChecklistEntry => e && typeof e.label === 'string')
      .map((e) => ({ label: String(e.label).slice(0, 160), done: Boolean(e.done) }))
  } catch {
    return []
  }
}
