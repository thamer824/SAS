'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ensureDb, nowIso } from '@/db'
import { newId, newToken, sha256 } from '@/lib/ids'
import { requireUserOrThrow } from '@/lib/auth/guard'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { parseKeywords } from '@/lib/text/normalize'

export interface SettingsState {
  error?: string
  ok?: boolean
  /** Set once, immediately after creation — a token is never shown twice. */
  token?: string
}

export async function saveProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUserOrThrow()

  const fullName = String(formData.get('fullName') ?? '').trim().slice(0, 120)
  if (!fullName) return { error: 'common.required' }

  ensureDb().prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, user.id)
  revalidatePath('/app/settings')
  return { ok: true }
}

const companySchema = z.object({
  name: z.string().trim().min(1).max(160),
  taxId: z.string().trim().max(40).optional(),
  govCode: z.string().trim().max(8).optional(),
})

export async function saveCompany(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUserOrThrow()

  const parsed = companySchema.safeParse({
    name: formData.get('name'),
    taxId: formData.get('taxId') ?? undefined,
    govCode: formData.get('govCode') ?? undefined,
  })
  if (!parsed.success) return { error: 'common.required' }

  const capabilities = parseKeywords(String(formData.get('capabilities') ?? ''))
  const domainCodes = formData
    .getAll('domainCodes')
    .map((v) => String(v).trim())
    .filter(Boolean)

  ensureDb()
    .prepare(
      `UPDATE orgs SET name = ?, tax_id = ?, gov_code = ?, capabilities = ?, domain_codes = ?
        WHERE id = ?`,
    )
    .run(
      parsed.data.name,
      parsed.data.taxId || null,
      parsed.data.govCode || null,
      JSON.stringify(capabilities),
      JSON.stringify(domainCodes),
      user.org_id,
    )

  revalidatePath('/app/settings')
  // The fit score is derived from these values, so the feed changes too.
  revalidatePath('/app/tenders')
  revalidatePath('/app')
  return { ok: true }
}

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUserOrThrow()

  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('next') ?? '')
  if (next.length < 8) return { error: 'auth.error.weak' }

  const row = ensureDb()
    .prepare<[string], { password_hash: string }>('SELECT password_hash FROM users WHERE id = ?')
    .get(user.id)
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return { error: 'auth.error.invalid' }
  }

  const hash = await hashPassword(next)
  const d = ensureDb()
  d.transaction(() => {
    d.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
    // A password change invalidates every other session.
    d.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  })()

  return { ok: true }
}

export async function createApiToken(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUserOrThrow()

  const name = String(formData.get('name') ?? '').trim().slice(0, 80) || 'Jeton'
  const raw = `mq_${newToken(24)}`

  ensureDb()
    .prepare(
      `INSERT INTO api_tokens (id, org_id, name, token_hash, prefix, scope, created_at)
       VALUES (?, ?, ?, ?, ?, 'read', ?)`,
    )
    .run(newId('tok'), user.org_id, name, sha256(raw), raw.slice(0, 11), nowIso())

  revalidatePath('/app/settings')
  return { ok: true, token: raw }
}

export async function revokeApiToken(id: string): Promise<void> {
  const user = await requireUserOrThrow()
  ensureDb().prepare('DELETE FROM api_tokens WHERE id = ? AND org_id = ?').run(id, user.org_id)
  revalidatePath('/app/settings')
}

/**
 * Link a Telegram chat.
 *
 * The user sends /start to the bot; the bot replies with their numeric chat id,
 * which they paste here. Crude compared with a deep-link flow, but it needs no
 * public webhook URL — which matters for a self-hosted deployment behind NAT.
 */
export async function linkTelegram(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUserOrThrow()

  const chatId = String(formData.get('chatId') ?? '').trim()
  if (!/^-?\d{5,20}$/.test(chatId)) return { error: 'common.required' }

  ensureDb().prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').run(chatId, user.id)
  revalidatePath('/app/settings')
  return { ok: true }
}

export async function unlinkTelegram(): Promise<void> {
  const user = await requireUserOrThrow()
  ensureDb().prepare('UPDATE users SET telegram_chat_id = NULL WHERE id = ?').run(user.id)
  revalidatePath('/app/settings')
}
