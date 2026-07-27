import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { config } from '@/lib/config'
import { formatNumber, formatRelative, getLocale, translator } from '@/lib/i18n'
import { listNotifications, unreadCount } from '@/lib/notify/channels'
import { markAllNotificationsRead } from '@/lib/actions/notification-actions'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  PageHeader,
  Panel,
  cx,
} from '@/components/ui/primitives'
import { PushToggle } from '@/components/shell/controls'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return { title: t('notif.title') }
}

export default async function NotificationsPage() {
  const user = await requireUser('/app/notifications')
  const locale = await getLocale()
  const t = translator(locale)

  const items = listNotifications(user.id, 60)
  const unread = unreadCount(user.id)

  const kindTone = {
    match: 'brand',
    deadline: 'soon',
    digest: 'info',
    system: 'neutral',
  } as const

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('notif.title')}
        subtitle={unread > 0 ? t('notif.unread', { n: formatNumber(unread, locale) }) : undefined}
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button variant="secondary" size="md">
                <Icon.check size={14} />
                {t('notif.markAllRead')}
              </Button>
            </form>
          ) : null
        }
      />

      <Panel className="mb-4 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold">{t('watchlist.channel.webpush')}</p>
            <p className="mt-0.5 text-2xs text-[var(--text-muted)]">
              {t('watchlist.cadence.instant.hint')}
            </p>
          </div>
          <PushToggle
            vapidPublicKey={config.push.publicKey}
            labels={{
              enable: t('notif.enablePush'),
              enabled: t('notif.pushEnabled'),
              blocked: t('notif.pushBlocked'),
              unsupported: t('notif.pushUnsupported'),
            }}
          />
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon.inbox size={20} />}
            title={t('notif.empty')}
            body={t('watchlist.empty.body')}
            action={
              <Link
                href="/app/watchlists/new"
                className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {t('watchlist.new')}
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {items.map((n) => {
              const Row = (
                <>
                  <span className="mt-1 shrink-0">
                    <Badge tone={kindTone[n.kind as keyof typeof kindTone] ?? 'neutral'}>
                      {t(`notif.kind.${n.kind}` as 'notif.kind.match')}
                    </Badge>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] font-medium leading-snug bidi-isolate">
                      {n.title}
                    </span>
                    {n.body ? (
                      <span className="clamp-2 mt-1 block text-xs text-[var(--text-muted)] bidi-isolate">
                        {n.body}
                      </span>
                    ) : null}
                    <span className="mt-1.5 block text-2xs text-[var(--text-faint)]">
                      {formatRelative(n.created_at, locale)}
                    </span>
                  </span>
                  {n.read_at === null ? (
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                      aria-label={t('notif.unread', { n: 1 })}
                    />
                  ) : null}
                </>
              )

              const cls = cx(
                'flex gap-3 px-4 py-3 transition-colors',
                n.read_at === null && 'bg-[var(--accent-softer)]',
                n.url && 'hover:bg-[var(--surface-hover)]',
              )

              return (
                <li key={n.id}>
                  {n.url ? (
                    <Link href={n.url} className={cls}>
                      {Row}
                    </Link>
                  ) : (
                    <div className={cls}>{Row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
