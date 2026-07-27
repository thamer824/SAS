import type { Metadata } from 'next'
import { getTranslator } from '@/lib/i18n'
import { SignUpForm } from '@/components/auth/forms'
import { authErrorLabels } from '../error-labels'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator()
  return { title: t('auth.signup.title') }
}

export default async function SignUpPage() {
  const t = await getTranslator()

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-0.015em]">{t('auth.signup.title')}</h1>
      <p className="mb-7 mt-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
        {t('auth.signup.subtitle')}
      </p>

      <SignUpForm
        labels={{
          email: t('auth.email'),
          password: t('auth.password'),
          passwordHint: t('auth.password.hint'),
          fullName: t('auth.fullName'),
          companyName: t('auth.companyName'),
          optional: t('common.optional'),
          submit: t('auth.submit.signup'),
          submitting: t('common.loading'),
          altPrompt: t('auth.toSignin'),
          altHref: '/signin',
          altLabel: t('nav.signin'),
          errors: authErrorLabels(t),
        }}
      />
    </>
  )
}
