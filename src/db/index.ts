import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/lib/config'

let _db: Database.Database | null = null

/**
 * Process-wide SQLite handle.
 *
 * WAL + NORMAL synchronous is the right trade for this workload: a single
 * ingest writer, many concurrent readers (page renders), and losing the last
 * few milliseconds on a hard crash costs nothing — we re-poll TUNEPS anyway.
 */
export function db(): Database.Database {
  if (_db) return _db

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true })

  const handle = new Database(config.databasePath)
  handle.pragma('journal_mode = WAL')
  handle.pragma('synchronous = NORMAL')
  handle.pragma('foreign_keys = ON')
  handle.pragma('busy_timeout = 8000')
  handle.pragma('temp_store = MEMORY')
  handle.pragma('cache_size = -32000') // ~32 MB

  _db = handle
  return handle
}

/** Apply every `NNN_*.sql` file in src/db/migrations exactly once. */
export function migrate(log: (msg: string) => void = () => {}): void {
  const d = db()
  d.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)

  const dir = path.join(process.cwd(), 'src/db/migrations')
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    d.prepare<[], { name: string }>('SELECT name FROM _migrations').all().map((r) => r.name),
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    d.exec('BEGIN')
    try {
      d.exec(sql)
      d.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      )
      d.exec('COMMIT')
      log(`applied ${file}`)
    } catch (err) {
      d.exec('ROLLBACK')
      throw new Error(`migration ${file} failed: ${(err as Error).message}`)
    }
  }
}

/** Ensure the schema exists before the first query on a cold Next.js worker. */
let ready = false
export function ensureDb(): Database.Database {
  if (!ready) {
    migrate()
    ready = true
  }
  return db()
}

// --- small helpers ---------------------------------------------------------

export function nowIso(): string {
  return new Date().toISOString()
}

export function kvGet(key: string): string | null {
  const row = ensureDb()
    .prepare<[string], { value: string }>('SELECT value FROM kv WHERE key = ?')
    .get(key)
  return row?.value ?? null
}

export function kvSet(key: string, value: string): void {
  ensureDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowIso())
}

/** Run `fn` inside a transaction, returning its value. */
export function tx<T>(fn: () => T): T {
  const d = ensureDb()
  return d.transaction(fn)()
}
