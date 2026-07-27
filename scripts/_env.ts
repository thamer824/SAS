/**
 * Load .env.local / .env for CLI scripts.
 *
 * Next.js does this for the app automatically; the sync and worker CLIs run
 * outside Next, so they need it explicitly. Hand-rolled to avoid a dotenv
 * dependency and to keep the precedence rule obvious: .env.local wins.
 */
import fs from 'node:fs'
import path from 'node:path'

function load(file: string): void {
  const full = path.join(process.cwd(), file)
  if (!fs.existsSync(full)) return

  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // First file to define a key wins, matching Next.js precedence.
    if (process.env[key] === undefined) process.env[key] = value
  }
}

load('.env.local')
load('.env')

export {}
