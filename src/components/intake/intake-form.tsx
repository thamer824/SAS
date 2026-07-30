'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitIntake, type IntakeState } from '@/lib/actions/intake-actions'
import { Icon, cx, inputClass } from '@/components/ui/primitives'
import type { NotifyChannel, RegionScope } from '@/lib/queries/intake'

/**
 * The four-question intake form.
 *
 * Built for someone who is not comfortable with software: numbered questions,
 * one decision per block, large tap targets, no jargon, no collapsed sections
 * hiding required fields, and a running count of how many offers their answers
 * would return so the form pays off before it is submitted.
 *
 * All state is here purely for that live count and for revealing the region
 * and phone inputs. The mutation is a server action over plain named inputs, so
 * the form still submits correctly if the JavaScript never arrives.
 */

export interface SectorOption {
  code: string
  label: string
  count: number
}

export interface SectorGroup {
  key: string
  label: string
  items: SectorOption[]
}

export interface IntakeLabels {
  title: string
  subtitle: string
  stepOf: string
  q1: string
  q1Placeholder: string
  q2: string
  q2Hint: string
  q2Chosen: string
  q2ChosenPlural: string
  q3: string
  q3All: string
  q3AllHint: string
  q3Some: string
  q3SomeHint: string
  q4: string
  q4Email: string
  q4WhatsApp: string
  q4Both: string
  q4Phone: string
  q4PhoneHint: string
  submit: string
  submitting: string
  preview: string
  previewNone: string
  showAll: string
  showLess: string
  errors: Record<string, string>
}

/**
 * Sectors shown per nature before "voir tous les domaines".
 *
 * The full table is 44 tiles, which turns question 2 into a page of scrolling
 * and buries questions 3 and 4 below the fold. Six per nature covers the large
 * majority of real publication volume; the rest are one tap away.
 */
const VISIBLE_PER_GROUP = 6

export interface IntakeDefaults {
  companyName: string
  categoryCodes: string[]
  regionScope: RegionScope
  govCodes: string[]
  notifyChannel: NotifyChannel
  whatsappNumber: string
}

/** Numbered question block — the visual unit of the whole form. */
function Question({
  n,
  title,
  hint,
  children,
  labels,
}: {
  n: number
  title: string
  hint?: string
  children: React.ReactNode
  labels: IntakeLabels
}) {
  return (
    <section className="border-t border-[var(--border-subtle)] pt-7 first:border-0 first:pt-0">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
        {labels.stepOf.replace('{n}', String(n))}
      </p>
      <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] sm:text-xl">{title}</h2>
      {hint ? <p className="mt-1.5 text-[0.9375rem] text-[var(--text-muted)]">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Large radio row. Used for both "where" and "how to notify". */
function BigRadio({
  name,
  value,
  checked,
  onChange,
  title,
  hint,
  icon,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  title: string
  hint?: string
  icon?: React.ReactNode
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3.5 rounded-2xl border-2 p-4 transition-colors',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[1.0625rem] font-semibold">
          {icon}
          {title}
        </span>
        {hint ? (
          <span className="mt-1 block text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function Submit({ labels, disabled }: { labels: IntakeLabels; disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(
        'inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl',
        'bg-[var(--accent)] text-base font-bold text-[var(--accent-fg)]',
        'shadow-[0_2px_8px_-2px_rgb(206_35_66/0.4)] transition-colors',
        'hover:bg-[var(--accent-hover)]',
        'disabled:pointer-events-none disabled:opacity-40 sm:w-auto sm:px-10',
      )}
    >
      {pending ? labels.submitting : labels.submit}
      {!pending ? <Icon.arrowRight size={19} className="flip-rtl" /> : null}
    </button>
  )
}

export function IntakeForm({
  groups,
  regions,
  defaults,
  labels,
}: {
  groups: SectorGroup[]
  regions: Array<{ code: string; label: string }>
  defaults: IntakeDefaults
  labels: IntakeLabels
}) {
  const [state, action] = useActionState<IntakeState, FormData>(submitIntake, {})

  // EVERY field is controlled, including the two text inputs.
  //
  // React 19 resets uncontrolled fields once a form action completes — including
  // when the action returns a validation error. With `defaultValue` the company
  // name and phone number silently emptied after a single mistake, so the next
  // submit failed on "champ obligatoire" for a field the user had filled in and
  // could still see. Controlled state survives the round-trip.
  const [company, setCompany] = useState(defaults.companyName)
  const [phone, setPhone] = useState(defaults.whatsappNumber.replace(/^216/, ''))
  const [sectors, setSectors] = useState<Set<string>>(new Set(defaults.categoryCodes))
  const [scope, setScope] = useState<RegionScope>(defaults.regionScope)
  const [govs, setGovs] = useState<Set<string>>(new Set(defaults.govCodes))
  const [channel, setChannel] = useState<NotifyChannel>(defaults.notifyChannel)
  // Start expanded when editing, so an already-chosen niche sector is visible
  // rather than hidden behind a button the user has no reason to press.
  const [allSectors, setAllSectors] = useState(
    defaults.categoryCodes.length > 0 &&
      groups.some((g) =>
        g.items.slice(VISIBLE_PER_GROUP).some((i) => defaults.categoryCodes.includes(i.code)),
      ),
  )

  const hiddenCount = useMemo(
    () => groups.reduce((n, g) => n + Math.max(0, g.items.length - VISIBLE_PER_GROUP), 0),
    [groups],
  )

  const wantsWhatsApp = channel === 'whatsapp' || channel === 'both'

  // Approximate, and honest about it: summing per-sector counts double-counts a
  // notice that belongs to two chosen sectors, which is why the label says "≈".
  const approxCount = useMemo(() => {
    const chosen = groups.flatMap((g) => g.items).filter((i) => sectors.has(i.code))
    return chosen.reduce((n, i) => n + i.count, 0)
  }, [groups, sectors])

  const toggle = (set: Set<string>, code: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    apply(next)
  }

  return (
    // `pb-32` on small screens is clearance for the sticky submit bar below —
    // without it the bar sits on top of the last question instead of under it.
    <form action={action} className="space-y-8 pb-32 sm:pb-0">
      {/* ============ 1. company ============ */}
      <Question n={1} title={labels.q1} labels={labels}>
        <input
          name="companyName"
          required
          maxLength={160}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={labels.q1Placeholder}
          autoComplete="organization"
          className={cx(inputClass, 'h-14 rounded-2xl text-[1.0625rem]')}
        />
      </Question>

      {/* ============ 2. sectors ============ */}
      <Question n={2} title={labels.q2} hint={labels.q2Hint} labels={labels}>
        {sectors.size > 0 ? (
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--accent)]">
            <Icon.check size={14} />
            {(sectors.size > 1 ? labels.q2ChosenPlural : labels.q2Chosen).replace(
              '{n}',
              String(sectors.size),
            )}
          </p>
        ) : null}

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-sm font-bold text-[var(--text-secondary)]">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(allSectors ? group.items : group.items.slice(0, VISIBLE_PER_GROUP)).map((item) => {
                  const on = sectors.has(item.code)
                  return (
                    <label
                      key={item.code}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3 transition-colors',
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
                        onChange={() => toggle(sectors, item.code, setSectors)}
                        className="size-5 shrink-0 accent-[var(--accent)]"
                      />
                      <span
                        className={cx(
                          'min-w-0 flex-1 text-[0.9375rem] leading-snug bidi-isolate',
                          on && 'font-semibold',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="num shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                        {item.count}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setAllSectors((v) => !v)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[var(--border-subtle)] px-4 text-[0.9375rem] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
          >
            <Icon.chevronDown
              size={16}
              className={cx('transition-transform', allSectors && 'rotate-180')}
            />
            {allSectors ? labels.showLess : labels.showAll.replace('{n}', String(hiddenCount))}
          </button>
        ) : null}
      </Question>

      {/* ============ 3. where ============ */}
      <Question n={3} title={labels.q3} labels={labels}>
        <div className="space-y-2.5">
          <BigRadio
            name="regionScope"
            value="all"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
            title={labels.q3All}
            hint={labels.q3AllHint}
          />
          <BigRadio
            name="regionScope"
            value="regions"
            checked={scope === 'regions'}
            onChange={() => setScope('regions')}
            title={labels.q3Some}
            hint={labels.q3SomeHint}
          />
        </div>

        {scope === 'regions' ? (
          <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border-2 border-[var(--border-subtle)] p-3.5 animate-fade-up">
            {regions.map((r) => {
              const on = govs.has(r.code)
              return (
                <label key={r.code} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="regions"
                    value={r.code}
                    checked={on}
                    onChange={() => toggle(govs, r.code, setGovs)}
                    className="sr-only"
                  />
                  <span
                    className={cx(
                      'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-medium transition-colors',
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    {on ? <Icon.check size={14} /> : null}
                    {r.label}
                  </span>
                </label>
              )
            })}
          </div>
        ) : null}
      </Question>

      {/* ============ 4. notifications ============ */}
      <Question n={4} title={labels.q4} labels={labels}>
        <div className="space-y-2.5">
          <BigRadio
            name="notifyChannel"
            value="email"
            checked={channel === 'email'}
            onChange={() => setChannel('email')}
            title={labels.q4Email}
            icon={<Icon.inbox size={18} className="text-[var(--text-muted)]" />}
          />
          <BigRadio
            name="notifyChannel"
            value="whatsapp"
            checked={channel === 'whatsapp'}
            onChange={() => setChannel('whatsapp')}
            title={labels.q4WhatsApp}
            icon={<WhatsAppMark />}
          />
          <BigRadio
            name="notifyChannel"
            value="both"
            checked={channel === 'both'}
            onChange={() => setChannel('both')}
            title={labels.q4Both}
          />
        </div>

        {wantsWhatsApp ? (
          <div className="mt-3 animate-fade-up">
            <label
              htmlFor="whatsapp"
              className="mb-1.5 block text-[0.9375rem] font-semibold text-[var(--text-secondary)]"
            >
              {labels.q4Phone}
            </label>
            <div className="flex items-stretch gap-2">
              <span className="num inline-flex shrink-0 items-center rounded-xl border-2 border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3.5 text-[1.0625rem] font-semibold text-[var(--text-muted)]">
                +216
              </span>
              <input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                dir="ltr"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="24 123 456"
                className={cx(inputClass, 'num h-14 rounded-xl text-[1.0625rem]')}
              />
            </div>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">{labels.q4PhoneHint}</p>
          </div>
        ) : null}
      </Question>

      {/* ============ submit ============ */}
      <div
        className={cx(
          'border-t border-[var(--border-subtle)] pt-5',
          // Sticky on phones so the button is always one tap away.
          'sticky bottom-0 -mx-4 bg-[var(--surface-app)]/95 px-4 pb-4 backdrop-blur',
          'sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none',
        )}
      >
        {state.error ? (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-xl bg-[var(--accent-soft)] px-3.5 py-3 text-[0.9375rem] font-medium text-[var(--accent)]"
          >
            <Icon.alert size={17} className="mt-0.5 shrink-0" />
            {labels.errors[state.error] ?? labels.errors['common.error']}
          </p>
        ) : null}

        <p className="mb-3 text-[0.9375rem] text-[var(--text-secondary)]">
          {sectors.size === 0
            ? labels.previewNone
            : labels.preview.replace('{n}', String(approxCount))}
        </p>

        <Submit labels={labels} disabled={sectors.size === 0} />
      </div>
    </form>
  )
}

/** WhatsApp glyph. Inline so there is no external asset and it inherits colour. */
function WhatsAppMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-[#25D366]">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.35-.5.05-.98.07-2.6-.55-1.95-.76-3.2-2.76-3.3-2.89-.1-.13-.79-1.05-.79-2 0-.95.5-1.42.68-1.62.18-.2.39-.25.52-.25.13 0 .26 0 .38.01.12.01.28-.05.44.33.16.4.56 1.37.6 1.47.05.1.08.22.01.35-.06.13-.1.21-.2.33-.1.12-.2.26-.3.35-.1.1-.2.2-.09.4.11.2.5.86 1.08 1.39.74.68 1.36.9 1.56 1 .2.1.31.08.43-.05.12-.13.5-.58.63-.78.13-.2.26-.16.44-.1.18.07 1.15.55 1.35.65.2.1.33.15.38.23.05.09.05.5-.19 1.18Z" />
    </svg>
  )
}
