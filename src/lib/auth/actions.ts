'use server'

import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { ensureDb, nowIso, tx } from '@/db'
import { newId, slugify } from '@/lib/ids'
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n'
import { hashPassword, verifyPassword } from './password'
import { createSession, currentUser, destroySession, touchUser } from './session'

export interface FormState {
  error?: string
  ok?: boolean
}

const emailSchema = z.string().trim().toLowerCase().email().max(200)

const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(160).optional(),
})

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    companyName: formData.get('companyName') ?? undefined,
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    if (issue.path[0] === 'password') return { error: 'auth.error.weak' }
    if (issue.path[0] === 'email') return { error: 'auth.error.email' }
    return { error: 'common.required' }
  }

  const { email, password, fullName, companyName } = parsed.data
  const d = ensureDb()

  const existing = d.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) return { error: 'auth.error.exists' }

  const passwordHash = await hashPassword(password)
  const userId = newId('usr')
  const orgId = newId('org')
  const ts = nowIso()

  const jar = await cookies()
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : 'fr'

  // Unique slug: the display name may well collide across companies.
  const base = slugify(companyName || fullName)
  let slug = base
  let n = 1
  while (d.prepare('SELECT id FROM orgs WHERE slug = ?').get(slug)) {
    slug = `${base}-${++n}`
  }

  try {
    tx(() => {
      d.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, locale, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(userId, email, passwordHash, fullName, locale, ts, ts)

      d.prepare(
        `INSERT INTO orgs (id, name, slug, created_at) VALUES (?, ?, ?, ?)`,
      ).run(orgId, companyName || fullName, slug, ts)

      d.prepare(
        `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`,
      ).run(orgId, userId, ts)
    })
  } catch {
    return { error: 'common.error' }
  }

  const hdrs = await headers()
  await createSession(userId, hdrs.get('user-agent') ?? undefined)
  // Straight into sector selection: a new account's feed is unfiltered noise
  // until it knows what the user does.
  redirect('/bienvenue')
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1).max(200) })
    .safeParse({ email: formData.get('email'), password: formData.get('password') })

  if (!parsed.success) return { error: 'auth.error.invalid' }

  const row = ensureDb()
    .prepare<[string], { id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = ?',
    )
    .get(parsed.data.email)

  // Always run a verification, even with no user, so response time does not
  // reveal whether an address is registered.
  const hash = row?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  const ok = await verifyPassword(parsed.data.password, hash)

  if (!row || !ok) return { error: 'auth.error.invalid' }

  touchUser(row.id)
  const hdrs = await headers()
  await createSession(row.id, hdrs.get('user-agent') ?? undefined)
  redirect('/app')
}

export async function signOut(): Promise<void> {
  await destroySession()
  redirect('/')
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  const user = await currentUser()
  if (user) {
    ensureDb().prepare('UPDATE users SET locale = ? WHERE id = ?').run(locale, user.id)
  }
}

export async function setTheme(theme: string): Promise<void> {
  const value = theme === 'dark' || theme === 'light' || theme === 'system' ? theme : 'system'
  const jar = await cookies()
  jar.set('mq_theme', value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
