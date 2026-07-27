import type { Translator } from '@/lib/i18n'

/**
 * Server actions return translation KEYS, never rendered strings — the action
 * has no locale context and the client component cannot call `t()`. This maps
 * them once, in the page that owns the locale.
 */
export function authErrorLabels(t: Translator): Record<string, string> {
  return {
    'auth.error.invalid': t('auth.error.invalid'),
    'auth.error.exists': t('auth.error.exists'),
    'auth.error.weak': t('auth.error.weak'),
    'auth.error.email': t('auth.error.email'),
    'common.required': t('common.required'),
    'common.error': t('common.error'),
  }
}
