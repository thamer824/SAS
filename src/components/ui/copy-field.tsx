'use client'

import { useState } from 'react'
import { Icon, cx } from './primitives'

/** Read-only value with a copy button — ICS feed URLs, API tokens. */
export function CopyField({
  value,
  copyLabel,
  copiedLabel,
  masked,
}: {
  value: string
  copyLabel: string
  copiedLabel: string
  masked?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked (insecure origin, permission). The input is
      // still selectable, so manual copy remains possible.
    }
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <input
        readOnly
        dir="ltr"
        value={masked ? `${value.slice(0, 10)}${'•'.repeat(12)}` : value}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2.5 py-2 font-mono text-2xs text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <button
        type="button"
        onClick={copy}
        className={cx(
          'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition-colors',
          copied
            ? 'border-live-500/40 text-live-600 dark:text-live-500'
            : 'border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
        )}
      >
        {copied ? <Icon.check size={12} /> : <Icon.copy size={12} />}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}
