# Mounaqasat — مناقصات

**Veille et intelligence des marchés publics tunisiens.**

TUNEPS publishes hundreds of public-procurement notices a week, split across two
separate lists, with no search worth the name, no alerts, and no way to track
what you are working on. Mounaqasat mirrors that data into one feed, matches it
against what your company actually does, and pushes it to you within minutes of
publication.

It is an independent service built on public data. Every notice links back to its
original page on `tuneps.tn`; nothing is altered.

---

## The product decision that shapes everything

The customer is an SME owner — a contractor, a supplier, an IT reseller. Not a
procurement analyst. They want one question answered in ten seconds: **"is there
anything for me this week?"**

So the whole surface is built around one journey:

```
sign up → pick your sectors (one screen) → offers in boxes, filtered to you
                                         → an e-mail when a new one appears
```

Everything else — the bid pipeline, market analytics, the buyer directory, CSV,
the API — still exists, but it is **one click off the main path** rather than in
it. Five nav items, not eight. "Alerte", not "veille". Cards, not tables.

`npm run verify:flow` asserts that journey end to end in a real browser: a fresh
account reaches a pre-filtered feed of boxes with a working alert, in 15 steps,
with no dead ends.

---

## What it does

| | |
|---|---|
| **Pick your sector, done** | One screen, tiles grouped by nature, each showing how many notices are open in it right now. That count is the pitch: "Génie Civil · 183" proves the product works before anyone commits. |
| **One feed, two sources** | Appels d'offres *and* consultations in a single list with a single filter set. On TUNEPS these are two unrelated screens. |
| **Offers as boxes** | Each card answers what / who / how long. The remaining-days figure is the loudest thing on it, because it is the only number that makes someone act today. |
| **Alerts that understand the market** | Keywords in French *or* Arabic, insensitive to accents and diacritics, plus buyer / sector / governorate / lead-time criteria and a relevance score to keep the noise out. |
| **Alerts** | Instant, daily digest or weekly digest — over in-app, e-mail, browser push and Telegram. |
| **Deadline intelligence** | Countdowns, a closing-soon view, and a per-watchlist **ICS feed** you subscribe to in Outlook or Google Calendar so deadlines arrive by themselves. |
| **Bid pipeline** | À étudier → Go/No-Go → En préparation → Soumis → Remporté/Perdu, with an owner, internal notes, an expected value and a Tunisian document checklist (attestation fiscale, CNSS, RNE, cautionnement…). |
| **Market intelligence** | Publication volume, sector and geographic mix, most active buyers, weekday cadence and — most usefully — the **lead time buyers actually grant** between publication and deadline. |
| **Buyer directory** | All 1 697 public institutions with their publication history, rhythm, favourite categories and median lead time. |
| **Change detection** | When a buyer moves a deadline or re-issues a notice, the revision is recorded and shown, rather than silently overwritten. |
| **Company fit score** | A Go/No-Go heuristic on every notice, from the capabilities declared in your org profile — useful before you have built a single watchlist. |
| **Integrations** | Read-only JSON API with bearer tokens, CSV export tuned for Excel on a French/Arabic Windows locale, ICS feeds, Telegram. |
| **Bilingual** | Complete French and Arabic UI with proper RTL, plus light and dark themes. |

---

## Quick start

```bash
npm install
cp .env.example .env.local        # then set APP_SECRET
npm run db:migrate

npm run sync -- --backfill --max=14000 --details=500   # ~8 min, pulls real data
npm run seed:demo                                      # demo account + watchlists

npm run dev                        # http://localhost:3000
```

Sign in with **demo@mounaqasat.tn / demo1234**, or create your own account.

Then, in a second terminal, run the backend loop:

```bash
npm run worker
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:migrate` | Apply `src/db/migrations/*.sql` (idempotent) |
| `npm run sync` | One incremental ingest pass + instant matching |
| `npm run sync -- --backfill --max=N` | Walk history (see flags in `scripts/sync.ts`) |
| `npm run worker` | Long-running loop: ingest, enrich, digests, reminders |
| `npm run seed:demo` | Demo org, 3 watchlists, populated pipeline |
| `npm run verify` | 49 assertions over folding, dates, matching, delivery, exports |
| `npm run verify:http` | 35 assertions over every endpoint, auth, CSV, ICS |
| `npm run verify:flow` | 15 assertions over the signup → sectors → feed journey |
| `npm run shots` | Drive real Chrome, screenshot every page in FR/AR × light/dark × mobile |
| `npm run api:token` | Mint a read API token from the CLI |

> **Do not run `next build` while `next dev` is running** — they share `.next` and
> the dev server will start throwing `MODULE_NOT_FOUND`. Stop dev first.

---

## The data source

TUNEPS is an Angular SPA backed by a **public, unauthenticated JSON API** under
`https://www.tuneps.tn/api2/portail`. The endpoints and payload shapes here were
recovered from the production bundle (`main.js`: `AppeloffreService`,
`ConsultationService`, `src/app/domain/search/*`) — there is no published spec.

| Endpoint | Method | Rows | Content |
|---|---|---|---|
| `bid/master/data` | POST | ~58 600 published | Appels d'offres list |
| `bid/master/{id}` | GET | 108 fields | Full tender detail |
| `spShopMaster/data` | POST | ~241 500 published | Consultations list |
| `umInst/data` | POST | 1 697 | Buyer directory (FR + AR names) |

Request body — note the field names are `offSet` / `nameCol`, not what you'd guess:

```json
{
  "pagination": { "offSet": 0, "limit": 500 },
  "sort": { "nameCol": "publicDt", "direction": "desc nulls last" },
  "dataSearch": [{ "key": "publicYn", "value": "Y", "specificSearch": "=" }],
  "listSort": [], "listCol": []
}
```

`specificSearch` supports `=`, `>=`, `<=`, `like`, `!=`, which is what makes clean
incremental polling possible (`publicDt >= cursor`) instead of HTML scraping.

### Four things that will bite you

1. **`offSet` is a PAGE INDEX, not a row offset.** The server computes
   `LIMIT limit OFFSET offSet * limit`. With `limit=500`, `offSet=117` returns the
   last 124 of 58 624 rows and `offSet=118` returns none. Treating it as a row
   offset silently caps ingestion at the newest `limit` notices — `offSet=500`
   lands past the end of the table and yields `[]` with no error.
2. **TLS chain is incomplete.** `unable to verify the first certificate`. Hence
   the hand-rolled HTTPS client and `TUNEPS_TLS_STRICT=0`. The data is public and
   read-only.
3. **Timestamps are Africa/Tunis wall-clock with no zone.** Tunisia is UTC+1
   year-round (no DST since 2009), so a fixed offset is correct, not an
   approximation. See `src/lib/tuneps/dates.ts`.
4. **`umInst/data` ignores `limit`** and returns the whole directory every call.

### One thing that is not documented anywhere

The **leading digit of a `bizKind` sector code encodes the procurement nature**:

```
1xx → Fourniture de biens    (pbk 2391)
3xx → Travaux                (pbk 2392)
5xx → Fourniture de services (pbk 2393)
7xx → Etudes                 (pbk 2394)
```

This matters because the consultations stream exposes `bizKind` but **not** `pbk`.
Without the inference the two sources could not share one "nature" filter — and a
unified filter is the entire point of the product. See
`domainFromCategory()` in `src/lib/tuneps/reference.ts`.

Code→label tables (25 governorates, 53 sectors, procedures, financing sources…)
were harvested from 600 live detail payloads by `scripts/probe-codes.mjs` and are
committed as `src/lib/tuneps/reference.data.ts`, so filter menus render instantly
and the app stays usable when TUNEPS is down.

---

## Architecture

```
Next.js 15 (App Router, React 19, server components)
  ├── src/lib/tuneps/     source adapter: http · client · map · ingest · reference
  ├── src/lib/queries/    one shared query builder (feed = matcher = API = export)
  ├── src/lib/match/      relevance scoring, watchlist evaluation, dispatch
  ├── src/lib/notify/     email · web push · telegram · in-app + templates
  ├── src/lib/export/     CSV (Excel-safe) · ICS (RFC 5545)
  └── SQLite + FTS5 via better-sqlite3
```

**Server-first, deliberately.** Filters are `<a>` tags that patch the query
string, not client state — so every view is shareable, bookmarkable,
back-button-safe, and works without JavaScript. The result is that the feed page
ships **176 bytes** of route JS. The only client components are the ones that
genuinely need browser APIs: theme toggle, locale menu, notification popover,
push opt-in, and two forms.

### Design decisions worth knowing

**Canonical tender table.** Both TUNEPS streams normalise into one `tenders`
table. That is the product: one feed, one filter set, one alert engine.

**Search is folded at write time.** `search_blob` holds accent- and
diacritic-stripped FR+AR+EN text, with Arabic orthographic variants unified
(أإآ→ا, ى→ي, ة→ه). Queries are folded the same way, so "electricite" matches
«Électricité» and "كهرباء" matches «كَهْرَبَاء». SQLite's tokenizers cannot fold
Arabic, so this happens in JS (`src/lib/text/normalize.ts`).

**Two-stage matching.** SQL narrows on hard criteria (indexed, so a watchlist over
300k rows is one query); JS then scores what survives, because scoring needs
per-keyword weighting and human-readable "why did this match" reasons. A
watchlist with keywords requires at least one hit — otherwise a sector-wide alert
would drown the user.

**Alerts de-duplicate.** A notice is alerted once. Re-ingesting or enriching it
does not re-alert, which is the difference between a channel a supplier keeps and
one they mute in a week. `npm run verify` asserts this.

**Timestamps: `SQL_NOW`, never `datetime('now')`.** Columns store ISO-8601
(`2026-08-13T09:00:00.000Z`); `datetime('now')` returns `2026-07-25 11:30:00`.
Comparing them is a *string* comparison and `'T'` > `' '`, so any same-day
deadline looks like it is still in the future. This reported 14 already-closed
tenders as open before it was fixed. Use the helpers in `src/db/sql.ts`.

**Chart colours are validated, not chosen.** The categorical slots in
`globals.css` pass OKLCH lightness-band, chroma-floor, protanopia/deuteranopia ΔE,
normal-vision ΔE and contrast checks against this app's own surfaces (`#ffffff`
light, `#12151a` dark). Three light-mode slots sit below 3:1, so every chart
ships **visible direct labels** as the required relief channel — do not remove
them. Re-validate before changing any value.

**Accent foreground is a separate token.** `--accent` inverts between themes (dark
red → bright pink), so `--accent-fg` carries the text colour that sits on it:
white in light mode (5.33:1), ink in dark (6.44:1). White on the dark accent
would be 2.84:1.

**No offline service worker.** `public/sw.js` handles push only. A cached tender
list on an alerting product is actively harmful — a supplier could act on a
deadline that has already moved. Freshness beats offline here.

---

## Configuration

Everything has a working default except `APP_SECRET`. See `.env.example`.

| Variable | Notes |
|---|---|
| `APP_SECRET` | **Set this.** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | Used in e-mails, ICS feeds and push payloads. Must match the real origin or calendar subscriptions will point at the wrong host. |
| `DATABASE_PATH` | Default `./data/mounaqasat.db` |
| `TUNEPS_TLS_STRICT` | `0` by default — see TLS note above |
| `TUNEPS_REQUEST_DELAY_MS` | Pacing between upstream calls. Please stay polite: TUNEPS is a public service. |
| `SMTP_*` | Leave `SMTP_HOST` empty and e-mails are written as `.eml` files to `data/outbox/` — the whole alert path stays testable with no SMTP account. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Users paste their chat id in Settings. |

`GET /api/health` reports counts, channel configuration and ingestion freshness;
it returns **503** when no successful sync has completed in 3 hours, so an uptime
monitor can alarm on a silently dead cron.

---

## Public API

```bash
curl -H "Authorization: Bearer mq_…" \
  "$APP_URL/api/v1/tenders?status=open&domain=2392&gov=01&limit=25"
```

Same filter vocabulary as the web feed — anything findable in the UI is fetchable
by an ERP without a second mental model. Create tokens in **Settings → Accès API**;
only a SHA-256 hash is stored.

---

## Operations

Either run the worker (one process, one SQLite writer, no lock contention):

```bash
npm run worker
```

…or schedule the idempotent CLI:

```cron
*/10 * * * *  cd /srv/mounaqasat && npm run sync
0    3 * * *  cd /srv/mounaqasat && npm run sync -- --buyers --details=800
```

Worker cadence: ingest 10 min · details 60 min · buyers 6 h · digests 30 min ·
deadline reminders hourly (fires only in the 06:00–09:00 Tunis window).

### Scaling past SQLite

SQLite is right for one writer and a few hundred concurrent readers, which covers
a long way. The migration path is deliberately short: all SQL lives in
`src/lib/queries/*` and `src/lib/tuneps/ingest.ts`, uses no SQLite-specific
features beyond FTS5 and `strftime`, and would move to Postgres by swapping
`src/db/index.ts` and replacing the FTS5 virtual table with `tsvector` +
`unaccent` (keeping the JS Arabic folding, which Postgres also lacks).

---

## Legal

Mounaqasat aggregates public data published by the Tunisian state. It is an
independent service, **not affiliated with TUNEPS or the HAICOP**. Notice content
is never modified — every record links to its source page. The ingestion layer is
rate-limited and identifies itself; please keep it that way.
# SAS
