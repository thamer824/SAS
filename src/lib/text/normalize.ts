/**
 * Text folding for search.
 *
 * TUNEPS titles arrive in French, Arabic and (nominally) English, often mixed
 * inside one field, hand-typed by hundreds of different public buyers. Searching
 * it raw is hopeless: "Électricité" / "electricite" / "ELECTRICITE" are three
 * different strings, and Arabic arrives with and without diacritics, with
 * أ/إ/آ/ا used interchangeably.
 *
 * So we fold once at ingest time into `tenders.search_blob`, fold the query the
 * same way, and let FTS5 match folded-against-folded.
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

/** Fold Arabic orthographic variants that Tunisian buyers use interchangeably. */
function foldArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[آأإاٱ]/g, 'ا') // آأإٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي') // ئ -> ي
}

/** Strip Latin accents via NFD + combining-mark removal. */
function foldLatin(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Canonical fold: lowercase, accent-free, Arabic-normalised, single-spaced.
 * Punctuation becomes whitespace so "lot n°3/2026" tokenises usefully.
 */
export function fold(input: string | null | undefined): string {
  if (!input) return ''
  let s = String(input)
  s = foldLatin(s)
  s = foldArabic(s)
  s = s.toLowerCase()
  // Keep letters (any script), digits and spaces; everything else separates.
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ')
  return s.trim().replace(/\s+/g, ' ')
}

/** Build the searchable blob for a tender from all its language variants. */
export function buildSearchBlob(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    for (const token of fold(part).split(' ')) {
      if (token.length < 2) continue
      if (seen.has(token)) continue
      seen.add(token)
      out.push(token)
    }
  }
  return out.join(' ')
}

/**
 * Turn free user input into an FTS5 MATCH expression.
 *
 * Rules chosen for this audience:
 *  - `"quoted phrase"` stays a phrase
 *  - bare words are ANDed and get a trailing `*` so "info" hits "informatique"
 *  - a leading `-` excludes
 *  - anything FTS5 would choke on is stripped, never passed through
 */
export function toFtsQuery(raw: string): string | null {
  if (!raw?.trim()) return null

  const clauses: string[] = []
  const phraseRe = /"([^"]+)"/g
  let rest = raw
  let m: RegExpExecArray | null

  while ((m = phraseRe.exec(raw)) !== null) {
    const phrase = fold(m[1])
    if (phrase) clauses.push(`"${phrase}"`)
  }
  rest = raw.replace(phraseRe, ' ')

  for (const rawTerm of rest.split(/\s+/)) {
    if (!rawTerm) continue
    const negated = rawTerm.startsWith('-')
    const term = fold(negated ? rawTerm.slice(1) : rawTerm)
    if (term.length < 2) continue
    // A folded term can contain spaces (e.g. "n°3" -> "n 3"); treat as phrase.
    const atom = term.includes(' ') ? `"${term}"` : `${term}*`
    clauses.push(negated ? `NOT ${atom}` : atom)
  }

  if (!clauses.length) return null

  // FTS5 wants `a AND b NOT c`, so stitch NOT clauses on without an AND.
  return clauses
    .reduce<string[]>((acc, c) => {
      if (!acc.length) return [c.startsWith('NOT ') ? `${c.slice(4)}` : c]
      acc.push(c.startsWith('NOT ') ? c : `AND ${c}`)
      return acc
    }, [])
    .join(' ')
}

/** Split a comma/newline separated keyword field into folded keywords. */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\n;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .slice(0, 60)
}

/** Does folded `haystack` contain folded `needle` as a word-ish substring? */
export function foldedIncludes(haystack: string, needle: string): boolean {
  const n = fold(needle)
  if (!n) return false
  return haystack.includes(n)
}
