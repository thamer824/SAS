'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { signIn, signUp, type FormState } from '@/lib/auth/actions'
import { Field, Icon, inputClass, buttonClass } from '@/components/ui/primitives'

interface Labels {
  email: string
  password: string
  passwordHint: string
  fullName: string
  companyName: string
  optional: string
  submit: string
  submitting: string
  altPrompt: string
  altHref: string
  altLabel: string
  errors: Record<string, string>
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'lg', 'w-full')}>
      {pending ? busy : label}
      {!pending ? <Icon.arrowRight size={15} className="flip-rtl" /> : null}
    </button>
  )
}

function ErrorNote({ state, errors }: { state: FormState; errors: Record<string, string> }) {
  if (!state.error) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-xs text-[var(--accent)]"
    >
      <Icon.alert size={14} className="mt-px shrink-0" />
      {errors[state.error] ?? errors['common.error'] ?? state.error}
    </p>
  )
}

export function SignInForm({ labels }: { labels: Labels }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {})

  return (
    <form action={action} className="space-y-4">
      <ErrorNote state={state} errors={labels.errors} />

      <Field label={labels.email} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          className={inputClass}
          placeholder="vous@entreprise.tn"
        />
      </Field>

      <Field label={labels.password} htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className={inputClass}
        />
      </Field>

      <Submit label={labels.submit} busy={labels.submitting} />

      <p className="pt-1 text-center text-xs text-[var(--text-muted)]">
        {labels.altPrompt}{' '}
        <Link href={labels.altHref} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          {labels.altLabel}
        </Link>
      </p>
    </form>
  )
}

export function SignUpForm({ labels }: { labels: Labels }) {
  const [state, action] = useActionState<FormState, FormData>(signUp, {})

  return (
    <form action={action} className="space-y-4">
      <ErrorNote state={state} errors={labels.errors} />

      <Field label={labels.fullName} htmlFor="fullName">
        <input id="fullName" name="fullName" type="text" autoComplete="name" required className={inputClass} />
      </Field>

      <Field label={`${labels.companyName} (${labels.optional})`} htmlFor="companyName">
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="organization"
          className={inputClass}
        />
      </Field>

      <Field label={labels.email} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          className={inputClass}
          placeholder="vous@entreprise.tn"
        />
      </Field>

      <Field label={labels.password} htmlFor="password" hint={labels.passwordHint}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          dir="ltr"
          className={inputClass}
        />
      </Field>

      <Submit label={labels.submit} busy={labels.submitting} />

      <p className="pt-1 text-center text-xs text-[var(--text-muted)]">
        {labels.altPrompt}{' '}
        <Link href={labels.altHref} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          {labels.altLabel}
        </Link>
      </p>
    </form>
  )
}
