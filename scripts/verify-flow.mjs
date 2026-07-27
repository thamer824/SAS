/**
 * Walk the real signup → sector-picker → feed journey in Chrome.
 *
 * This is the only path that matters commercially: if a new user cannot get
 * from "create account" to "these offers are mine" without help, nothing else
 * in the product gets used.
 */
import { chromium } from 'playwright-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.argv[2] ?? 'http://localhost:3100'
const EMAIL = `flow-${Date.now()}@test.tn`

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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
page.on('response', (r) => {
  if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`)
})

// --- 1. sign up -------------------------------------------------------------
console.log('\n▸ signup')
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
await page.fill('input[name="fullName"]', 'Test Contractor')
await page.fill('input[name="companyName"]', 'Sarl Test BTP')
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', 'testpass1234')
await page.click('form button[type="submit"]')
await page.waitForURL((u) => !u.pathname.includes('/signup'), { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(1200)

check('new account lands on the sector picker', page.url().includes('/bienvenue'), page.url())
check('picker has a heading', Boolean(await page.textContent('h1').catch(() => null)))

// --- 2. the picker ----------------------------------------------------------
console.log('\n▸ sector picker')
const tiles = await page.locator('input[name="sectors"]').count()
check('sector tiles rendered', tiles > 10, `${tiles} tiles`)

// Scope to <main>: the "Plus tard" skip in the header is a submit button too.
const submit = page.locator('main button[type="submit"]')
check('submit is disabled before any choice', await submit.isDisabled())

// Pick the two construction sectors a BTP company would.
for (const name of ['Génie Civil', 'Autres travaux']) {
  await page.locator('label', { hasText: name }).first().click()
}
await page.waitForTimeout(300)
check('submit enables after choosing', !(await submit.isDisabled()))

const counter = await page.locator('text=/≈/').first().textContent().catch(() => '')
check('live match count shown', Boolean(counter?.trim()), counter?.trim())

check(
  'daily digest is preselected',
  await page.locator('input[name="cadence"][value="daily"]').isChecked(),
)

// --- 3. activate ------------------------------------------------------------
console.log('\n▸ activation')
await submit.click()
await page.waitForURL((u) => u.pathname === '/app', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(1500)

check('lands on the offers feed', page.url().includes('/app'), page.url())
check('feed is pre-filtered to the picked sectors', page.url().includes('mine=1'), page.url())

const cards = await page.locator('article').count()
check('offers render as boxes', cards > 0, `${cards} cards`)

const navItems = await page.locator('aside nav a').count()
check('navigation is 5 items', navItems === 5, `${navItems} items`)

// --- 4. the alert actually exists ------------------------------------------
console.log('\n▸ the alert was created')
await page.goto(`${BASE}/app/watchlists`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const alertCards = await page.locator('a[href^="/app/watchlists/wl_"]').count()
check('one alert exists', alertCards === 1, `${alertCards} alert(s)`)

const alertText = await page.locator('a[href^="/app/watchlists/wl_"]').first().textContent()
check('alert is named after the sectors', /Génie Civil/i.test(alertText ?? ''), alertText?.trim().slice(0, 60))
check('alert already has matches', /[1-9]/.test(alertText ?? ''))

// --- 5. skip path -----------------------------------------------------------
console.log('\n▸ returning user goes straight to the feed')
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
check('no forced onboarding on return', !page.url().includes('/bienvenue'), page.url())

await browser.close()

console.log(`\n${'─'.repeat(52)}`)
console.log(`${pass} passed, ${fail} failed`)
if (errors.length) {
  console.log(`\n${errors.length} runtime error(s):`)
  for (const e of [...new Set(errors)].slice(0, 8)) console.log(`  - ${e}`)
}
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
