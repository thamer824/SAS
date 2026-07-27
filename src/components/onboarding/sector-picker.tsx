'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { completeOnboarding, type OnboardingState } from '@/lib/actions/onboarding-actions'
import { Icon, cx } from '@/components/ui/primitives'

export interface SectorGroup {
  domain: string
  domainLabel: string
  items: Array<{ code: string; label: string; count: number }>
}

export interface PickerLabels {
  sectors: string
  sectorsHint: string
  regions: string
  regionsHint: string
  notify: string
  instant: string
  instantHint: string
  daily: string
  dailyHint: string
  submit: string
  submitting: string
  selected: string
  selectedPlural: string
  needSector: string
  matchesNow: string
  error: string
}

function Submit({ labels, disabled }: { labels: PickerLabels; disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(
        'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl',
        'bg-[var(--accent)] text-sm font-semibold text-[var(--accent-fg)]',
        'transition-colors hover:bg-[var(--accent-hover)]',
        'disabled:pointer-events-none disabled:opacity-45 sm:w-auto sm:px-8',
      )}
    >
      {pending ? labels.submitting : labels.submit}
      {!pending ? <Icon.arrowRight size={17} className="flip-rtl" /> : null}
    </button>
  )
}

/**
 * The sector picker.
 *
 * Big tap targets with the live notice count on each one — the count is the
 * persuasion: "Génie Civil · 844" tells a contractor there is something here
 * before they commit to anything. Selection state is client-side purely so that
 * counter and the enabled/disabled submit feel instant; the mutation is a server
 * action on plain checkbox inputs, so it still works if the JS never loads.
 */
export function SectorPicker({
  groups,
  regions,
  labels,
}: {
  groups: SectorGroup[]
  regions: Array<{ code: string; label: string }>
  labels: PickerLabels
}) {
  const [state, action] = useActionState<OnboardingState, FormData>(completeOnboarding, {})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [regionsOpen, setRegionsOpen] = useState(false)

  const total = useMemo(
    () =>
      groups
        .flatMap((g) => g.items)
        .filter((i) => selected.has(i.code))
        .reduce((n, i) => n + i.count, 0),
    [groups, selected],
  )

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <form action={action} className="space-y-8">
      {/* ---------------- sectors ---------------- */}
      <section>
        <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{labels.sectors}</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{labels.sectorsHint}</p>
          </div>
          {selected.size > 0 ? (
            <p className="num text-xs font-semibold text-[var(--accent)]">
              {(selected.size > 1 ? labels.selectedPlural : labels.selected).replace(
                '{n}',
                String(selected.size),
              )}
            </p>
          ) : null}
        </header>

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.domain}>
              <p className="label-xs mb-2">{group.domainLabel}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const on = selected.has(item.code)
                  return (
                    <label
                      key={item.code}
                      className={cx(
                        'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5',
                        'transition-colors',
                        on
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        name="sectors"
                        value={item.code}
                        checked={on}
                        onChange={() => toggle(item.code)}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          'grid size-4 shrink-0 place-items-center rounded-md border transition-colors',
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                            : 'border-[var(--border-strong)]',
                        )}
                        aria-hidden="true"
                      >
                        {on ? <Icon.check size={11} /> : null}
                      </span>
                      <span
                        className={cx(
                          'min-w-0 flex-1 truncate text-[0.8125rem] bidi-isolate',
                          on && 'font-semibold text-[var(--accent)]',
                        )}
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      <span className="num shrink-0 text-2xs text-[var(--text-faint)]">
                        {item.count}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- regions (optional, collapsed) ---------------- */}
      <section>
        <button
          type="button"
          onClick={() => setRegionsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-start transition-colors hover:bg-[var(--surface-hover)]"
        >
          <span>
            <span className="block text-sm font-semibold">{labels.regions}</span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              {labels.regionsHint}
            </span>
          </span>
          <Icon.chevronDown
            size={15}
            className={cx(
              'shrink-0 text-[var(--text-faint)] transition-transform',
              regionsOpen && 'rotate-180',
            )}
          />
        </button>

        {regionsOpen ? (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-subtle)] p-3">
            {regions.map((r) => (
              <label key={r.code} className="cursor-pointer">
                <input type="checkbox" name="regions" value={r.code} className="peer sr-only" />
                <span
                  className={cx(
                    'inline-flex items-center rounded-full border border-[var(--border-subtle)] px-3 py-1.5',
                    'text-xs font-medium text-[var(--text-secondary)] transition-colors',
                    'hover:bg-[var(--surface-hover)]',
                    'peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-[var(--accent-fg)]',
                  )}
                >
                  {r.label}
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </section>

      {/* ---------------- cadence ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">{labels.notify}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              // Daily is the default: a contractor who gets one e-mail a morning
              // keeps the subscription; one per notice gets muted.
              { value: 'daily', title: labels.daily, hint: labels.dailyHint, recommended: true },
              { value: 'instant', title: labels.instant, hint: labels.instantHint, recommended: false },
            ] satisfies Array<{ value: string; title: string; hint: string; recommended: boolean }>
          ).map((opt) => (
            <label
              key={opt.value}
              className="cursor-pointer rounded-xl border border-[var(--border-subtle)] p-3.5 transition-colors hover:border-[var(--border-strong)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]"
            >
              {/* A real radio styled with accent-color, not a hidden input plus a
                  fake dot. `peer-checked:` only reaches SIBLINGS of the input, so
                  a nested custom dot silently never lit up — and the native
                  control is keyboard- and screen-reader-correct for free. */}
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cadence"
                  value={opt.value}
                  defaultChecked={opt.recommended}
                  className="size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="text-[0.8125rem] font-semibold">{opt.title}</span>
              </span>
              <span className="mt-1.5 block ps-6 text-xs leading-relaxed text-[var(--text-muted)]">
                {opt.hint}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ---------------- submit ----------------
          Sticky on mobile: the sector list is ~44 tiles tall on a phone, and a
          button parked underneath all of it means scrolling back down to commit.
          It sits inline on desktop where the whole form is already in view. */}
      <div
        className={cx(
          'flex flex-wrap items-center gap-4 border-t border-[var(--border-subtle)] pt-4',
          'sticky bottom-0 -mx-4 bg-[var(--surface-app)]/95 px-4 pb-4 backdrop-blur-sm',
          'sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-6 sm:backdrop-blur-none',
        )}
      >
        <Submit labels={labels} disabled={selected.size === 0} />

        {selected.size > 0 ? (
          <p className="num text-xs text-[var(--text-muted)]">
            ≈ <span className="font-semibold text-[var(--text-primary)]">{total}</span>{' '}
            {labels.matchesNow}
          </p>
        ) : null}

        {state.error ? (
          <p role="alert" className="text-xs font-medium text-[var(--accent)]">
            {labels.needSector}
          </p>
        ) : null}
      </div>
    </form>
  )
}
