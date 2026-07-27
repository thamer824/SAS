import type { Metadata } from 'next'
import { requireUser, orgProfile } from '@/lib/auth/guard'
import { config } from '@/lib/config'
import { ensureDb } from '@/db'
import { formatDate, getLocale, LOCALE_META, LOCALES, translator, type Translator } from '@/lib/i18n'
import { entries, governorates } from '@/lib/tuneps/reference'
import { revokeApiToken, unlinkTelegram } from '@/lib/actions/settings-actions'
import { lastSyncRuns } from '@/lib/tuneps/ingest'
import { Badge, Button, Icon, PageHeader, Panel, PanelHeader, cx } from '@/components/ui/primitives'
import {
  ApiTokenForm,
  CompanyForm,
  PasswordForm,
  ProfileForm,
  TelegramForm,
} from '@/components/settings/forms'
import { LocaleSwitcher } from '@/components/shell/controls'
import { CopyField } from '@/components/ui/copy-field'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('settings.title') }
}

export default async function SettingsPage() {
  const user = await requireUser('/app/settings')
  const locale = await getLocale()
  const t = translator(locale)
  const org = orgProfile(user)

  const orgRow = ensureDb()
    .prepare<[string], { tax_id: string | null; gov_code: string | null }>(
      'SELECT tax_id, gov_code FROM orgs WHERE id = ?',
    )
    .get(org.id)

  const tokens = ensureDb()
    .prepare<[string], { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }>(
      `SELECT id, name, prefix, created_at, last_used_at FROM api_tokens
        WHERE org_id = ? ORDER BY created_at DESC`,
    )
    .all(org.id)

  const runs = lastSyncRuns(5)
  const common = commonLabels(t)

  const pick = (fr: string, ar: string) => (locale === 'ar' ? ar || fr : fr || ar)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} />

      <div className="space-y-4">
        {/* --- profile --- */}
        <Panel>
          <PanelHeader title={t('settings.profile')} />
          <ProfileForm
            initial={{ fullName: user.full_name, email: user.email }}
            labels={{ ...common, fullName: t('settings.fullName'), email: t('settings.email') }}
          />
        </Panel>

        {/* --- language --- */}
        <Panel>
          <PanelHeader title={t('settings.language')} />
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="text-xs text-[var(--text-muted)]">
              {LOCALE_META[locale].nativeLabel} · {LOCALE_META[locale].dir.toUpperCase()}
            </p>
            <LocaleSwitcher
              current={locale}
              options={LOCALES.map((l) => ({ code: l, label: LOCALE_META[l].nativeLabel }))}
            />
          </div>
        </Panel>

        {/* --- company profile: drives the fit score --- */}
        <Panel>
          <PanelHeader title={t('settings.company')} hint={t('settings.company.hint')} />
          <CompanyForm
            initial={{
              name: org.name,
              taxId: orgRow?.tax_id ?? '',
              govCode: orgRow?.gov_code ?? '',
              capabilities: org.capabilities,
              domainCodes: org.domainCodes,
            }}
            govOptions={governorates().map((g) => ({ code: g.code, label: pick(g.fr, g.ar) }))}
            domainOptions={entries('domain').map((d) => ({ code: d.code, label: pick(d.fr, d.ar) }))}
            labels={{
              ...common,
              name: t('settings.company.name'),
              taxId: t('settings.company.taxId'),
              gov: t('settings.company.gov'),
              capabilities: t('settings.company.capabilities'),
              capabilitiesHint: t('settings.company.capabilities.hint'),
              domain: t('tender.domain'),
              optional: t('common.optional'),
            }}
          />
        </Panel>

        {/* --- telegram --- */}
        <Panel>
          <PanelHeader
            title={t('settings.telegram')}
            hint={config.telegram.enabled ? t('settings.telegram.hint') : 'TELEGRAM_BOT_TOKEN non configuré'}
            action={
              user.telegram_chat_id ? (
                <Badge tone="live">{t('settings.telegram.connected')}</Badge>
              ) : null
            }
          />
          {user.telegram_chat_id ? (
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="num font-mono text-xs text-[var(--text-secondary)]">{user.telegram_chat_id}</p>
              <form action={unlinkTelegram}>
                <Button variant="ghost" size="sm">
                  {t('settings.telegram.disconnect')}
                </Button>
              </form>
            </div>
          ) : (
            <TelegramForm
              labels={{ ...common, chatId: 'Chat ID', hint: t('settings.telegram.hint') }}
            />
          )}
        </Panel>

        {/* --- API --- */}
        <Panel>
          <PanelHeader title={t('settings.api')} hint={t('settings.api.hint')} />
          <ApiTokenForm
            labels={{
              ...common,
              name: t('watchlist.name'),
              create: t('settings.api.newToken'),
              once: t('settings.api.tokenOnce'),
              copy: t('common.copy'),
              copied: t('common.copied'),
            }}
          />

          {tokens.length > 0 ? (
            <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {tokens.map((tok) => (
                <li key={tok.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{tok.name}</span>
                    <span className="num mt-0.5 block font-mono text-2xs text-[var(--text-faint)]">
                      {tok.prefix}••••••••
                    </span>
                  </span>
                  <span className="num shrink-0 text-2xs text-[var(--text-faint)]">
                    {tok.last_used_at
                      ? formatDate(tok.last_used_at, locale)
                      : formatDate(tok.created_at, locale)}
                  </span>
                  <form action={revokeApiToken.bind(null, tok.id)}>
                    <Button variant="ghost" size="sm" aria-label={t('common.delete')}>
                      <Icon.trash size={13} />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="border-t border-[var(--border-subtle)] p-4">
            <p className="label-xs mb-2">Endpoint</p>
            <CopyField
              value={`${config.appUrl}/api/v1/tenders?status=open&limit=25`}
              copyLabel={t('common.copy')}
              copiedLabel={t('common.copied')}
            />
            <p className="mt-2 text-2xs leading-relaxed text-[var(--text-muted)]">
              En-tête&nbsp;: <code className="font-mono">Authorization: Bearer &lt;jeton&gt;</code>
            </p>
          </div>
        </Panel>

        {/* --- password --- */}
        <Panel>
          <PanelHeader title={t('settings.password')} />
          <PasswordForm
            labels={{
              ...common,
              current: t('settings.password.current'),
              next: t('settings.password.new'),
              hint: t('auth.password.hint'),
            }}
          />
        </Panel>

        {/* --- data provenance: transparency about where this comes from --- */}
        <Panel>
          <PanelHeader title={t('dash.sync')} hint={t('landing.source.body')} />
          {runs.length === 0 ? (
            <p className="px-4 py-4 text-xs text-[var(--text-muted)]">{t('dash.sync.never')}</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {runs.map((r, i) => (
                <li key={`${r.started_at}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <Badge tone={r.status === 'ok' ? 'live' : r.status === 'running' ? 'info' : 'brand'}>
                    {r.source}
                  </Badge>
                  <span className="num min-w-0 flex-1 text-[var(--text-muted)]">
                    {formatDate(r.started_at, locale)} · {r.mode}
                  </span>
                  <span className="num shrink-0 text-[var(--text-secondary)]">
                    +{r.inserted} / ~{r.updated}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function commonLabels(t: Translator) {
  return {
    save: t('common.save'),
    saving: t('common.saving'),
    saved: t('settings.saved'),
    errors: {
      'common.required': t('common.required'),
      'common.error': t('common.error'),
      'auth.error.invalid': t('auth.error.invalid'),
      'auth.error.weak': t('auth.error.weak'),
    },
  }
}
