import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'
import { requireUser } from '@/lib/auth/guard'
import { signOut } from '@/lib/auth/actions'
import { getLocale, LOCALE_META, LOCALES, formatRelative, translator } from '@/lib/i18n'
import { listNotifications, unreadCount } from '@/lib/notify/channels'
import { Brand, SidebarNav, navItems } from '@/components/shell/nav'
import { LocaleSwitcher, MobileNavToggle, NotificationBell, ThemeToggle } from '@/components/shell/controls'
import { SearchBox } from '@/components/shell/search-box'
import { Icon } from '@/components/ui/primitives'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/app')
  const locale = await getLocale()
  const t = translator(locale)

  // `x-pathname` is set by middleware so the server-rendered sidebar can mark
  // the active item without turning the whole nav into a client component.
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') ?? '/app'

  const jar = await cookies()
  const themePref = jar.get('mq_theme')?.value ?? 'system'

  const unread = unreadCount(user.id)
  const items = navItems(t, { notifications: unread })
  const bellItems = listNotifications(user.id, 8).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    url: n.url,
    createdLabel: formatRelative(n.created_at, locale),
    unread: n.read_at === null,
  }))

  const sidebar = <SidebarNav items={items} pathname={pathname} />

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* --- sidebar (desktop) --- */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-[var(--border-subtle)] bg-[var(--surface-panel)] lg:flex">
        <div className="px-4 py-4">
          <Brand tagline={t('app.tagline')} />
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 pb-4">{sidebar}</div>

        <div className="border-t border-[var(--border-subtle)] p-2.5">
          <div className="mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-2xs font-bold uppercase text-[var(--text-secondary)]"
              aria-hidden="true"
            >
              {(user.full_name || user.email).slice(0, 2)}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-medium">{user.full_name || user.email}</span>
              <span className="block truncate text-2xs text-[var(--text-faint)]">{user.org_name}</span>
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Icon.logout size={16} className="flip-rtl" />
              {t('nav.signout')}
            </button>
          </form>
        </div>
      </aside>

      {/* --- main --- */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/95 px-3 backdrop-blur-sm sm:px-5">
          <MobileNavToggle label={t('nav.skipToContent')}>{sidebar}</MobileNavToggle>

          <div className="lg:hidden">
            <Brand />
          </div>

          <div className="hidden min-w-0 flex-1 sm:flex sm:max-w-lg">
            <Suspense
              fallback={<div className="h-9 w-full rounded-lg bg-[var(--surface-sunken)]" aria-hidden="true" />}
            >
              <SearchBox placeholder={t('nav.search.placeholder')} />
            </Suspense>
          </div>

          <div className="ms-auto flex items-center gap-0.5">
            <NotificationBell
              items={bellItems}
              unread={unread}
              labels={{
                title: t('notif.title'),
                empty: t('notif.empty'),
                markAll: t('notif.markAllRead'),
                all: t('common.more'),
              }}
            />
            <LocaleSwitcher
              current={locale}
              options={LOCALES.map((l) => ({ code: l, label: LOCALE_META[l].nativeLabel }))}
            />
            <ThemeToggle initial={themePref} />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  )
}
