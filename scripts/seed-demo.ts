import './_env'
import { ensureDb, nowIso } from '@/db'
import { newId, newToken, slugify } from '@/lib/ids'
import { hashPassword } from '@/lib/auth/password'
import { getWatchlist } from '@/lib/match/engine'
import { backfillWatchlist } from '@/lib/match/run'
import { addToPipeline, setStage } from '@/lib/queries/pipeline'
import { searchTenders } from '@/lib/queries/tenders'

/**
 * Create a demo account with realistic watchlists and a populated pipeline, so
 * the app can be evaluated without hand-clicking through onboarding.
 *
 *   npm run seed:demo
 *   → demo@mounaqasat.tn / demo1234
 */

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@mounaqasat.tn'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234'

async function main() {
  const d = ensureDb()
  const ts = nowIso()

  const existing = d.prepare<[string], { id: string }>('SELECT id FROM users WHERE email = ?').get(EMAIL)
  if (existing) {
    console.log(`demo user already exists (${EMAIL}) — removing and recreating`)
    d.prepare('DELETE FROM users WHERE id = ?').run(existing.id)
  }

  const userId = newId('usr')
  const orgId = newId('org')
  const companyName = 'STEG Travaux & Génie Civil'

  let slug = slugify(companyName)
  let n = 1
  while (d.prepare('SELECT id FROM orgs WHERE slug = ?').get(slug)) slug = `${slugify(companyName)}-${++n}`

  const passwordHash = await hashPassword(PASSWORD)

  d.transaction(() => {
    d.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, locale, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'fr', ?, ?)`,
    ).run(userId, EMAIL, passwordHash, 'Yassine Ben Salah', ts, ts)

    d.prepare(
      `INSERT INTO orgs (id, name, slug, tax_id, gov_code, capabilities, domain_codes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      orgId,
      companyName,
      slug,
      '1234567/A/M/000',
      '01', // Tunis
      JSON.stringify(['génie civil', 'électricité', 'étanchéité', 'VRD', 'كهرباء']),
      JSON.stringify(['2392', '2391']), // Travaux + Fournitures
      ts,
    )

    d.prepare(
      `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`,
    ).run(orgId, userId, ts)
  })()

  console.log(`created user ${EMAIL} / ${PASSWORD}`)

  // --- watchlists ----------------------------------------------------------
  const watchlists = [
    {
      name: 'Génie civil — Grand Tunis',
      cadence: 'instant',
      channels: ['inapp', 'email'],
      criteria: {
        keywords: ['génie civil', 'construction', 'batiment', 'travaux', 'réhabilitation'],
        excludeKeywords: ['étude'],
        domainCodes: ['2392'],
        govCodes: ['01', '02', '03', '24'],
        openOnly: true,
        minScore: 35,
      },
    },
    {
      name: 'Électricité & équipements',
      cadence: 'daily',
      channels: ['inapp', 'email'],
      criteria: {
        keywords: ['electricite', 'électrique', 'كهرباء', 'transformateur', 'éclairage'],
        openOnly: true,
        minScore: 30,
      },
    },
    {
      name: 'Informatique — toutes régions',
      cadence: 'weekly',
      channels: ['inapp'],
      criteria: {
        keywords: ['informatique', 'logiciel', 'serveur', 'réseau', 'ordinateur'],
        openOnly: true,
        minScore: 30,
      },
    },
  ]

  for (const w of watchlists) {
    const id = newId('wl')
    d.transaction(() => {
      d.prepare(
        `INSERT INTO watchlists
           (id, org_id, created_by, name, criteria, cadence, channels, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, orgId, userId, w.name, JSON.stringify(w.criteria), w.cadence, JSON.stringify(w.channels), ts, ts)

      d.prepare(
        `INSERT INTO feed_tokens (token, kind, org_id, ref_id, created_at)
         VALUES (?, 'ics-watchlist', ?, ?, ?)`,
      ).run(newToken(18), orgId, id, ts)
    })()

    const record = getWatchlist(id)
    if (record) {
      const matches = backfillWatchlist(record, 400)
      console.log(`watchlist "${w.name}": ${matches.length} match(es)`)
    }
  }

  // --- pipeline ------------------------------------------------------------
  // Seed from genuinely open notices so the board shows live countdowns.
  const open = searchTenders({ status: 'open', sort: 'deadline', limit: 9 }).rows
  const stages = [
    'watching',
    'watching',
    'qualifying',
    'qualifying',
    'preparing',
    'preparing',
    'submitted',
    'won',
    'lost',
  ] as const

  open.forEach((tender, i) => {
    const itemId = addToPipeline(orgId, userId, tender.id)
    const stage = stages[i] ?? 'watching'
    if (stage !== 'watching') setStage(orgId, userId, itemId, stage)

    // Plausible values so the pipeline-value figure is not zero.
    const value = [48_000, 132_000, 76_500, 220_000, 95_000, 310_000, 180_000, 145_000, 88_000][i]
    d.prepare('UPDATE pipeline_items SET expected_value = ?, notes = ? WHERE id = ?').run(
      value,
      i % 3 === 0 ? 'Cautionnement à demander à la banque. Vérifier la capacité technique exigée.' : '',
      itemId,
    )
  })

  console.log(`pipeline seeded with ${open.length} item(s)`)

  const counts = d
    .prepare<[string, string, string], { w: number; m: number; p: number }>(
      `SELECT
         (SELECT COUNT(*) FROM watchlists WHERE org_id = ?) AS w,
         (SELECT COUNT(*) FROM watchlist_matches m JOIN watchlists w2 ON w2.id = m.watchlist_id
            WHERE w2.org_id = ?) AS m,
         (SELECT COUNT(*) FROM pipeline_items WHERE org_id = ?) AS p`,
    )
    .get(orgId, orgId, orgId)!

  console.log(`\ndone — ${counts.w} watchlists, ${counts.m} matches, ${counts.p} pipeline items`)
  console.log(`sign in at /signin with ${EMAIL} / ${PASSWORD}`)
}

main().catch((err) => {
  console.error('seed failed:', err)
  process.exitCode = 1
})
