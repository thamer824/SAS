import './_env'
import { ensureDb, nowIso } from '@/db'
import { newId, newToken, sha256 } from '@/lib/ids'

/** Mint an API token for the first org and print it. Dev helper. */
const d = ensureDb()
const org = d.prepare<[], { id: string }>('SELECT id FROM orgs ORDER BY created_at DESC LIMIT 1').get()
if (!org) {
  console.error('no org — run `npm run seed:demo` first')
  process.exit(1)
}

const raw = `mq_${newToken(24)}`
d.prepare(
  `INSERT INTO api_tokens (id, org_id, name, token_hash, prefix, scope, created_at)
   VALUES (?, ?, ?, ?, ?, 'read', ?)`,
).run(newId('tok'), org.id, process.argv[2] ?? 'cli', sha256(raw), raw.slice(0, 11), nowIso())

process.stdout.write(`${raw}\n`)
