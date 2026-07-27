import { config } from '@/lib/config'
import type { Locale, Translator } from '@/lib/i18n'
import { categoriesByDomain, entries, governorates } from '@/lib/tuneps/reference'
import type { RefOption, WatchlistFormLabels } from './form'

/**
 * Server components own the locale; the form is a client component. Everything
 * it renders is resolved here and passed as plain props — no dictionary or
 * reference table crosses the boundary.
 */
export function watchlistFormLabels(t: Translator, telegramLinked: boolean): WatchlistFormLabels {
  return {
    name: t('watchlist.name'),
    namePlaceholder: t('watchlist.name.placeholder'),
    keywords: t('watchlist.keywords'),
    keywordsHint: t('watchlist.keywords.hint'),
    excludeKeywords: t('watchlist.excludeKeywords'),
    excludeKeywordsHint: t('watchlist.excludeKeywords.hint'),
    cadence: t('watchlist.cadence'),
    cadenceOptions: [
      { value: 'instant', label: t('watchlist.cadence.instant'), hint: t('watchlist.cadence.instant.hint') },
      { value: 'daily', label: t('watchlist.cadence.daily'), hint: t('watchlist.cadence.daily.hint') },
      { value: 'weekly', label: t('watchlist.cadence.weekly'), hint: t('watchlist.cadence.weekly.hint') },
      { value: 'off', label: t('watchlist.cadence.off'), hint: t('watchlist.cadence.off.hint') },
    ],
    channels: t('watchlist.channels'),
    channelOptions: [
      { value: 'inapp', label: t('watchlist.channel.inapp') },
      { value: 'email', label: t('watchlist.channel.email') },
      {
        value: 'webpush',
        label: t('watchlist.channel.webpush'),
        disabled: !config.push.enabled,
        disabledHint: config.push.enabled ? undefined : 'VAPID non configuré',
      },
      {
        value: 'telegram',
        label: t('watchlist.channel.telegram'),
        disabled: !config.telegram.enabled || !telegramLinked,
        disabledHint: !config.telegram.enabled
          ? 'Bot non configuré'
          : !telegramLinked
            ? t('settings.telegram.hint')
            : undefined,
      },
    ],
    minScore: t('watchlist.minScore'),
    minScoreHint: t('watchlist.minScore.hint'),
    sources: t('tender.source'),
    sourceOptions: [
      { value: 'ao', label: t('source.ao') },
      { value: 'consultation', label: t('source.consultation') },
    ],
    domain: t('tender.domain'),
    category: t('tender.category'),
    governorate: t('tender.governorate'),
    minLead: t('feed.minLeadTime'),
    openOnly: t('feed.openOnly'),
    save: t('common.save'),
    saving: t('common.saving'),
    saved: t('settings.saved'),
    cancel: t('common.cancel'),
    criteriaTitle: t('feed.filters'),
    deliveryTitle: t('watchlist.channels'),
    optional: t('common.optional'),
    advanced: t('common.more'),
    errors: {
      'common.required': t('common.required'),
      'common.error': t('common.error'),
    },
  }
}

export function referenceOptions(locale: Locale): {
  domains: RefOption[]
  categories: RefOption[]
  govs: RefOption[]
} {
  const pick = (fr: string, ar: string) => (locale === 'ar' ? ar || fr : fr || ar)

  return {
    domains: entries('domain').map((e) => ({ code: e.code, label: pick(e.fr, e.ar) })),
    govs: governorates().map((e) => ({ code: e.code, label: pick(e.fr, e.ar) })),
    categories: categoriesByDomain(locale).flatMap((g) =>
      g.items.map((c) => ({
        code: c.code,
        label: `${pick(c.fr, c.ar)}`,
        group: g.domainLabel,
      })),
    ),
  }
}
