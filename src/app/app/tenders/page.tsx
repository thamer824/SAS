import { redirect } from 'next/navigation'
import type { SearchParams } from '@/lib/queries/params'

/**
 * The feed moved to `/app` — logging in should land on the offers, not on a
 * dashboard. This keeps every previously shared or bookmarked `/app/tenders?…`
 * link working, query string intact.
 */
export default async function TendersRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) qs.append(key, v)
    }
  }

  redirect(qs.toString() ? `/app?${qs}` : '/app')
}
