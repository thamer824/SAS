import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { formatNumber, formatRelative, getLocale, translator } from '@/lib/i18n'
import { orgWatchlists, parseCriteria, parseJsonArray } from '@/lib/match/engine'
import { label } from '@/lib/tuneps/reference'
import { ensureDb } from '@/db'
import {
  Badge,
  EmptyState,
  Icon,
  LinkButton,
  PageHeader,
  Panel,
  Chip,
} from '@/components/ui/primitives'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('watchlist.title') }
}

export default async function WatchlistsPage() {
  const user = await requireUser('/app/watchlists')
  const locale = await getLocale()
  const t = translator(locale)

  const watchlists = orgWatchlists(user.org_id)

  // Pending (recorded, not yet delivered) counts per watchlist, for the digest
  // cadences where "waiting to be sent" is meaningful state.
  const pending = new Map(
    ensureDb()
      .prepare<[string], { watchlist_id: string; n: number }>(
        `SELECT m.watchlist_id, COUNT(*) AS n
           FROM watchlist_matches m JOIN watchlists w ON w.id = m.watchlist_id
          WHERE w.org_id = ? AND m.notified_at IS NULL
          GROUP BY m.watchlist_id`,
      )
      .all(user.org_id)
      .map((r) => [r.watchlist_id, r.n]),
  )

  return (
    <>
      <PageHeader
        title={t('watchlist.title')}
        subtitle={t('watchlist.subtitle')}
        actions={
          <>
            {/* Sector picker first, advanced form second: most people want the
                former and would bounce off the latter. */}
            <LinkButton href="/bienvenue?edit=1" size="md">
              <Icon.plus size={15} />
              {t('watchlist.new')}
            </LinkButton>
            <LinkButton href="/app/watchlists/new" variant="secondary" size="md">
              {t('common.more')}
            </LinkButton>
          </>
        }
      />

      {watchlists.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Icon.radar size={22} />}
            title={t('watchlist.empty.title')}
            body={t('watchlist.empty.body')}
            action={
              <LinkButton href="/bienvenue?edit=1" size="md">
                <Icon.plus size={15} />
                {t('watchlist.new')}
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {watchlists.map((w) => {
            const c = parseCriteria(w.criteria)
            const channels = parseJsonArray(w.channels)
            const waiting = pending.get(w.id) ?? 0

            const facets: string[] = [
              ...(c.keywords ?? []).slice(0, 3),
              ...(c.domainCodes ?? []).map((d) => label('domain', d, locale)),
              ...(c.govCodes ?? []).slice(0, 3).map((g) => label('gov', g, locale)),
            ]
            const extra =
              (c.keywords?.length ?? 0) +
              (c.domainCodes?.length ?? 0) +
              (c.govCodes?.length ?? 0) +
              (c.categoryCodes?.length ?? 0) -
              facets.length

            return (
              <li key={w.id}>
                <Link
                  href={`/app/watchlists/${w.id}`}
                  className="panel flex h-full flex-col gap-3 p-4 transition-colors hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="clamp-1 text-[0.9375rem] font-semibold bidi-isolate">{w.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-[var(--text-muted)]">
                        <span>{t(`watchlist.cadence.${w.cadence}` as 'watchlist.cadence.instant')}</span>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span>{channels.filter((ch) => ch !== 'inapp').join(' · ') || t('watchlist.channel.inapp')}</span>
                      </p>
                    </div>
                    <Badge tone={w.is_active ? 'live' : 'gone'}>
                      {w.is_active ? t('watchlist.active') : t('watchlist.paused')}
                    </Badge>
                  </div>

                  {facets.length ? (
                    <div className="flex flex-wrap gap-1">
                      {facets.map((f, i) => (
                        <Chip key={`${f}-${i}`}>{f}</Chip>
                      ))}
                      {extra > 0 ? <Chip>+{extra}</Chip> : null}
                    </div>
                  ) : (
                    <p className="text-2xs text-[var(--text-faint)]">{t('common.none')}</p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                    <span>
                      <span className="label-xs block">{t('watchlist.matchesLabel')}</span>
                      <span className="num text-lg font-semibold leading-tight">
                        {formatNumber(w.match_count, locale)}
                      </span>
                    </span>

                    <span className="text-end">
                      {waiting > 0 && w.cadence !== 'instant' ? (
                        <Badge tone="soon">{formatNumber(waiting, locale)} en attente</Badge>
                      ) : null}
                      <span className="mt-1 block text-2xs text-[var(--text-faint)]">
                        {w.last_matched_at
                          ? `${t('watchlist.lastMatch')} ${formatRelative(w.last_matched_at, locale)}`
                          : t('watchlist.matchesNone')}
                      </span>
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
