/**
 * Drive the real app in Chrome, sign in, and screenshot every page.
 * Dev-only verification helper — not part of the app.
 *
 *   node scripts/screenshot.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3100'
const OUT = process.argv[3] ?? '_probe/shots'
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@mounaqasat.tn'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234'

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))

if (!CHROME) {
  console.error('Chrome not found')
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
})

context.on('weberror', (e) => errors.push(`weberror: ${e.error().message}`))

const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
page.on('response', (r) => {
  if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`)
})

async function shot(name, url, opts = {}) {
  const target = url.startsWith('http') ? url : `${BASE}${url}`
  const before = errors.length
  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })
  } catch (err) {
    errors.push(`goto ${url}: ${err.message.slice(0, 160)}`)
  }
  await page.waitForTimeout(opts.wait ?? 500)
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? true })
  const status = errors.length > before ? `  ⚠ ${errors.length - before} error(s)` : ''
  console.log(`${name.padEnd(26)} ${target}${status}`)
  return file
}

// --- public -----------------------------------------------------------------
await shot('01-landing', '/')
await shot('02-signin', '/signin')

// --- sign in ----------------------------------------------------------------
await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PASSWORD)
await Promise.all([
  page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 45_000 }).catch(() => {}),
  page.click('button[type="submit"]'),
])
await page.waitForTimeout(1200)
console.log(`signed in → ${page.url()}`)

// --- app --------------------------------------------------------------------
await shot('03-feed', '/app')
await shot('04-feed-mine', '/app?mine=1')
await shot('05-feed-search', '/app?q=electricite&sort=relevance')
await shot('06-feed-urgent', '/app?status=closing')
await shot('07-feed-advanced', '/app?adv=1&domain=2392&gov=01')
await shot('07b-feed-table', '/app?view=table')
await shot('08-watchlists', '/app/watchlists')
await shot('08b-onboarding', '/bienvenue?again=1')
await shot('09-pipeline', '/app/pipeline')
await shot('10-insights', '/app/insights', { wait: 900 })
await shot('11-insights-year', '/app/insights?window=365', { wait: 900 })
await shot('12-buyers', '/app/buyers')
await shot('13-notifications', '/app/notifications')
await shot('14-settings', '/app/settings')
await shot('15-watchlist-new', '/app/watchlists/new')

// --- deep links discovered from the DOM -------------------------------------
await page.goto(`${BASE}/app/watchlists`, { waitUntil: 'networkidle' })
const wlHref = await page.locator('a[href^="/app/watchlists/wl_"]').first().getAttribute('href')
if (wlHref) {
  await shot('16-watchlist-detail', wlHref)
  await shot('17-watchlist-edit', `${wlHref}?tab=edit`)
}

await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
const tHref = await page.locator('a[href^="/app/tenders/"]').first().getAttribute('href')
if (tHref) await shot('18-tender-detail', tHref)

await page.goto(`${BASE}/app/buyers`, { waitUntil: 'networkidle' })
const bHref = await page.locator('a[href^="/app/buyers/"]').first().getAttribute('href')
if (bHref) await shot('19-buyer-detail', bHref, { wait: 800 })

await page.goto(`${BASE}/app/pipeline`, { waitUntil: 'networkidle' })
const pHref = await page.locator('a[href^="/app/pipeline/pl_"]').first().getAttribute('href')
if (pHref) await shot('20-pipeline-item', pHref)

// --- dark mode --------------------------------------------------------------
await context.addCookies([{ name: 'mq_theme', value: 'dark', url: BASE }])
await shot('21-dark-dashboard', '/app')
await shot('22-dark-feed', '/app')
await shot('23-dark-insights', '/app/insights', { wait: 900 })
if (tHref) await shot('24-dark-tender', tHref)

// --- Arabic / RTL -----------------------------------------------------------
await context.addCookies([
  { name: 'mq_theme', value: 'light', url: BASE },
  { name: 'mq_locale', value: 'ar', url: BASE },
])
await shot('25-ar-dashboard', '/app')
await shot('26-ar-feed', '/app')
await shot('27-ar-insights', '/app/insights', { wait: 900 })
if (tHref) await shot('28-ar-tender', tHref)
await shot('29-ar-landing-signin', '/signin')

// --- mobile -----------------------------------------------------------------
await context.addCookies([{ name: 'mq_locale', value: 'fr', url: BASE }])
await page.setViewportSize({ width: 390, height: 844 })
await shot('30-mobile-feed', '/app')
await shot('31-mobile-onboarding', '/bienvenue?again=1')
await shot('32-mobile-landing', '/')

await browser.close()

console.log(`\n${errors.length} error(s) captured`)
for (const e of [...new Set(errors)].slice(0, 30)) console.log(`  - ${e}`)
