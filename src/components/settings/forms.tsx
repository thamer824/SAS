'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  changePassword,
  createApiToken,
  linkTelegram,
  saveCompany,
  saveProfile,
  type SettingsState,
} from '@/lib/actions/settings-actions'
import {
  Button,
  Field,
  Icon,
  cx,
  inputClass,
  selectClass,
} from '@/components/ui/primitives'
import { CopyField } from '@/components/ui/copy-field'

interface Common {
  save: string
  saving: string
  saved: string
  errors: Record<string, string>
}

function Status({ state, labels }: { state: SettingsState; labels: Common }) {
  const { pending } = useFormStatus()
  if (pending) return null
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-[var(--accent)]">
        {labels.errors[state.error] ?? labels.errors['common.error']}
      </p>
    )
  }
  if (state.ok) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-live-600 dark:text-live-500">
        <Icon.check size={13} />
        {labels.saved}
      </p>
    )
  }
  return null
}

function SubmitButton({ labels, variant = 'primary' }: { labels: Common; variant?: 'primary' | 'secondary' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant={variant} disabled={pending}>
      {pending ? labels.saving : labels.save}
    </Button>
  )
}

// --- profile ---------------------------------------------------------------

export function ProfileForm({
  initial,
  labels,
}: {
  initial: { fullName: string; email: string }
  labels: Common & { fullName: string; email: string }
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveProfile, {})

  return (
    <form action={action} className="space-y-4 p-4">
      <Field label={labels.fullName} htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          defaultValue={initial.fullName}
          required
          maxLength={120}
          className={inputClass}
        />
      </Field>

      <Field label={labels.email} htmlFor="email">
        <input
          id="email"
          value={initial.email}
          readOnly
          dir="ltr"
          className={cx(inputClass, 'cursor-not-allowed opacity-60')}
        />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton labels={labels} />
        <Status state={state} labels={labels} />
      </div>
    </form>
  )
}

// --- company profile -------------------------------------------------------

export function CompanyForm({
  initial,
  govOptions,
  domainOptions,
  labels,
}: {
  initial: {
    name: string
    taxId: string
    govCode: string
    capabilities: string[]
    domainCodes: string[]
  }
  govOptions: Array<{ code: string; label: string }>
  domainOptions: Array<{ code: string; label: string }>
  labels: Common & {
    name: string
    taxId: string
    gov: string
    capabilities: string
    capabilitiesHint: string
    domain: string
    optional: string
  }
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveCompany, {})
  const selectedDomains = new Set(initial.domainCodes)

  return (
    <form action={action} className="space-y-4 p-4">
      <Field label={labels.name} htmlFor="companyName">
        <input
          id="companyName"
          name="name"
          defaultValue={initial.name}
          required
          maxLength={160}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${labels.taxId} (${labels.optional})`} htmlFor="taxId">
          <input
            id="taxId"
            name="taxId"
            defaultValue={initial.taxId}
            dir="ltr"
            maxLength={40}
            className={inputClass}
          />
        </Field>

        <Field label={labels.gov} htmlFor="govCode">
          <select id="govCode" name="govCode" defaultValue={initial.govCode} className={selectClass}>
            <option value="">—</option>
            {govOptions.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={labels.capabilities} htmlFor="capabilities" hint={labels.capabilitiesHint}>
        <textarea
          id="capabilities"
          name="capabilities"
          rows={3}
          defaultValue={initial.capabilities.join(', ')}
          className={cx(inputClass, 'resize-y')}
          placeholder="génie civil, étanchéité, VRD, كهرباء"
        />
      </Field>

      <Field label={labels.domain}>
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-[var(--border-subtle)] p-3">
          {domainOptions.map((d) => (
            <label key={d.code} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="domainCodes"
                value={d.code}
                defaultChecked={selectedDomains.has(d.code)}
                className="size-3.5 accent-[var(--accent)]"
              />
              {d.label}
            </label>
          ))}
        </div>
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton labels={labels} />
        <Status state={state} labels={labels} />
      </div>
    </form>
  )
}

// --- password --------------------------------------------------------------

export function PasswordForm({
  labels,
}: {
  labels: Common & { current: string; next: string; hint: string }
}) {
  const [state, action] = useActionState<SettingsState, FormData>(changePassword, {})

  return (
    <form action={action} className="space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.current} htmlFor="current">
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            className={inputClass}
          />
        </Field>
        <Field label={labels.next} htmlFor="next" hint={labels.hint}>
          <input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            dir="ltr"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton labels={labels} variant="secondary" />
        <Status state={state} labels={labels} />
      </div>
    </form>
  )
}

// --- telegram --------------------------------------------------------------

export function TelegramForm({
  labels,
}: {
  labels: Common & { chatId: string; hint: string }
}) {
  const [state, action] = useActionState<SettingsState, FormData>(linkTelegram, {})

  return (
    <form action={action} className="space-y-3 p-4">
      <Field label={labels.chatId} htmlFor="chatId" hint={labels.hint}>
        <input
          id="chatId"
          name="chatId"
          inputMode="numeric"
          dir="ltr"
          placeholder="123456789"
          className={inputClass}
        />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton labels={labels} variant="secondary" />
        <Status state={state} labels={labels} />
      </div>
    </form>
  )
}

// --- api tokens ------------------------------------------------------------

export function ApiTokenForm({
  labels,
}: {
  labels: Common & { name: string; create: string; once: string; copy: string; copied: string }
}) {
  const [state, action] = useActionState<SettingsState, FormData>(createApiToken, {})

  return (
    <div className="space-y-3 p-4">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label={labels.name} htmlFor="tokenName" className="min-w-48 flex-1">
          <input id="tokenName" name="name" maxLength={80} placeholder="ERP" className={inputClass} />
        </Field>
        <Button type="submit" variant="secondary" size="md">
          <Icon.plus size={14} />
          {labels.create}
        </Button>
      </form>

      {state.token ? (
        <div className="rounded-lg border border-live-500/35 bg-[var(--color-live-100)] p-3">
          <p className="mb-2 text-2xs font-medium">{labels.once}</p>
          <CopyField value={state.token} copyLabel={labels.copy} copiedLabel={labels.copied} />
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-xs text-[var(--accent)]">
          {labels.errors[state.error] ?? labels.errors['common.error']}
        </p>
      ) : null}
    </div>
  )
}
