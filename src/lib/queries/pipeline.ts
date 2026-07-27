import { SQL_NOW, SQL_NOW_PLUS } from '@/db/sql'
import { ensureDb, nowIso } from '@/db'
import { newId } from '@/lib/ids'
import { DEFAULT_CHECKLIST, type ChecklistEntry, type Stage } from './pipeline-stages'

/**
 * Bid pipeline — the layer TUNEPS has no equivalent for. Finding a tender is
 * step one; deciding, assigning, assembling documents and tracking the outcome
 * is where suppliers actually lose deals.
 *
 * The stage vocabulary lives in ./pipeline-stages so client components can
 * import it without pulling in SQLite.
 */

export {
  STAGES,
  BOARD_STAGES,
  CLOSED_STAGES,
  isStage,
  DEFAULT_CHECKLIST,
  parseChecklist,
  type Stage,
  type ChecklistEntry,
} from './pipeline-stages'

export interface PipelineItem {
  id: string
  org_id: string
  tender_id: string
  stage: Stage
  owner_id: string | null
  owner_name: string | null
  notes: string
  expected_value: number | null
  checklist: string
  created_at: string
  updated_at: string
}

export function listPipeline(orgId: string): PipelineItem[] {
  return ensureDb()
    .prepare<[string], PipelineItem>(
      `SELECT p.*, u.full_name AS owner_name
         FROM pipeline_items p
         LEFT JOIN users u ON u.id = p.owner_id
        WHERE p.org_id = ?
        ORDER BY p.updated_at DESC`,
    )
    .all(orgId)
}

export function getPipelineItem(orgId: string, tenderId: string): PipelineItem | null {
  return (
    ensureDb()
      .prepare<[string, string], PipelineItem>(
        `SELECT p.*, u.full_name AS owner_name
           FROM pipeline_items p LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.org_id = ? AND p.tender_id = ?`,
      )
      .get(orgId, tenderId) ?? null
  )
}

/** Tender ids the org already tracks — used to badge feed rows. */
export function trackedTenderIds(orgId: string, tenderIds: string[]): Set<string> {
  if (!tenderIds.length) return new Set()
  const rows = ensureDb()
    .prepare<unknown[], { tender_id: string }>(
      `SELECT tender_id FROM pipeline_items
        WHERE org_id = ? AND tender_id IN (${tenderIds.map(() => '?').join(', ')})`,
    )
    .all(orgId, ...tenderIds)
  return new Set(rows.map((r) => r.tender_id))
}

export function addToPipeline(
  orgId: string,
  userId: string,
  tenderId: string,
  stage: Stage = 'watching',
): string {
  const d = ensureDb()
  const existing = getPipelineItem(orgId, tenderId)
  if (existing) return existing.id

  const id = newId('pl')
  const ts = nowIso()
  d.transaction(() => {
    d.prepare(
      `INSERT INTO pipeline_items
         (id, org_id, tender_id, stage, owner_id, checklist, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, orgId, tenderId, stage, userId, JSON.stringify(DEFAULT_CHECKLIST), ts, ts)

    d.prepare(
      `INSERT INTO pipeline_events (item_id, user_id, kind, detail, created_at)
       VALUES (?, ?, 'stage', ?, ?)`,
    ).run(id, userId, stage, ts)
  })()

  return id
}

export function removeFromPipeline(orgId: string, tenderId: string): void {
  ensureDb()
    .prepare('DELETE FROM pipeline_items WHERE org_id = ? AND tender_id = ?')
    .run(orgId, tenderId)
}

export function setStage(orgId: string, userId: string, itemId: string, stage: Stage): void {
  const d = ensureDb()
  const ts = nowIso()
  d.transaction(() => {
    const changed = d
      .prepare('UPDATE pipeline_items SET stage = ?, updated_at = ? WHERE id = ? AND org_id = ?')
      .run(stage, ts, itemId, orgId).changes
    if (changed) {
      d.prepare(
        `INSERT INTO pipeline_events (item_id, user_id, kind, detail, created_at)
         VALUES (?, ?, 'stage', ?, ?)`,
      ).run(itemId, userId, stage, ts)
    }
  })()
}

export function updateItem(
  orgId: string,
  userId: string,
  itemId: string,
  patch: { notes?: string; expected_value?: number | null; checklist?: ChecklistEntry[] },
): void {
  const d = ensureDb()
  const ts = nowIso()
  const sets: string[] = []
  const args: unknown[] = []

  if (patch.notes !== undefined) {
    sets.push('notes = ?')
    args.push(patch.notes.slice(0, 8000))
  }
  if (patch.expected_value !== undefined) {
    sets.push('expected_value = ?')
    args.push(patch.expected_value)
  }
  if (patch.checklist !== undefined) {
    sets.push('checklist = ?')
    args.push(JSON.stringify(patch.checklist.slice(0, 40)))
  }
  if (!sets.length) return

  sets.push('updated_at = ?')
  args.push(ts, itemId, orgId)

  d.transaction(() => {
    d.prepare(`UPDATE pipeline_items SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).run(...args)
    if (patch.notes !== undefined) {
      d.prepare(
        `INSERT INTO pipeline_events (item_id, user_id, kind, detail, created_at)
         VALUES (?, ?, 'note', '', ?)`,
      ).run(itemId, userId, ts)
    }
    if (patch.checklist !== undefined) {
      const done = patch.checklist.filter((c) => c.done).length
      d.prepare(
        `INSERT INTO pipeline_events (item_id, user_id, kind, detail, created_at)
         VALUES (?, ?, 'checklist', ?, ?)`,
      ).run(itemId, userId, `${done}/${patch.checklist.length}`, ts)
    }
  })()
}

export interface PipelineEvent {
  kind: string
  detail: string
  created_at: string
  user_name: string | null
}

export function itemEvents(itemId: string, limit = 20): PipelineEvent[] {
  return ensureDb()
    .prepare<[string, number], PipelineEvent>(
      `SELECT e.kind, e.detail, e.created_at, u.full_name AS user_name
         FROM pipeline_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.item_id = ? ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(itemId, limit)
}

export interface PipelineStats {
  total: number
  submitted: number
  won: number
  lost: number
  atRisk: number
  winRate: number | null
  pipelineValue: number
}

export function pipelineStats(orgId: string): PipelineStats {
  const d = ensureDb()
  const row = d
    .prepare<[string], { total: number; submitted: number; won: number; lost: number; value: number | null }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN stage = 'submitted' THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) AS won,
         SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) AS lost,
         SUM(CASE WHEN stage IN ('watching','qualifying','preparing','submitted')
                  THEN COALESCE(expected_value, 0) ELSE 0 END) AS value
       FROM pipeline_items WHERE org_id = ?`,
    )
    .get(orgId)!

  const atRisk = d
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM pipeline_items p JOIN tenders t ON t.id = p.tender_id
        WHERE p.org_id = ? AND p.stage IN ('watching','qualifying','preparing')
          AND t.deadline_at > ${SQL_NOW}
          AND t.deadline_at <= ${SQL_NOW_PLUS("'+3 days'")}`,
    )
    .get(orgId)!.n

  const decided = (row.won ?? 0) + (row.lost ?? 0)
  return {
    total: row.total ?? 0,
    submitted: row.submitted ?? 0,
    won: row.won ?? 0,
    lost: row.lost ?? 0,
    atRisk,
    winRate: decided > 0 ? Math.round(((row.won ?? 0) / decided) * 100) : null,
    pipelineValue: row.value ?? 0,
  }
}

