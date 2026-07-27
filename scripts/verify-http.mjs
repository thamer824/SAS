/**
 * Exercise the authenticated HTTP endpoints through a real browser session.
 * Server Actions use Next's own POST protocol, so curl cannot sign in — but the
 * browser can, and its cookie jar then works for plain fetches.
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.argv[2] ?? 'http://localhost:3100'

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext()
const page = await context.newPage()

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' })
await page.fill('input[name="email"]', 'demo@mounaqasat.tn')
await page.fill('input[name="password"]', 'demo1234')
await page.click('button[type="submit"]')
await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 45000 })

console.log('\n▸ session')
const cookies = await context.cookies()
check('session cookie set', cookies.some((c) => c.name === 'mq_session'))
check(
  'session cookie is httpOnly + sameSite lax',
  cookies.some((c) => c.name === 'mq_session' && c.httpOnly && c.sameSite === 'Lax'),
)

// `page.request` reuses the context's cookies.
const api = page.request

console.log('\n▸ CSV export')
{
  const res = await api.get(`${BASE}/api/export/tenders?status=open&domain=2392`)
  const body = await res.text()
  check('200 OK', res.status() === 200, `HTTP ${res.status()}`)
  check('content-type is CSV', (res.headers()['content-type'] ?? '').includes('text/csv'))
  check('sends attachment filename', (res.headers()['content-disposition'] ?? '').includes('.csv'))
  check('starts with BOM + sep hint', body.startsWith('\uFEFFsep=;'))
  const lines = body.trim().split('\r\n')
  check('has data rows', lines.length > 2, `${lines.length - 2} row(s)`)
  check('header is French', lines[1].includes('Référence') && lines[1].includes('Date limite'))
  fs.writeFileSync('_probe/http-export.csv', body)
}

console.log('\n▸ single-tender ICS')
{
  const res = await api.get(`${BASE}/api/ics/tender/${encodeURIComponent('ao:132955')}`)
  const body = await res.text()
  check('200 OK', res.status() === 200, `HTTP ${res.status()}`)
  check('content-type is calendar', (res.headers()['content-type'] ?? '').includes('text/calendar'))
  check('one VEVENT', (body.match(/BEGIN:VEVENT/g) ?? []).length === 1)
  check('has VALARM', body.includes('BEGIN:VALARM'))
  check('links back to TUNEPS', body.includes('tuneps.tn'))
  check('all lines ≤ 75 octets', body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75))
  fs.writeFileSync('_probe/http-tender.ics', body)
}

console.log('\n▸ watchlist ICS feed (token auth, no cookie)')
{
  // Find a feed token via the watchlist page, then fetch it from a CLEAN context
  // to prove the token alone authorises it.
  await page.goto(`${BASE}/app/watchlists`, { waitUntil: 'networkidle' })
  const wl = await page.locator('a[href^="/app/watchlists/wl_"]').first().getAttribute('href')
  await page.goto(`${BASE}${wl}`, { waitUntil: 'networkidle' })
  // Read the live `.value` property rather than matching the attribute: React
  // keeps controlled inputs' values as properties after hydration, so an
  // `input[value*=…]` attribute selector is unreliable.
  await page.waitForTimeout(400)
  const shown = await page.$$eval('input', (els) => {
    const hit = els.map((e) => e.value).find((v) => v && v.includes('/api/ics/watchlist/'))
    return hit ?? ''
  })
  check('ICS URL exposed on watchlist page', Boolean(shown), shown)
  if (!shown) throw new Error('no ICS feed URL rendered')

  // The page prints the URL from APP_URL (as it must, for a real calendar
  // client); rebase it onto the port this test is actually driving.
  const icsUrl = `${BASE}${new URL(shown).pathname}`

  const anon = await browser.newContext()
  const anonPage = await anon.newPage()
  const res = await anonPage.request.get(icsUrl)
  const body = await res.text()
  check('200 OK without cookies', res.status() === 200, `HTTP ${res.status()}`)
  check('is a calendar', body.startsWith('BEGIN:VCALENDAR'))
  const events = (body.match(/BEGIN:VEVENT/g) ?? []).length
  check('contains upcoming deadlines', events > 0, `${events} event(s)`)
  check('names the watchlist', body.includes('X-WR-CALNAME:'))
  check('advertises a refresh interval', body.includes('REFRESH-INTERVAL'))

  const bad = await anonPage.request.get(`${BASE}/api/ics/watchlist/not-a-real-token`)
  check('unknown token → 404', bad.status() === 404, `HTTP ${bad.status()}`)
  await anon.close()
  fs.writeFileSync('_probe/http-watchlist.ics', body)
}

console.log('\n▸ unauthenticated access')
{
  const anon = await browser.newContext()
  const anonPage = await anon.newPage()
  for (const [path, expected] of [
    ['/api/export/tenders', 401],
    [`/api/ics/tender/${encodeURIComponent('ao:132955')}`, 401],
    ['/api/v1/tenders', 401],
    ['/api/push/subscribe', 405],
  ]) {
    const res = await anonPage.request.get(`${BASE}${path}`)
    check(`${path} → ${expected}`, res.status() === expected, `HTTP ${res.status()}`)
  }
  const app = await anonPage.goto(`${BASE}/app/tenders`, { waitUntil: 'networkidle' })
  check('/app redirects to /signin when anonymous', anonPage.url().includes('/signin'), anonPage.url())
  await anon.close()
}

console.log('\n▸ health + PWA assets')
{
  const res = await api.get(`${BASE}/api/health`)
  const j = await res.json()
  check('health responds', res.status() === 200 || res.status() === 503, `HTTP ${res.status()}`)
  check('reports counts', j.counts?.tenders > 0, `${j.counts?.tenders} tenders`)
  check('reports channel config', typeof j.channels?.email === 'string', j.channels?.email)

  for (const [path, type] of [
    ['/manifest.webmanifest', 'json'],
    ['/sw.js', 'javascript'],
    ['/icon.svg', 'svg'],
    ['/robots.txt', 'text'],
    ['/sitemap.xml', 'xml'],
  ]) {
    const r = await api.get(`${BASE}${path}`)
    check(`${path} served`, r.status() === 200, `HTTP ${r.status()} ${r.headers()['content-type'] ?? ''}`)
  }
}

console.log('\n▸ notifications API')
{
  const res = await api.post(`${BASE}/api/notifications/read-all`)
  const j = await res.json().catch(() => ({}))
  check('mark-all-read works', res.status() === 200 && j.ok === true, `HTTP ${res.status()}`)
}

await browser.close()

console.log(`\n${'─'.repeat(52)}`)
console.log(`${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
