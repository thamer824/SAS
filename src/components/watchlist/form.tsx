'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createWatchlist, updateWatchlist, type WatchlistFormState } from '@/lib/actions/watchlist-actions'
import { Button, Field, Icon, Panel, PanelHeader, buttonClass, cx, inputClass, selectClass } from '@/components/ui/primitives'
import type { WatchCriteria } from '@/lib/match/engine'

export interface RefOption {
  code: string
  label: string
  group?: string
}

export interface WatchlistFormLabels {
  name: string
  namePlaceholder: string
  keywords: string
  keywordsHint: string
  excludeKeywords: string
  excludeKeywordsHint: string
  cadence: string
  cadenceOptions: Array<{ value: string; label: string; hint: string }>
  channels: string
  channelOptions: Array<{ value: string; label: string; disabled?: boolean; disabledHint?: string }>
  minScore: string
  minScoreHint: string
  sources: string
  sourceOptions: Array<{ value: string; label: string }>
  domain: string
  category: string
  governorate: string
  minLead: string
  openOnly: string
  save: string
  saving: string
  saved: string
  cancel: string
  criteriaTitle: string
  deliveryTitle: string
  errors: Record<string, string>
  optional: string
  advanced: string
}

function SubmitRow({ labels, ok }: { labels: WatchlistFormLabels; ok?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="md" disabled={pending}>
        {pending ? labels.saving : labels.save}
      </Button>
      {ok && !pending ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-live-600 dark:text-live-500">
          <Icon.check size={14} />
          {labels.saved}
        </span>
      ) : null}
    </div>
  )
}

/** Multi-select rendered as a checkbox grid — a native <select multiple> is
 *  unusable on touch and invisible to keyboard users scanning options. */
function CheckGrid({
  name,
  options,
  selected,
  columns = 2,
}: {
  name: string
  options: RefOption[]
  selected: Set<string>
  columns?: number
}) {
  return (
    <div
      className={cx(
        'grid max-h-64 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-2.5',
        columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
      )}
    >
      {options.map((o) => (
        <label
          key={o.code}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--surface-hover)]"
        >
          <input
            type="checkbox"
            name={name}
            value={o.code}
            defaultChecked={selected.has(o.code)}
            className="size-3.5 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0 truncate bidi-isolate" title={o.label}>
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}

function Fields({
  labels,
  initial,
  refs,
  telegramLinked,
}: {
  labels: WatchlistFormLabels
  initial: { name: string; criteria: WatchCriteria; cadence: string; channels: string[] }
  refs: { domains: RefOption[]; categories: RefOption[]; govs: RefOption[] }
  telegramLinked: boolean
}) {
  const c = initial.criteria
  const [cadence, setCadence] = useState(initial.cadence)
  const channels = new Set(initial.channels)

  const activeCadence = labels.cadenceOptions.find((o) => o.value === cadence)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* ---------- criteria ---------- */}
      <div className="space-y-4">
        <Panel>
          <PanelHeader title={labels.criteriaTitle} />
          <div className="space-y-4 p-4">
            <Field label={labels.name} htmlFor="name">
              <input
                id="name"
                name="name"
                required
                maxLength={120}
                defaultValue={initial.name}
                placeholder={labels.namePlaceholder}
                className={inputClass}
              />
            </Field>

            <Field label={labels.keywords} htmlFor="keywords" hint={labels.keywordsHint}>
              <textarea
                id="keywords"
                name="keywords"
                rows={2}
                defaultValue={(c.keywords ?? []).join(', ')}
                className={cx(inputClass, 'resize-y')}
                placeholder="génie civil, étanchéité, كهرباء"
              />
            </Field>

            <Field
              label={`${labels.excludeKeywords} (${labels.optional})`}
              htmlFor="excludeKeywords"
              hint={labels.excludeKeywordsHint}
            >
              <textarea
                id="excludeKeywords"
                name="excludeKeywords"
                rows={2}
                defaultValue={(c.excludeKeywords ?? []).join(', ')}
                className={cx(inputClass, 'resize-y')}
              />
            </Field>

            <Field label={labels.sources}>
              <div className="flex flex-wrap gap-3">
                {labels.sourceOptions.map((s) => (
                  <label key={s.value} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="sources"
                      value={s.value}
                      defaultChecked={c.sources?.includes(s.value as 'ao') ?? false}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </Field>

            <Field label={labels.domain}>
              <CheckGrid name="domainCodes" options={refs.domains} selected={new Set(c.domainCodes ?? [])} />
            </Field>

            <Field label={labels.governorate}>
              <CheckGrid name="govCodes" options={refs.govs} selected={new Set(c.govCodes ?? [])} columns={3} />
            </Field>

            <details className="rounded-lg border border-[var(--border-subtle)]">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                {labels.advanced}
              </summary>
              <div className="space-y-4 border-t border-[var(--border-subtle)] p-3">
                <Field label={labels.category}>
                  <CheckGrid
                    name="categoryCodes"
                    options={refs.categories}
                    selected={new Set(c.categoryCodes ?? [])}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={labels.minLead} htmlFor="minLeadDays">
                    <input
                      id="minLeadDays"
                      name="minLeadDays"
                      type="number"
                      min={0}
                      max={180}
                      defaultValue={c.minLeadDays ?? ''}
                      className={inputClass}
                    />
                  </Field>

                  <Field label={labels.minScore} htmlFor="minScore" hint={labels.minScoreHint}>
                    <input
                      id="minScore"
                      name="minScore"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={c.minScore ?? 40}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="openOnly"
                    defaultChecked={c.openOnly !== false}
                    className="size-3.5 accent-[var(--accent)]"
                  />
                  {labels.openOnly}
                </label>
              </div>
            </details>
          </div>
        </Panel>
      </div>

      {/* ---------- delivery ---------- */}
      <div className="space-y-4 lg:sticky lg:top-[4.75rem] lg:self-start">
        <Panel>
          <PanelHeader title={labels.deliveryTitle} />
          <div className="space-y-4 p-4">
            <Field label={labels.cadence} htmlFor="cadence" hint={activeCadence?.hint}>
              <select
                id="cadence"
                name="cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className={selectClass}
              >
                {labels.cadenceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={labels.channels}>
              <div className="space-y-1.5">
                {labels.channelOptions.map((o) => (
                  <label
                    key={o.value}
                    className={cx(
                      'flex items-start gap-2 text-xs',
                      o.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      name="channels"
                      value={o.value}
                      defaultChecked={channels.has(o.value) || o.value === 'inapp'}
                      disabled={o.disabled || o.value === 'inapp' || cadence === 'off'}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0">
                      {o.label}
                      {o.disabled && o.disabledHint ? (
                        <span className="mt-0.5 block text-2xs text-[var(--text-faint)]">
                          {o.disabledHint}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            {!telegramLinked ? (
              <p className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-2xs leading-relaxed text-[var(--text-muted)]">
                <a href="/app/settings" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Telegram
                </a>{' '}
                — liez votre compte dans les paramètres pour l’activer.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}

export function NewWatchlistForm(props: {
  labels: WatchlistFormLabels
  initial: { name: string; criteria: WatchCriteria }
  refs: { domains: RefOption[]; categories: RefOption[]; govs: RefOption[] }
  telegramLinked: boolean
}) {
  const [state, action] = useActionState<WatchlistFormState, FormData>(createWatchlist, {})

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent)]">
          {props.labels.errors[state.error] ?? props.labels.errors['common.error']}
        </p>
      ) : null}

      <Fields
        labels={props.labels}
        initial={{ ...props.initial, cadence: 'instant', channels: ['inapp', 'email'] }}
        refs={props.refs}
        telegramLinked={props.telegramLinked}
      />

      <SubmitRow labels={props.labels} />
    </form>
  )
}

export function EditWatchlistForm(props: {
  id: string
  labels: WatchlistFormLabels
  initial: { name: string; criteria: WatchCriteria; cadence: string; channels: string[] }
  refs: { domains: RefOption[]; categories: RefOption[]; govs: RefOption[] }
  telegramLinked: boolean
}) {
  const bound = updateWatchlist.bind(null, props.id)
  const [state, action] = useActionState<WatchlistFormState, FormData>(bound, {})

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent)]">
          {props.labels.errors[state.error] ?? props.labels.errors['common.error']}
        </p>
      ) : null}

      <Fields
        labels={props.labels}
        initial={props.initial}
        refs={props.refs}
        telegramLinked={props.telegramLinked}
      />

      <SubmitRow labels={props.labels} ok={state.ok} />
    </form>
  )
}
