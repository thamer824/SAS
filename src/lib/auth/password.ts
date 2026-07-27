import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>

/**
 * Password hashing with scrypt from node:crypto.
 *
 * Deliberately not argon2/bcrypt: both are native addons that need a compiler
 * on the deploy host. scrypt is memory-hard, in-core, and these parameters
 * (N=2^15, r=8, p=1 → ~32 MB, ~100 ms) are the OWASP-recommended floor.
 *
 * Stored format: scrypt$N$r$p$saltB64$hashB64 — self-describing, so parameters
 * can be raised later without breaking existing hashes.
 */
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32
const SALT_BYTES = 16
const MAXMEM = 96 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts
  const n = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')

  try {
    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    })
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Constant-time compare for tokens (sessions, API keys, feed tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}
