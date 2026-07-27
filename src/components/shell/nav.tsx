import Link from 'next/link'
import { cx, Icon } from '@/components/ui/primitives'
import type { Translator } from '@/lib/i18n'

export interface NavItem {
  href: string
  label: string
  icon: keyof typeof Icon
  badge?: number
  exact?: boolean
}

/**
 * Five items, not eight.
 *
 * Dropped from the rail on purpose:
 *  - Notifications — already the bell in the header; a second entry point for
 *    the same list is noise.
 *  - Acheteurs publics — reached from any notice's buyer name and from the
 *    market page. Nobody's first move is "browse 1 697 institutions".
 *  - A separate dashboard — the feed IS the home page now.
 *
 * The routes still exist; they just don't compete for attention.
 */
export function navItems(t: Translator, badges: { notifications?: number } = {}): NavItem[] {
  return [
    { href: '/app', label: t('nav.offers'), icon: 'layers', exact: true },
    { href: '/app/watchlists', label: t('nav.alerts'), icon: 'bell', badge: badges.notifications },
    { href: '/app/pipeline', label: t('nav.favorites'), icon: 'bookmark' },
    { href: '/app/insights', label: t('nav.market'), icon: 'chart' },
    { href: '/app/settings', label: t('nav.settings'), icon: 'settings' },
  ]
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function SidebarNav({
  items,
  pathname,
  compact,
}: {
  items: NavItem[]
  pathname: string
  compact?: boolean
}) {
  return (
    <nav className={cx('flex flex-col gap-0.5', compact && 'gap-0')} aria-label="Principal">
      {items.map((item) => {
        const Ico = Icon[item.icon]
        const active = isActive(pathname, item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] transition-colors',
              active
                ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            <Ico size={16} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="num grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.5625rem] font-bold leading-4 text-[var(--accent-fg)]">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function Brand({ href = '/app', tagline }: { href?: string; tagline?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Mounaqasat">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_1px_3px_rgb(0_0_0/0.14)]"
        aria-hidden="true"
      >
        {/* A crescent + tender-document mark: local, but not a flag pastiche. */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15.5 3.2a9 9 0 1 0 5.3 12.6A7.2 7.2 0 0 1 15.5 3.2Z"
            fill="currentColor"
            opacity="0.95"
          />
          <path d="M8 9h5M8 12.5h7M8 16h4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[0.9375rem] font-semibold tracking-[-0.015em]">
          Mounaqasat
        </span>
        {tagline ? (
          <span className="block truncate text-2xs text-[var(--text-faint)]">{tagline}</span>
        ) : null}
      </span>
    </Link>
  )
}
