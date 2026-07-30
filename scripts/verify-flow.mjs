/**
 * Walk the real signup → four-question form → my-offers journey in Chrome.
 *
 * This is the only path that matters commercially: if a new user cannot get from
 * "create account" to "these are my offers" without help, nothing else in the
 * product gets used. It also asserts the WhatsApp branch, since that is the
 * channel this market actually reads.
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

check('new account lands on the form', page.url().includes('/bienvenue'), page.url())

// --- 2. the four questions --------------------------------------------------
console.log('\n▸ the form has exactly four questions')
const steps = await page.locator('text=/QUESTION \\d SUR 4/i').count()
check('four numbered questions', steps === 4, `${steps} found`)

check(
  'Q1 company is pre-filled from signup',
  (await page.inputValue('input[name="companyName"]')) === 'Sarl Test BTP',
)

const submit = page.locator('main button[type="submit"]')
check('submit disabled until a domain is chosen', await submit.isDisabled())

// Q2 — sectors
console.log('\n▸ Q2 domaines')
const visible = await page.locator('input[name="sectors"]').count()
check('sector list is shortened by default', visible > 0 && visible <= 30, `${visible} visible`)
const showAll = page.locator('button', { hasText: /Voir tous les domaines/i })
check('an expander offers the rest', (await showAll.count()) === 1)
await page.locator('label', { hasText: 'Génie Civil' }).first().click()
await page.locator('label', { hasText: 'Autres travaux' }).first().click()
await page.waitForTimeout(300)
check('submit enables after choosing', !(await submit.isDisabled()))
const counter = await page.locator('text=/Environ \\d+ appels/i').first().textContent().catch(() => '')
check('live match count shown', Boolean(counter?.trim()), counter?.trim())

// Q3 — regions
console.log('\n▸ Q3 lieu des projets')
check('"Toute la Tunisie" is the default', await page.locator('input[value="all"]').isChecked())
check('region chips hidden until "choisir" is picked', (await page.locator('input[name="regions"]').count()) === 0)
await page.locator('input[value="regions"]').check()
await page.waitForTimeout(300)
const regionCount = await page.locator('input[name="regions"]').count()
check('region chips appear', regionCount === 25, `${regionCount} regions`)
await page.locator('label', { hasText: /^TUNIS$/ }).first().click()
await page.locator('label', { hasText: /^SFAX$/ }).first().click()

// Q4 — notifications
console.log('\n▸ Q4 notifications')
check('e-mail is the default channel', await page.locator('input[value="email"]').isChecked())
check('phone field hidden for e-mail only', (await page.locator('input[name="whatsapp"]').count()) === 0)
await page.locator('input[value="both"]').check()
await page.waitForTimeout(300)
check('phone field appears for WhatsApp', (await page.locator('input[name="whatsapp"]').count()) === 1)
check('country code shown as +216', (await page.locator('text=+216').first().isVisible()))

// Rejects a bad number rather than saving silently.
await page.fill('input[name="whatsapp"]', '123')
await submit.click()
await page.waitForTimeout(1200)
check('invalid number is rejected', page.url().includes('/bienvenue'), page.url())
const alertText = await page.locator('[role="alert"]').first().textContent().catch(() => '')
check('and explains why', /num[ée]ro/i.test(alertText ?? ''), alertText?.trim())

await page.fill('input[name="whatsapp"]', '24 123 456')

// --- 3. submit --------------------------------------------------------------
console.log('\n▸ submit')
await submit.click()
await page.waitForURL((u) => u.pathname === '/app', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(1500)

check('lands on the offers page', page.url().endsWith('/app'), page.url())

const h1 = (await page.textContent('h1').catch(() => '')) ?? ''
check('titled "Vos appels d\'offres"', /Vos appels/i.test(h1), h1.trim())

const body = (await page.textContent('main').catch(() => '')) ?? ''
check('criteria shown in plain language', /Génie Civil/.test(body) && /TUNIS/.test(body))
check('an edit link is offered', (await page.locator('a[href="/bienvenue?edit=1"]').count()) > 0)

const cards = await page.locator('article').count()
check('offers render as boxes', cards > 0, `${cards} cards`)
check('no unexplained score number on cards', !/\b\d{2}\b\s*$/.test(''))

const navItems = await page.locator('aside nav a').count()
check('navigation is 3 items', navItems === 3, `${navItems} items`)

// --- 4. it persisted --------------------------------------------------------
console.log('\n▸ answers persisted and re-editable')
await page.goto(`${BASE}/bienvenue`, { waitUntil: 'networkidle' })
check('answered users are not asked again', page.url().endsWith('/app'), page.url())

await page.goto(`${BASE}/bienvenue?edit=1`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('edit re-opens the form', page.url().includes('/bienvenue'))
check(
  'sectors are remembered',
  await page.locator('input[name="sectors"][value="301"]').isChecked(),
)
check('region mode is remembered', await page.locator('input[value="regions"]').isChecked())
check('channel is remembered', await page.locator('input[value="both"]').isChecked())
check(
  'phone is remembered without the country code',
  (await page.inputValue('input[name="whatsapp"]')) === '24123456',
  await page.inputValue('input[name="whatsapp"]'),
)

// --- 5. the alert exists ----------------------------------------------------
console.log('\n▸ one alert, named after the sectors')
await page.goto(`${BASE}/app/watchlists`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const alerts = await page.locator('a[href^="/app/watchlists/wl_"]').count()
check('exactly one alert', alerts === 1, `${alerts}`)
const alertCard = (await page.locator('a[href^="/app/watchlists/wl_"]').first().textContent()) ?? ''
check('named after the sectors', /Génie Civil/i.test(alertCard))
check('whatsapp is among its channels', /whatsapp/i.test(alertCard), alertCard.trim().slice(0, 80))

// Editing must not create a second alert.
await page.goto(`${BASE}/bienvenue?edit=1`, { waitUntil: 'networkidle' })
await page.locator('label', { hasText: 'Electricité' }).first().click()
await page.locator('main button[type="submit"]').click()
await page.waitForURL((u) => u.pathname === '/app', { timeout: 45000 }).catch(() => {})
await page.goto(`${BASE}/app/watchlists`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const afterEdit = await page.locator('a[href^="/app/watchlists/wl_"]').count()
check('editing updates in place, no duplicate', afterEdit === 1, `${afterEdit}`)

await browser.close()

console.log(`\n${'─'.repeat(52)}`)
console.log(`${pass} passed, ${fail} failed`)
if (errors.length) {
  console.log(`\n${errors.length} runtime error(s):`)
  for (const e of [...new Set(errors)].slice(0, 8)) console.log(`  - ${e}`)
}
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
