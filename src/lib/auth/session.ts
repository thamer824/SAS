import { cookies } from 'next/headers'
import { ensureDb, nowIso } from '@/db'
import { newToken, sha256 } from '@/lib/ids'
import { isProd } from '@/lib/config'

export const SESSION_COOKIE = 'mq_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  email: string
  full_name: string
  locale: string
  telegram_chat_id: string | null
  /** Active workspace — every user has exactly one on signup. */
  org_id: string
  org_name: string
  org_slug: string
  org_role: string
  org_capabilities: string
  org_gov_code: string | null
  org_domain_codes: string
}

/**
 * Sessions are opaque random tokens; only their SHA-256 lands in the database.
 * A database leak therefore cannot be replayed as a login, and there is no JWT
 * to revoke-but-not-really.
 */
export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const raw = newToken(32)
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  ensureDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sha256(raw), userId, nowIso(), expires.toISOString(), userAgent?.slice(0, 300) ?? null)

  const jar = await cookies()
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    expires,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  if (raw) {
    ensureDb().prepare('DELETE FROM sessions WHERE id = ?').run(sha256(raw))
  }
  jar.delete(SESSION_COOKIE)
}

/**
 * Resolve the caller. Returns null when unauthenticated — callers decide
 * whether that is an error (see requireUser) or just a public page.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const raw = jar.get(SESSION_COOKIE)?.value
  if (!raw) return null

  const row = ensureDb()
    .prepare<[string, string], SessionUser>(
      `SELECT u.id, u.email, u.full_name, u.locale, u.telegram_chat_id,
              o.id   AS org_id,
              o.name AS org_name,
              o.slug AS org_slug,
              m.role AS org_role,
              o.capabilities AS org_capabilities,
              o.gov_code     AS org_gov_code,
              o.domain_codes AS org_domain_codes
         FROM sessions s
         JOIN users u       ON u.id = s.user_id
         JOIN org_members m ON m.user_id = u.id
         JOIN orgs o        ON o.id = m.org_id
        WHERE s.id = ? AND s.expires_at > ?
        ORDER BY m.created_at ASC
        LIMIT 1`,
    )
    .get(sha256(raw), nowIso())

  return row ?? null
}

/** Sweep expired sessions. Called opportunistically by the worker. */
export function pruneSessions(): number {
  return ensureDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso()).changes
}

export function touchUser(userId: string): void {
  ensureDb().prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso(), userId)
}
