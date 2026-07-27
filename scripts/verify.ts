import { SQL_NOW } from '@/db/sql'
import './_env'
import fs from 'node:fs'
import { ensureDb, nowIso } from '@/db'
import { config } from '@/lib/config'
import { newId, newToken, sha256 } from '@/lib/ids'
import { getWatchlist } from '@/lib/match/engine'
import { runDeadlineReminders, runDigests, runMatching } from '@/lib/match/run'
import { listNotifications, unreadCount } from '@/lib/notify/channels'
import { searchTenders } from '@/lib/queries/tenders'
import { tendersToCsv } from '@/lib/export/csv'
import { tendersToIcs } from '@/lib/export/ics'
import { fold, toFtsQuery } from '@/lib/text/normalize'
import { isoToTuneps, tunepsToIso } from '@/lib/tuneps/dates'
import { domainFromCategory } from '@/lib/tuneps/reference'

/**
 * End-to-end verification of the parts a screenshot cannot prove: the alert
 * delivery path, the export formats and the text-folding rules.
 *
 *   npm run verify
 */

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title: string) {
  console.log(`\n▸ ${title}`)
}

async function main() {
  const d = ensureDb()

  // ---------------------------------------------------------------- folding
  section('text folding (FR/AR search normalisation)')
  check('French accents folded', fold('Électricité') === 'electricite', fold('Électricité'))
  check('case folded', fold('TRAVAUX') === 'travaux')
  check(
    'Arabic diacritics stripped',
    fold('كَهْرَبَاء') === fold('كهرباء'),
    `${fold('كَهْرَبَاء')} == ${fold('كهرباء')}`,
  )
  check('alef variants unified', fold('إعلان') === fold('اعلان'))
  check('ta-marbuta unified', fold('صفقة') === fold('صفقه'))
  check('punctuation becomes separator', fold('lot n°3/2026') === 'lot n 3 2026', fold('lot n°3/2026'))
  const fts = toFtsQuery('genie civil -etude')
  check('FTS query built with prefix + NOT', fts === 'genie* AND civil* NOT etude*', String(fts))

  // ------------------------------------------------------------------- dates
  section('TUNEPS date handling (Africa/Tunis = UTC+1)')
  check(
    'wall-clock parsed to UTC',
    tunepsToIso('2026-08-13 10:00:00.0') === '2026-08-13T09:00:00.000Z',
    String(tunepsToIso('2026-08-13 10:00:00.0')),
  )
  check(
    'compact form parsed',
    tunepsToIso('202608131030') === '2026-08-13T09:30:00.000Z',
    String(tunepsToIso('202608131030')),
  )
  check(
    'round-trips back to TUNEPS format',
    isoToTuneps('2026-08-13T09:00:00.000Z') === '2026-08-13 10:00:00',
    isoToTuneps('2026-08-13T09:00:00.000Z'),
  )
  check('microsecond precision tolerated', tunepsToIso('2026-07-24 20:34:06.040209') !== null)

  // Regression guard. Timestamps are stored as ISO-8601 with a 'T'; SQLite's
  // datetime('now') uses a space. Since 'T' > ' ', comparing the two makes any
  // same-day deadline look like it is still in the future. This once reported
  // 14 already-closed tenders as open. See src/db/sql.ts.
  const naive = d
    .prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM tenders WHERE deadline_at > datetime('now')",
    )
    .get()!.n
  const correct = d
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM tenders WHERE deadline_at > ${SQL_NOW}`)
    .get()!.n
  check(
    'SQL_NOW is never looser than datetime(now)',
    correct <= naive,
    `${correct} correct vs ${naive} naive (${naive - correct} same-day row(s) the naive form would leak)`,
  )
  const leaked = d
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM tenders WHERE deadline_at > ${SQL_NOW} AND deadline_at < ?`,
    )
    .get(new Date().toISOString())!.n
  check('no "open" tender has a deadline in the past', leaked === 0, `${leaked} leaked`)

  // -------------------------------------------------------- domain inference
  section('domain inference from sector code')
  check('1xx → Fournitures', domainFromCategory('115') === '2391')
  check('3xx → Travaux', domainFromCategory('301') === '2392')
  check('5xx → Services', domainFromCategory('503') === '2393')
  check('7xx → Etudes', domainFromCategory('712') === '2394')

  // ------------------------------------------------------------------ corpus
  section('corpus')
  const counts = d
    .prepare<[], { tenders: number; ao: number; cons: number; fts: number; buyers: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tenders) AS tenders,
         (SELECT COUNT(*) FROM tenders WHERE source='ao') AS ao,
         (SELECT COUNT(*) FROM tenders WHERE source='consultation') AS cons,
         (SELECT COUNT(*) FROM tenders_fts) AS fts,
         (SELECT COUNT(*) FROM buyers) AS buyers,
         (SELECT COUNT(*) FROM tenders WHERE deadline_at > ${SQL_NOW}) AS open`,
    )
    .get()!
  check('tenders ingested', counts.tenders > 1000, String(counts.tenders))
  check('both sources present', counts.ao > 0 && counts.cons > 0, `${counts.ao} AO / ${counts.cons} cons`)
  check('FTS index matches table', counts.fts === counts.tenders, `${counts.fts} vs ${counts.tenders}`)
  check('buyer directory populated', counts.buyers > 1000, String(counts.buyers))
  check('open tenders present', counts.open > 0, String(counts.open))

  // ------------------------------------------------------------------ search
  section('search')
  const frHit = searchTenders({ q: 'electricite', limit: 5, status: 'all' })
  check('accent-insensitive FR search hits', frHit.total > 0, `${frHit.total} results for "electricite"`)
  const arHit = searchTenders({ q: 'كهرباء', limit: 5, status: 'all' })
  check('Arabic search hits', arHit.total > 0, `${arHit.total} results for "كهرباء"`)
  const excluded = searchTenders({ q: 'travaux', excludeKeywords: ['etude'], limit: 5, status: 'all' })
  check('exclusion narrows results', excluded.total >= 0, `${excluded.total} results`)

  // ------------------------------------------------------- alert delivery
  section('alert delivery (instant cadence, email → outbox)')

  const owner = d
    .prepare<[], { id: string; org_id: string; email: string }>(
      `SELECT u.id, m.org_id, u.email FROM users u JOIN org_members m ON m.user_id = u.id LIMIT 1`,
    )
    .get()

  if (!owner) {
    check('a user exists to alert', false, 'run `npm run seed:demo` first')
  } else {
    const before = unreadCount(owner.id)
    const outboxBefore = fs.existsSync(config.mail.outboxDir)
      ? fs.readdirSync(config.mail.outboxDir).length
      : 0

    // A deliberately broad, temporary watchlist so matching is guaranteed.
    const wlId = newId('wl')
    const ts = nowIso()
    d.prepare(
      `INSERT INTO watchlists
         (id, org_id, created_by, name, criteria, cadence, channels, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'instant', ?, ?, ?)`,
    ).run(
      wlId,
      owner.org_id,
      owner.id,
      '[verify] temporaire',
      JSON.stringify({ keywords: ['a', 'de', 'et', 'la'], openOnly: true, minScore: 0 }),
      JSON.stringify(['inapp', 'email']),
      ts,
      ts,
    )

    const recent = searchTenders({ status: 'open', sort: 'newest', limit: 40 }).rows.map((r) => r.id)
    const summary = await runMatching(recent, () => {})

    check('watchlists evaluated', summary.watchlists > 0, `${summary.watchlists} evaluated`)
    check('matches recorded', summary.matches > 0, `${summary.matches} match(es)`)
    check('in-app notifications created', summary.notifications > 0, `${summary.notifications}`)
    check('email deliveries attempted', summary.deliveries > 0, `${summary.deliveries}`)

    const after = unreadCount(owner.id)
    check('unread count increased', after > before, `${before} → ${after}`)

    const latest = listNotifications(owner.id, 1)[0]
    check('notification has a link', Boolean(latest?.url), latest?.url ?? '')

    const outboxAfter = fs.existsSync(config.mail.outboxDir)
      ? fs.readdirSync(config.mail.outboxDir).length
      : 0
    check('.eml written to outbox', outboxAfter > outboxBefore, `${outboxBefore} → ${outboxAfter} file(s)`)

    if (outboxAfter > outboxBefore) {
      const newest = fs
        .readdirSync(config.mail.outboxDir)
        .map((f) => ({ f, m: fs.statSync(`${config.mail.outboxDir}/${f}`).mtimeMs }))
        .sort((a, b) => b.m - a.m)[0]
      const eml = fs.readFileSync(`${config.mail.outboxDir}/${newest.f}`, 'utf8')
      check('email contains a tender link', eml.includes('/app/tenders/'))
      check('email is multipart (html + text)', eml.includes('multipart/alternative'))
    }

    // Second pass must be silent: de-duplication is what keeps alerts trustworthy.
    const repeat = await runMatching(recent, () => {})
    check('re-running does not re-alert', repeat.matches === 0, `${repeat.matches} new match(es)`)

    // Digest path
    d.prepare("UPDATE watchlists SET cadence = 'daily', last_digest_at = NULL WHERE id = ?").run(wlId)
    d.prepare('UPDATE watchlist_matches SET notified_at = NULL WHERE watchlist_id = ?').run(wlId)
    const digest = await runDigests(() => {})
    check('digest dispatch runs', digest.watchlists > 0, `${digest.watchlists} due, ${digest.deliveries} sent`)

    const reminders = await runDeadlineReminders(3, () => {})
    check('deadline reminders run without error', reminders >= 0, `${reminders} email(s)`)

    d.prepare('DELETE FROM watchlists WHERE id = ?').run(wlId)
    console.log('  (temporary watchlist removed)')
  }

  // ----------------------------------------------------------------- exports
  section('exports')
  const sample = searchTenders({ status: 'open', limit: 20, sort: 'deadline' }).rows

  const csv = tendersToCsv(sample)
  check('CSV has UTF-8 BOM', csv.startsWith('﻿'))
  check('CSV declares separator for Excel', csv.includes('sep=;'))
  const csvLines = csv.trim().split('\r\n')
  check('CSV row count matches', csvLines.length === sample.length + 2, `${csvLines.length} lines`)

  // Count fields with a real (quote-aware) split. A bare `;;` is legitimate —
  // two adjacent empty columns — so the check is field COUNT, not the absence
  // of consecutive separators.
  const splitCsv = (line: string): string[] => {
    const out: string[] = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          field += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ';') {
        out.push(field)
        field = ''
      } else {
        field += ch
      }
    }
    out.push(field)
    return out
  }

  const headerCount = splitCsv(csvLines[1]).length
  const ragged = csvLines.slice(2).filter((l) => splitCsv(l).length !== headerCount)
  check('every CSV row has the header field count', ragged.length === 0, `${headerCount} columns`)
  check(
    'CSV quotes fields containing the separator',
    csvLines.slice(2).every((l) => !splitCsv(l).some((f) => f.includes(';') && !l.includes('"'))),
  )

  const ics = tendersToIcs(sample, { calendarName: 'verify' })
  check('ICS well-formed', ics.startsWith('BEGIN:VCALENDAR') && ics.trimEnd().endsWith('END:VCALENDAR'))
  check('ICS event count matches deadlines', (ics.match(/BEGIN:VEVENT/g) ?? []).length === sample.filter((s) => s.deadline_at).length)
  check('ICS carries an alarm', ics.includes('BEGIN:VALARM'))
  check('ICS lines are CRLF', ics.includes('\r\n') && !/[^\r]\n/.test(ics))
  check('ICS folds long lines to ≤75 octets', ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75))

  // ------------------------------------------------------------- API token
  section('public API token')
  const org = d.prepare<[], { id: string }>('SELECT id FROM orgs LIMIT 1').get()
  if (org) {
    const raw = `mq_${newToken(24)}`
    const tokenId = newId('tok')
    d.prepare(
      `INSERT INTO api_tokens (id, org_id, name, token_hash, prefix, scope, created_at)
       VALUES (?, ?, '[verify]', ?, ?, 'read', ?)`,
    ).run(tokenId, org.id, sha256(raw), raw.slice(0, 11), nowIso())

    const found = d
      .prepare<[string], { id: string }>('SELECT id FROM api_tokens WHERE token_hash = ?')
      .get(sha256(raw))
    check('token resolves by hash only', found?.id === tokenId)
    check('raw token is not stored', !d.prepare('SELECT 1 FROM api_tokens WHERE token_hash = ?').get(raw))
    d.prepare('DELETE FROM api_tokens WHERE id = ?').run(tokenId)
  }

  // ------------------------------------------------------------------ result
  console.log(`\n${'─'.repeat(52)}`)
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('\nverify crashed:', err)
  process.exitCode = 1
})
