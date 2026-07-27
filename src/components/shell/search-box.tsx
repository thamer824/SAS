'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, cx } from '@/components/ui/primitives'

/**
 * Global search. Submits to /app/tenders rather than filtering in place, so the
 * URL is always the source of truth and a search is shareable and bookmarkable.
 */
export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')

  // Keep in sync when navigation changes the query (back button, chip removal).
  useEffect(() => {
    setValue(params.get('q') ?? '')
  }, [params])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    const next = new URLSearchParams()
    if (trimmed) next.set('q', trimmed)
    router.push(`/app${next.toString() ? `?${next}` : ''}`)
  }

  return (
    <form onSubmit={submit} className={cx('relative flex-1', className)} role="search">
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-9 place-items-center text-[var(--text-faint)]">
        <Icon.search size={15} />
      </span>
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={
          'h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] ' +
          'ps-9 pe-3 text-[0.8125rem] placeholder:text-[var(--text-faint)] ' +
          'focus:border-[var(--accent)] focus:bg-[var(--surface-panel)] focus:outline-none ' +
          'focus:ring-2 focus:ring-[var(--ring)] transition-[background-color,border-color,box-shadow]'
        }
      />
    </form>
  )
}
