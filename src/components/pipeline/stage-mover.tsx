'use client'

import { useTransition } from 'react'
import { Icon, cx } from '@/components/ui/primitives'
// Import from the pure module, never from the query layer: the latter pulls in
// SQLite, which cannot be bundled for the browser.
import { STAGES, type Stage } from '@/lib/queries/pipeline-stages'

/**
 * Stage change as a native <select>.
 *
 * Deliberately not drag-and-drop: a board with 4 columns on a phone makes DnD
 * fiddly and inaccessible, whereas a select is keyboard-navigable, works on
 * touch, and is one tap. The server action is the only mutation path.
 */
export function StageMover({
  itemId,
  current,
  action,
  labels,
  moveLabel,
}: {
  itemId: string
  current: Stage
  action: (itemId: string, stage: string) => Promise<void>
  labels: Record<Stage, string>
  moveLabel: string
}) {
  const [pending, start] = useTransition()

  return (
    <label className={cx('relative inline-flex items-center', pending && 'opacity-50')}>
      <span className="sr-only">{moveLabel}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          start(async () => {
            await action(itemId, next)
          })
        }}
        aria-label={moveLabel}
        className="cursor-pointer appearance-none rounded-md border border-[var(--border-subtle)] bg-transparent py-0.5 pe-5 ps-1.5 text-2xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </select>
      <Icon.chevronDown
        size={11}
        className="pointer-events-none absolute end-1 text-[var(--text-faint)]"
      />
    </label>
  )
}
