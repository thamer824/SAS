import crypto from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Short, URL-safe, sortable-ish id: base36 timestamp + randomness. */
export function newId(prefix = ''): string {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(8)
  let tail = ''
  for (const byte of rand) tail += ALPHABET[byte % ALPHABET.length]
  return prefix ? `${prefix}_${ts}${tail}` : `${ts}${tail}`
}

/** Cryptographically strong opaque token for cookies, feeds and API keys. */
export function newToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'org'
  )
}
