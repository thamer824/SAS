import path from 'node:path'

function env(key: string, fallback = ''): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

function int(key: string, fallback: number): number {
  const n = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

const root = process.cwd()

export const config = {
  databasePath: path.resolve(root, env('DATABASE_PATH', './data/mounaqasat.db')),
  appUrl: env('APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
  appSecret: env('APP_SECRET', 'dev-only-insecure-secret-do-not-ship'),

  tuneps: {
    base: env('TUNEPS_API_BASE', 'https://www.tuneps.tn/api2/portail'),
    tlsStrict: bool('TUNEPS_TLS_STRICT', false),
    delayMs: int('TUNEPS_REQUEST_DELAY_MS', 350),
    detailBudget: int('TUNEPS_DETAIL_BUDGET', 400),
  },

  mail: {
    host: env('SMTP_HOST'),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', 'Mounaqasat <alertes@mounaqasat.local>'),
    outboxDir: path.resolve(root, 'data/outbox'),
  },

  push: {
    publicKey: env('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:alertes@mounaqasat.local'),
    get enabled() {
      return Boolean(this.publicKey && this.privateKey)
    },
  },

  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN'),
    get enabled() {
      return Boolean(this.botToken)
    },
  },
} as const

export const isProd = process.env.NODE_ENV === 'production'
