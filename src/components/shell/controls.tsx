'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLocale, setTheme } from '@/lib/auth/actions'
import { Icon, cx } from '@/components/ui/primitives'

/**
 * The only client components in the shell. Everything else renders on the
 * server — these three need browser state (media query, popover, permission
 * prompt) and nothing more.
 */

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

const ICON_BUTTON =
  'grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition-colors ' +
  'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'

// --- locale ----------------------------------------------------------------

export function LocaleSwitcher({
  current,
  options,
}: {
  current: string
  options: Array<{ code: string; label: string }>
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const ref = useDismiss(open, () => setOpen(false))

  function choose(code: string) {
    setOpen(false)
    start(async () => {
      await setLocale(code)
      router.refresh()
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(ICON_BUTTON, 'w-auto gap-1.5 px-2 text-xs font-medium', pending && 'opacity-50')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Language"
      >
        <Icon.globe size={15} />
        <span className="uppercase">{current}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="panel absolute end-0 top-full z-40 mt-1.5 min-w-36 overflow-hidden py-1 shadow-[var(--shadow-pop)] animate-fade-up"
        >
          {options.map((o) => (
            <button
              key={o.code}
              role="menuitemradio"
              aria-checked={o.code === current}
              onClick={() => choose(o.code)}
              className={cx(
                'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-start text-xs',
                'hover:bg-[var(--surface-hover)]',
                o.code === current && 'font-semibold text-[var(--accent)]',
              )}
            >
              {o.label}
              {o.code === current ? <Icon.check size={13} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// --- theme -----------------------------------------------------------------

export function ThemeToggle({ initial }: { initial: string }) {
  const [pref, setPref] = useState(initial)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [pref])

  function cycle() {
    // Two-state toggle from whatever is currently painted: users reaching for
    // this want "the other one", not a three-way cycle through 'system'.
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    setPref(next)
    setIsDark(next === 'dark')
    void setTheme(next)
  }

  return (
    <button type="button" onClick={cycle} className={ICON_BUTTON} aria-label="Theme" title="Theme">
      {isDark ? <Icon.sun size={15} /> : <Icon.moon size={15} />}
    </button>
  )
}

// --- notification bell -----------------------------------------------------

export interface BellItem {
  id: string
  kind: string
  title: string
  body: string
  url: string | null
  createdLabel: string
  unread: boolean
}

export function NotificationBell({
  items,
  unread,
  labels,
}: {
  items: BellItem[]
  unread: number
  labels: { title: string; empty: string; markAll: string; all: string }
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(unread)
  const [list, setList] = useState(items)
  const ref = useDismiss(open, () => setOpen(false))
  const router = useRouter()

  async function markAll() {
    setCount(0)
    setList((prev) => prev.map((i) => ({ ...i, unread: false })))
    await fetch('/api/notifications/read-all', { method: 'POST' })
    router.refresh()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(ICON_BUTTON, 'relative')}
        aria-label={labels.title}
        aria-expanded={open}
      >
        <Icon.bell size={16} />
        {count > 0 ? (
          <span className="num absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.5625rem] font-bold leading-4 text-[var(--accent-fg)]">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="panel absolute end-0 top-full z-40 mt-1.5 w-[min(23rem,calc(100vw-2rem))] overflow-hidden shadow-[var(--shadow-pop)] animate-fade-up">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
            <span className="text-xs font-semibold">{labels.title}</span>
            {count > 0 ? (
              <button
                onClick={markAll}
                className="text-2xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {labels.markAll}
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">{labels.empty}</p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {list.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.url ?? '/app/notifications'}
                      className={cx(
                        'flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)]',
                        n.unread && 'bg-[var(--accent-softer)]',
                      )}
                    >
                      <span
                        className={cx(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          n.unread ? 'bg-[var(--accent)]' : 'bg-transparent',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="clamp-2 block text-xs font-medium leading-snug bidi-isolate">
                          {n.title}
                        </span>
                        {n.body ? (
                          <span className="clamp-1 mt-0.5 block text-2xs text-[var(--text-muted)] bidi-isolate">
                            {n.body}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-2xs text-[var(--text-faint)]">{n.createdLabel}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <a
            href="/app/notifications"
            className="block border-t border-[var(--border-subtle)] px-3 py-2 text-center text-2xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            {labels.all}
          </a>
        </div>
      ) : null}
    </div>
  )
}

// --- web push opt-in -------------------------------------------------------

export function PushToggle({
  vapidPublicKey,
  labels,
}: {
  vapidPublicKey: string
  labels: { enable: string; enabled: string; blocked: string; unsupported: string }
}) {
  const [state, setState] = useState<'unknown' | 'unsupported' | 'default' | 'granted' | 'denied' | 'busy'>(
    'unknown',
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) {
      setState('unsupported')
      return
    }
    setState(Notification.permission as 'default' | 'granted' | 'denied')
  }, [vapidPublicKey])

  async function enable() {
    setState('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission as 'denied' | 'default')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setState('granted')
    } catch {
      setState('default')
    }
  }

  if (state === 'unsupported') {
    return <p className="text-xs text-[var(--text-muted)]">{labels.unsupported}</p>
  }
  if (state === 'granted') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-live-600 dark:text-live-500">
        <Icon.check size={13} />
        {labels.enabled}
      </p>
    )
  }
  if (state === 'denied') {
    return <p className="text-xs text-soon-600 dark:text-soon-500">{labels.blocked}</p>
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={state === 'busy'}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
    >
      <Icon.bell size={13} />
      {labels.enable}
    </button>
  )
}

/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 * Allocated over a plain ArrayBuffer so it satisfies BufferSource — a bare
 * `new Uint8Array(n)` is typed ArrayBufferLike, which lib.dom rejects.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// --- mobile nav ------------------------------------------------------------

export function MobileNavToggle({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))

  return (
    <div className="lg:hidden" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={ICON_BUTTON} aria-label={label}>
        <Icon.menu size={17} />
      </button>
      {open ? (
        <div
          className="panel absolute start-3 end-3 top-full z-40 mt-1.5 overflow-hidden p-2 shadow-[var(--shadow-pop)] animate-fade-up"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
