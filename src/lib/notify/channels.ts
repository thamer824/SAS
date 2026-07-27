import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ensureDb, nowIso } from '@/db'
import { config } from '@/lib/config'

/**
 * Notification transports. Each returns a DeliveryResult rather than throwing,
 * so one dead channel never blocks the others — a supplier who muted email
 * still gets their Telegram alert.
 */

export type Channel = 'inapp' | 'email' | 'webpush' | 'telegram'

export interface DeliveryResult {
  channel: Channel
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

function record(userId: string, r: DeliveryResult, subject: string, digest?: string): void {
  ensureDb()
    .prepare(
      `INSERT INTO deliveries (user_id, channel, subject, status, error, payload_digest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, r.channel, subject.slice(0, 300), r.status, r.error ?? null, digest ?? null, nowIso())
}

// --- email -----------------------------------------------------------------

let transporter: import('nodemailer').Transporter | null = null

async function getTransport() {
  if (transporter) return transporter
  const nodemailer = await import('nodemailer')

  if (!config.mail.host) {
    // No SMTP configured: write .eml files instead of sending. Development stays
    // fully exercisable — including the HTML — without an SMTP account.
    fs.mkdirSync(config.mail.outboxDir, { recursive: true })
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    })
    return transporter
  }

  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  })
  return transporter
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<DeliveryResult> {
  try {
    const tx = await getTransport()
    const info = await tx.sendMail({ from: config.mail.from, to, subject, html, text })

    if (!config.mail.host && 'message' in info) {
      const slug = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.eml`
      fs.writeFileSync(path.join(config.mail.outboxDir, slug), info.message as Buffer)
    }

    const r: DeliveryResult = { channel: 'email', status: 'sent' }
    record(userId, r, subject)
    return r
  } catch (err) {
    const r: DeliveryResult = { channel: 'email', status: 'failed', error: (err as Error).message }
    record(userId, r, subject)
    return r
  }
}

// --- web push --------------------------------------------------------------

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

export async function sendWebPush(userId: string, payload: PushPayload): Promise<DeliveryResult> {
  if (!config.push.enabled) {
    return { channel: 'webpush', status: 'skipped', error: 'VAPID keys not configured' }
  }

  const subs = ensureDb()
    .prepare<[string], { id: string; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    )
    .all(userId)

  if (!subs.length) return { channel: 'webpush', status: 'skipped', error: 'no subscriptions' }

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)

  let sent = 0
  let lastError: string | undefined

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      lastError = (err as Error).message
      // 404/410 mean the browser dropped the subscription — prune it.
      if (status === 404 || status === 410) {
        ensureDb().prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id)
      } else {
        ensureDb()
          .prepare('UPDATE push_subscriptions SET failed_count = failed_count + 1 WHERE id = ?')
          .run(sub.id)
      }
    }
  }

  const r: DeliveryResult =
    sent > 0
      ? { channel: 'webpush', status: 'sent' }
      : { channel: 'webpush', status: 'failed', error: lastError ?? 'all endpoints failed' }
  record(userId, r, payload.title)
  return r
}

// --- telegram --------------------------------------------------------------

/**
 * Telegram matters disproportionately in this market: it is where Tunisian SMEs
 * already are, it costs nothing, and it delivers in seconds on mobile without
 * an app install or a push permission prompt.
 */
export async function sendTelegram(
  userId: string,
  chatId: string,
  markdown: string,
): Promise<DeliveryResult> {
  if (!config.telegram.enabled) {
    return { channel: 'telegram', status: 'skipped', error: 'TELEGRAM_BOT_TOKEN not set' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: markdown,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`telegram ${res.status}: ${body.slice(0, 200)}`)
    }

    const r: DeliveryResult = { channel: 'telegram', status: 'sent' }
    record(userId, r, markdown.slice(0, 80))
    return r
  } catch (err) {
    const r: DeliveryResult = { channel: 'telegram', status: 'failed', error: (err as Error).message }
    record(userId, r, 'telegram')
    return r
  }
}

// --- in-app ----------------------------------------------------------------

export interface InAppNotification {
  userId: string
  kind: 'match' | 'deadline' | 'digest' | 'system'
  title: string
  body?: string
  url?: string
  meta?: Record<string, unknown>
}

export function createNotification(n: InAppNotification): string {
  const id = crypto.randomUUID()
  ensureDb()
    .prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, url, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, n.userId, n.kind, n.title, n.body ?? '', n.url ?? null, JSON.stringify(n.meta ?? {}), nowIso())
  return id
}

export function unreadCount(userId: string): number {
  return ensureDb()
    .prepare<[string], { n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    )
    .get(userId)!.n
}

export interface NotificationRow {
  id: string
  kind: string
  title: string
  body: string
  url: string | null
  meta: string
  read_at: string | null
  created_at: string
}

export function listNotifications(userId: string, limit = 40): NotificationRow[] {
  return ensureDb()
    .prepare<[string, number], NotificationRow>(
      `SELECT id, kind, title, body, url, meta, read_at, created_at
         FROM notifications WHERE user_id = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit)
}

export function markAllRead(userId: string): number {
  return ensureDb()
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(nowIso(), userId).changes
}

export function markRead(userId: string, id: string): void {
  ensureDb()
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL')
    .run(nowIso(), userId, id)
}
