import { NextResponse, type NextRequest } from 'next/server'
import { ensureDb, nowIso } from '@/db'
import { sha256 } from '@/lib/ids'
import { parseFeedParams } from '@/lib/queries/params'
import { searchTenders } from '@/lib/queries/tenders'
import { tunepsSourceUrl } from '@/lib/tuneps/map'

export const dynamic = 'force-dynamic'

/**
 * Public read API — `Authorization: Bearer mq_…`.
 *
 * Same filter vocabulary as the web feed, so anything findable in the UI is
 * fetchable by an ERP without a second mental model. Read-only by design: this
 * is a mirror of public data, and there is nothing here a token should mutate.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
  if (!match) {
    return NextResponse.json(
      { error: 'missing_token', hint: 'Authorization: Bearer <token>' },
      { status: 401 },
    )
  }

  const d = ensureDb()
  const token = d
    .prepare<[string], { id: string; org_id: string }>(
      'SELECT id, org_id FROM api_tokens WHERE token_hash = ?',
    )
    .get(sha256(match[1].trim()))

  if (!token) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  d.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(nowIso(), token.id)

  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const parsed = parseFeedParams(params)

  const limit = Math.min(Math.max(Number.parseInt(String(params.limit ?? '25'), 10) || 25, 1), 200)
  const { rows, total } = searchTenders({ ...parsed.filters, limit })

  return NextResponse.json(
    {
      total,
      count: rows.length,
      page: parsed.page,
      filters: {
        q: parsed.raw.q ?? null,
        status: parsed.raw.status,
        sources: parsed.raw.sources,
        domains: parsed.raw.domains,
        categories: parsed.raw.categories,
        governorates: parsed.raw.govs,
        buyers: parsed.raw.buyers,
      },
      data: rows.map((t) => ({
        id: t.id,
        source: t.source,
        reference: t.reference,
        revision: t.mod_seq,
        buyerReference: t.buyer_ref,
        title: { fr: t.title_fr, ar: t.title_ar, en: t.title_en },
        buyer: { code: t.buyer_code, name: t.buyer_name },
        classification: {
          domain: { code: t.domain_code, fr: t.domain_label_fr, ar: t.domain_label_ar },
          category: { code: t.category_code, fr: t.category_label_fr, ar: t.category_label_ar },
          procedure: { code: t.procedure_code, fr: t.procedure_label_fr, ar: t.procedure_label_ar },
          governorate: { code: t.gov_code, fr: t.gov_label_fr, ar: t.gov_label_ar },
        },
        flags: {
          online: Boolean(t.is_online),
          international: Boolean(t.is_international),
          framework: Boolean(t.is_framework),
          consortium: Boolean(t.allows_consortium),
        },
        documents: { price: t.doc_price, currency: t.doc_currency },
        dates: {
          published: t.published_at,
          receiptStart: t.receipt_start_at,
          deadline: t.deadline_at,
          bidOpening: t.bid_open_at,
        },
        validityDays: t.validity_days,
        links: {
          app: `/app/tenders/${t.id}`,
          source: tunepsSourceUrl(t),
        },
      })),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
