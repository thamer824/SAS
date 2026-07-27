/**
 * One-off discovery script: walk recent TUNEPS tender details and harvest every
 * code -> {fr, ar} label pair the API exposes. Output is committed as
 * src/lib/tuneps/reference.ts so the app never needs the API to render filters.
 *
 *   node scripts/probe-codes.mjs > src/lib/tuneps/reference.generated.json
 */
import https from 'node:https'
import zlib from 'node:zlib'

const BASE = 'https://www.tuneps.tn/api2/portail'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36'

function req(path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : undefined
    const r = https.request(
      {
        hostname: 'www.tuneps.tn',
        path: `/api2/portail/${path}`,
        method: body ? 'POST' : 'GET',
        rejectUnauthorized: false,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        const cs = []
        res.on('data', (c) => cs.push(c))
        res.on('end', () => {
          let buf = Buffer.concat(cs)
          if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf)
          try {
            resolve(JSON.parse(buf.toString('utf8')))
          } catch (e) {
            reject(new Error(`bad json from ${path}: ${buf.toString('utf8').slice(0, 200)}`))
          }
        })
      },
    )
    r.on('error', reject)
    r.setTimeout(40000, () => r.destroy(new Error('timeout')))
    if (payload) r.write(payload)
    r.end()
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dims = {
  gov: { codeKey: 'executionPlace', fr: 'executionPlaceStrFr', ar: 'executionPlaceStrAr' },
  domain: { codeKey: 'pbk', fr: 'pbkStrFr', ar: 'pbkStrAr' },
  category: { codeKey: 'bizKind', fr: 'bizKindStrFr', ar: 'bizKindStrAr' },
  procedure: { codeKey: 'procedureType', fr: 'procedureTypeStrFr', ar: 'procedureTypeStrAr' },
  priceType: { codeKey: 'priceType', fr: 'priceTypeStrFr', ar: 'priceTypeStrAr' },
  guarantee: { codeKey: 'guaranteeType', fr: 'guaranteeTypeStrFr', ar: 'guaranteeTypeStrAr' },
  financing: { codeKey: 'financialMethod', fr: 'financialMethodStrFr', ar: 'financialMethodStrAr' },
  evaluation: { codeKey: 'evalMethod', fr: 'evalMethodStrFr', ar: 'evalMethodStrAr' },
}

const out = {}
for (const k of Object.keys(dims)) out[k] = {}

// `pbk` itself is not returned as a code, only pbkStrId/pbkStrFr. Track by label.
const PAGES = Number(process.argv[2] ?? 6)
const PER_PAGE = 100
const ids = []

for (let p = 0; p < PAGES; p++) {
  const res = await req('bid/master/data', {
    pagination: { offSet: p * PER_PAGE, limit: PER_PAGE },
    sort: { nameCol: 'publicDt', direction: 'desc nulls last' },
    dataSearch: [{ key: 'publicYn', value: 'Y', specificSearch: '=' }],
    listSort: [],
    listCol: [],
  })
  for (const row of res.payload.data) ids.push(row.epBidMasterId)
  process.stderr.write(`list page ${p + 1}/${PAGES} -> ${ids.length} ids\n`)
  await sleep(250)
}

let done = 0
for (const id of ids) {
  const res = await req(`bid/master/${id}`)
  const p = res?.payload
  done++
  if (p) {
    for (const [dim, spec] of Object.entries(dims)) {
      const code = p[spec.codeKey]
      const fr = p[spec.fr]
      const ar = p[spec.ar]
      if (code !== undefined && code !== null && code !== '' && (fr || ar)) {
        out[dim][String(code)] = { fr: (fr ?? '').trim(), ar: (ar ?? '').trim() }
      }
    }
    // pbk has no plain code field; key it off pbkStrId
    if (p.pbkStrId && (p.pbkStrFr || p.pbkStrAr)) {
      out.domain[String(p.pbkStrId)] = { fr: (p.pbkStrFr ?? '').trim(), ar: (p.pbkStrAr ?? '').trim() }
    }
  }
  if (done % 25 === 0) {
    const counts = Object.entries(out)
      .map(([k, v]) => `${k}=${Object.keys(v).length}`)
      .join(' ')
    process.stderr.write(`detail ${done}/${ids.length}  ${counts}\n`)
  }
  await sleep(180)
}

process.stdout.write(JSON.stringify(out, null, 2))
