import https from 'node:https'
import zlib from 'node:zlib'
import { URL } from 'node:url'
import { config } from '@/lib/config'

/**
 * Minimal HTTPS+JSON client for the TUNEPS portal API.
 *
 * Why not `fetch`? Two upstream quirks make a hand-rolled client simpler:
 *  1. TUNEPS serves an INCOMPLETE certificate chain ("unable to verify the
 *     first certificate"), so we need per-request TLS control. The data is
 *     public and read-only, so relaxing verification is acceptable and
 *     explicitly opt-out-able via TUNEPS_TLS_STRICT=1.
 *  2. Some endpoints reply gzip-encoded regardless of Accept-Encoding, so we
 *     decompress explicitly.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export class TunepsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'TunepsError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  retries?: number
}

function decompress(buf: Buffer, encoding: string | undefined): Buffer {
  switch (encoding) {
    case 'gzip':
      return zlib.gunzipSync(buf)
    case 'deflate':
      return zlib.inflateSync(buf)
    case 'br':
      return zlib.brotliDecompressSync(buf)
    default:
      return buf
  }
}

function once(url: string, opts: RequestOptions): Promise<string> {
  const target = new URL(url)
  const payload = opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body))

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: opts.method ?? 'GET',
        rejectUnauthorized: config.tuneps.tlsStrict,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          let text: string
          try {
            text = decompress(Buffer.concat(chunks), res.headers['content-encoding']).toString('utf8')
          } catch (err) {
            reject(new TunepsError(`decompress failed: ${(err as Error).message}`))
            return
          }
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            reject(new TunepsError(`HTTP ${status} for ${target.pathname}`, status, text.slice(0, 400)))
            return
          }
          resolve(text)
        })
      },
    )

    req.setTimeout(opts.timeoutMs ?? 45_000, () => {
      req.destroy(new TunepsError(`timeout after ${opts.timeoutMs ?? 45_000}ms`))
    })
    req.on('error', (err) => reject(err))
    if (payload) req.write(payload)
    req.end()
  })
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Request with exponential backoff. Retries transient failures and 5xx only. */
export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const text = await once(url, opts)
      return JSON.parse(text) as T
    } catch (err) {
      lastErr = err
      const status = err instanceof TunepsError ? err.status : undefined
      const retryable = status === undefined || status >= 500 || status === 429
      if (!retryable || attempt === retries) break
      await sleep(Math.min(15_000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400))
    }
  }
  throw lastErr
}
