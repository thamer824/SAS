import { cookies } from 'next/headers'
import { dictionaries, type Locale, type TranslationKey } from './dictionaries'

export type { Locale, TranslationKey }
export const LOCALES: Locale[] = ['fr', 'ar']
export const DEFAULT_LOCALE: Locale = 'fr'
export const LOCALE_COOKIE = 'mq_locale'

export const LOCALE_META: Record<Locale, { label: string; nativeLabel: string; dir: 'ltr' | 'rtl'; bcp47: string }> = {
  fr: { label: 'Français', nativeLabel: 'Français', dir: 'ltr', bcp47: 'fr-TN' },
  ar: { label: 'Arabe', nativeLabel: 'العربية', dir: 'rtl', bcp47: 'ar-TN' },
}

export function isLocale(v: string | undefined | null): v is Locale {
  return v === 'fr' || v === 'ar'
}

/** Read the locale from the cookie jar (server components / route handlers). */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies()
  const v = jar.get(LOCALE_COOKIE)?.value
  return isLocale(v) ? v : DEFAULT_LOCALE
}

/** A bound translator. `t('key', { n: 3 })` interpolates `{n}`. */
export type Translator = ((key: TranslationKey, vars?: Record<string, string | number>) => string) & {
  locale: Locale
  dir: 'ltr' | 'rtl'
}

export function translator(locale: Locale): Translator {
  const dict = dictionaries[locale]
  const fallback = dictionaries[DEFAULT_LOCALE]

  const fn = ((key: TranslationKey, vars?: Record<string, string | number>) => {
    const raw = (dict as Record<string, string>)[key] ?? (fallback as Record<string, string>)[key] ?? key
    if (!vars) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    )
  }) as Translator

  fn.locale = locale
  fn.dir = LOCALE_META[locale].dir
  return fn
}

export async function getTranslator(): Promise<Translator> {
  return translator(await getLocale())
}

// --- formatting ------------------------------------------------------------

/**
 * Arabic-locale digits: we deliberately keep Western digits (`latn`) even in
 * Arabic. Tunisian procurement paperwork uses them, and references like
 * "20260701864" must be copy-pasteable into TUNEPS.
 */
function numberLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-TN-u-nu-latn' : 'fr-TN'
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(value)
}

export function formatCurrency(value: number, locale: Locale, currency = 'TND'): string {
  return new Intl.NumberFormat(numberLocale(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

const TUNIS_TZ = 'Africa/Tunis'

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(numberLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TUNIS_TZ,
  }).format(d)
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(numberLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TUNIS_TZ,
  }).format(d)
}

export function formatDayMonth(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(numberLocale(locale), {
    day: '2-digit',
    month: 'short',
    timeZone: TUNIS_TZ,
  }).format(d)
}

/** "il y a 3 h" / "قبل 3 ساعات" — relative, compact, never a bare timestamp. */
export function formatRelative(iso: string | null | undefined, locale: Locale, now = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'

  const rtf = new Intl.RelativeTimeFormat(numberLocale(locale), { numeric: 'auto', style: 'short' })
  const diffSec = Math.round((t - now) / 1000)
  const abs = Math.abs(diffSec)

  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), 'month')
  return rtf.format(Math.round(diffSec / 31_536_000), 'year')
}

/** Compact countdown for the deadline column: "3 j", "18 h", "42 min". */
export function formatCountdown(
  iso: string | null | undefined,
  t: Translator,
  now = Date.now(),
): { text: string; urgency: 'past' | 'critical' | 'soon' | 'ok' | 'none' } {
  if (!iso) return { text: '—', urgency: 'none' }
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return { text: '—', urgency: 'none' }
  if (ms <= 0) return { text: t('deadline.passed'), urgency: 'past' }

  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 60) return { text: t('deadline.inMinutes', { n: minutes }), urgency: 'critical' }
  if (hours < 48) return { text: t('deadline.inHours', { n: hours }), urgency: 'critical' }
  if (days <= 3) return { text: t('deadline.inDays', { n: days }), urgency: 'soon' }
  return { text: t('deadline.inDays', { n: days }), urgency: 'ok' }
}

/** Pick the language variant of a field, gracefully falling back. */
export function pickLang(
  locale: Locale,
  fr: string | null | undefined,
  ar: string | null | undefined,
  en?: string | null,
): string {
  if (locale === 'ar') return (ar || fr || en || '').trim()
  return (fr || en || ar || '').trim()
}
