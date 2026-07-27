import type { Metadata } from 'next'
import { getTranslator } from '@/lib/i18n'
import { SignInForm } from '@/components/auth/forms'
import { authErrorLabels } from '../error-labels'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator()
  return { title: t('auth.signin.title') }
}

export default async function SignInPage() {
  const t = await getTranslator()

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-0.015em]">{t('auth.signin.title')}</h1>
      <p className="mb-7 mt-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
        {t('auth.signin.subtitle')}
      </p>

      <SignInForm
        labels={{
          email: t('auth.email'),
          password: t('auth.password'),
          passwordHint: t('auth.password.hint'),
          fullName: t('auth.fullName'),
          companyName: t('auth.companyName'),
          optional: t('common.optional'),
          submit: t('auth.submit.signin'),
          submitting: t('common.loading'),
          altPrompt: t('auth.toSignup'),
          altHref: '/signup',
          altLabel: t('nav.signup'),
          errors: authErrorLabels(t),
        }}
      />
    </>
  )
}
