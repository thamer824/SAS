import { redirect } from 'next/navigation'
import { currentUser, type SessionUser } from './session'
import { parseJsonArray } from '@/lib/match/engine'

/** Gate a page or action on a session. Redirects to sign-in when absent. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) {
    redirect(returnTo ? `/signin?next=${encodeURIComponent(returnTo)}` : '/signin')
  }
  return user
}

export interface OrgProfile {
  id: string
  name: string
  slug: string
  capabilities: string[]
  domainCodes: string[]
  govCode: string | null
}

export function orgProfile(user: SessionUser): OrgProfile {
  return {
    id: user.org_id,
    name: user.org_name,
    slug: user.org_slug,
    capabilities: parseJsonArray(user.org_capabilities),
    domainCodes: parseJsonArray(user.org_domain_codes),
    govCode: user.org_gov_code,
  }
}

/** Throw-style guard for server actions, where redirect() reads as a bug. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new Error('unauthenticated')
  return user
}
