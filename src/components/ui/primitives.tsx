import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/** Tiny class joiner — avoids a clsx dependency for a one-line need. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// --- Button ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,opacity] duration-150 ' +
  'disabled:opacity-45 disabled:pointer-events-none select-none'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] ' +
    'shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
  secondary:
    'border border-[var(--border-strong)] bg-[var(--surface-panel)] ' +
    'hover:bg-[var(--surface-hover)] text-[var(--text-primary)]',
  ghost: 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  subtle: 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-active)] text-[var(--text-primary)]',
  danger: 'bg-brand-700 text-white hover:bg-brand-800',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-[0.8125rem]',
  lg: 'h-11 px-5 text-sm',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], extra)
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

// --- Badge -----------------------------------------------------------------

type Tone = 'neutral' | 'brand' | 'live' | 'soon' | 'gone' | 'info' | 'viz1' | 'viz2' | 'viz3' | 'viz4'

const TONE: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
  brand: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  live: 'bg-[var(--color-live-100)] text-live-600 dark:text-live-500',
  soon: 'bg-[var(--color-soon-100)] text-soon-600 dark:text-soon-500',
  gone: 'bg-[var(--surface-sunken)] text-[var(--text-faint)]',
  info: 'bg-[var(--color-info-100)] text-info-500',
  viz1: 'bg-viz-1/12 text-viz-1',
  viz2: 'bg-viz-2/12 text-viz-2',
  viz3: 'bg-viz-3/12 text-viz-3',
  viz4: 'bg-viz-4/12 text-viz-4',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  title,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold leading-4 bidi-isolate',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Outline pill for metadata that should recede — sector, governorate, procedure. */
export function Chip({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex max-w-full items-center gap-1 truncate rounded-md border border-[var(--border-subtle)]',
        'px-1.5 py-0.5 text-2xs font-medium text-[var(--text-muted)] bidi-isolate',
        className,
      )}
    >
      {children}
    </span>
  )
}

// --- Layout ----------------------------------------------------------------

export function Panel({
  children,
  className,
  as: As = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <As className={cx('panel', className)}>{children}</As>
}

export function PanelHeader({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cx(
        'flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[0.8125rem] font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className="label-xs mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

// --- Data display ----------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'live' | 'soon' | 'brand'
  href?: string
}) {
  const valueColor =
    tone === 'live'
      ? 'text-live-600 dark:text-live-500'
      : tone === 'soon'
        ? 'text-soon-600 dark:text-soon-500'
        : tone === 'brand'
          ? 'text-[var(--accent)]'
          : undefined

  const inner = (
    <>
      <p className="label-xs">{label}</p>
      <p className={cx('num mt-1.5 text-2xl font-semibold leading-none tracking-tight', valueColor)}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </>
  )

  const cls = 'panel panel-pad block transition-colors'
  return href ? (
    <Link href={href} className={cx(cls, 'hover:bg-[var(--surface-hover)]')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact,
}: {
  icon?: ReactNode
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-10' : 'px-6 py-16',
      )}
    >
      {icon ? (
        <div className="mb-3.5 grid size-11 place-items-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-faint)]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {body ? (
        <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">{body}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Field label + control, the only form layout used across the app. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  error,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  error?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">{hint}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-[var(--accent)]">{error}</p> : null}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-panel)] ' +
  'px-3 py-2 text-[0.8125rem] text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-faint)] ' +
  'focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ' +
  'transition-[border-color,box-shadow] duration-150'

export const selectClass = cx(inputClass, 'appearance-none pe-8 cursor-pointer')

export function Divider({ className }: { className?: string }) {
  return <hr className={cx('border-t border-[var(--border-subtle)]', className)} />
}

/** Key/value line used on tender and buyer detail pages. */
export function DataRow({
  label,
  children,
  mono,
}: {
  label: ReactNode
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex gap-3 border-b border-[var(--border-subtle)] py-2 last:border-0">
      <dt className="w-[42%] shrink-0 text-xs text-[var(--text-muted)]">{label}</dt>
      <dd
        className={cx(
          'min-w-0 flex-1 text-[0.8125rem] bidi-isolate',
          mono && 'font-mono text-xs',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

// --- Icons -----------------------------------------------------------------
// Inline 16px strokes: no icon package, no network fetch, and they inherit
// currentColor so every tone above works automatically.

type IconProps = { className?: string; size?: number }

function svg(path: ReactNode, { className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const Icon = {
  search: (p: IconProps) => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p),
  bell: (p: IconProps) =>
    svg(<><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" /><path d="M10 18a2 2 0 0 0 4 0" /></>, p),
  radar: (p: IconProps) =>
    svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 19 5" /></>, p),
  layers: (p: IconProps) =>
    svg(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 14 9 5 9-5" /></>, p),
  chart: (p: IconProps) =>
    svg(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>, p),
  building: (p: IconProps) =>
    svg(<><path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15" /><path d="M15 10h3a2 2 0 0 1 2 2v9" /><path d="M8 8h3M8 12h3M8 16h3M2 21h20" /></>, p),
  settings: (p: IconProps) =>
    svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>, p),
  clock: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, p),
  calendar: (p: IconProps) =>
    svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, p),
  filter: (p: IconProps) => svg(<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />, p),
  plus: (p: IconProps) => svg(<path d="M12 5v14M5 12h14" />, p),
  check: (p: IconProps) => svg(<path d="m4 12.5 5 5L20 6.5" />, p),
  x: (p: IconProps) => svg(<path d="M6 6l12 12M18 6 6 18" />, p),
  chevronDown: (p: IconProps) => svg(<path d="m6 9 6 6 6-6" />, p),
  chevronRight: (p: IconProps) => svg(<path d="m9 6 6 6-6 6" />, p),
  external: (p: IconProps) =>
    svg(<><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>, p),
  download: (p: IconProps) => svg(<><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></>, p),
  bookmark: (p: IconProps) => svg(<path d="M6 4h12v17l-6-4-6 4V4Z" />, p),
  inbox: (p: IconProps) =>
    svg(<><path d="M3 13 5.5 5h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" /><path d="M3 13h5l1 2h6l1-2h5" /></>, p),
  sun: (p: IconProps) =>
    svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>, p),
  moon: (p: IconProps) => svg(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />, p),
  globe: (p: IconProps) =>
    svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 3.5 5.7 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.7-3.5-9s1-6.5 3.5-9Z" /></>, p),
  alert: (p: IconProps) =>
    svg(<><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.2h.01" /></>, p),
  logout: (p: IconProps) =>
    svg(<><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M16 8l4 4-4 4" /><path d="M20 12H9" /></>, p),
  spark: (p: IconProps) =>
    svg(<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" />, p),
  target: (p: IconProps) =>
    svg(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>, p),
  arrowRight: (p: IconProps) => svg(<><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>, p),
  copy: (p: IconProps) =>
    svg(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 5H5a2 2 0 0 0-2 2v10" /></>, p),
  trash: (p: IconProps) =>
    svg(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 14h10l1-14" /></>, p),
  menu: (p: IconProps) => svg(<path d="M4 7h16M4 12h16M4 17h16" />, p),
}
