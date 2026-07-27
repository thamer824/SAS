'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveItemDetails } from '@/lib/actions/pipeline-actions'
import {
  Button,
  Field,
  Icon,
  Panel,
  PanelHeader,
  cx,
  inputClass,
} from '@/components/ui/primitives'
import type { ChecklistEntry } from '@/lib/queries/pipeline-stages'

function SaveBar({ labels }: { labels: { save: string; saving: string } }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? labels.saving : labels.save}
    </Button>
  )
}

/**
 * Notes, value and document checklist in one form.
 *
 * The checklist posts as parallel `cl_label` / `cl_done_<i>` fields so the whole
 * thing is a single server action round-trip rather than per-tick fetches — which
 * matters on the patchy mobile connections this audience often works from.
 */
export function ItemEditor({
  itemId,
  initial,
  labels,
}: {
  itemId: string
  initial: { notes: string; expectedValue: number | null; checklist: ChecklistEntry[] }
  labels: {
    notes: string
    value: string
    checklist: string
    addItem: string
    save: string
    saving: string
    saved: string
  }
}) {
  const [checklist, setChecklist] = useState<ChecklistEntry[]>(initial.checklist)
  const action = saveItemDetails.bind(null, itemId)

  const done = checklist.filter((c) => c.done).length

  return (
    <form action={action} className="space-y-4">
      <Panel>
        <PanelHeader
          title={labels.checklist}
          action={
            <span className="num text-2xs text-[var(--text-muted)]">
              {done}/{checklist.length}
            </span>
          }
        />
        <ul className="divide-y divide-[var(--border-subtle)]">
          {checklist.map((entry, i) => (
            <li key={`${entry.label}-${i}`} className="flex items-center gap-2.5 px-4 py-2">
              <input
                type="checkbox"
                name={`cl_done_${i}`}
                checked={entry.done}
                onChange={(e) =>
                  setChecklist((prev) =>
                    prev.map((c, j) => (j === i ? { ...c, done: e.target.checked } : c)),
                  )
                }
                className="size-3.5 shrink-0 accent-[var(--accent)]"
                aria-label={entry.label}
              />
              {/* The label travels back as a hidden field so reordering or
                  renaming stays lossless. */}
              <input type="hidden" name="cl_label" value={entry.label} />
              <span
                className={cx(
                  'min-w-0 flex-1 truncate text-xs bidi-isolate',
                  entry.done && 'text-[var(--text-faint)] line-through',
                )}
              >
                {entry.label}
              </span>
              <button
                type="button"
                onClick={() => setChecklist((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
                aria-label="Retirer"
              >
                <Icon.x size={13} />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--border-subtle)] p-3">
          <input
            name="cl_new"
            placeholder={labels.addItem}
            maxLength={160}
            className={cx(inputClass, 'text-xs')}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={labels.notes} />
        <div className="space-y-4 p-4">
          <Field label={labels.value} htmlFor="expected_value">
            <input
              id="expected_value"
              name="expected_value"
              type="text"
              inputMode="decimal"
              dir="ltr"
              defaultValue={initial.expectedValue ?? ''}
              placeholder="0"
              className={inputClass}
            />
          </Field>

          <Field label={labels.notes} htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              rows={7}
              defaultValue={initial.notes}
              className={cx(inputClass, 'resize-y leading-relaxed')}
            />
          </Field>

          <SaveBar labels={labels} />
        </div>
      </Panel>
    </form>
  )
}
