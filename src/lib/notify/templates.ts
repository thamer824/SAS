import { config } from '@/lib/config'
import { formatDate, pickLang, translator, type Locale } from '@/lib/i18n'
import { daysUntil } from '@/lib/tuneps/dates'
import type { TenderRow } from '@/lib/queries/tenders'

/**
 * Email bodies.
 *
 * Table layout and fully inlined styles: Outlook (which most Tunisian public
 * buyers and their suppliers use) still ignores <style> blocks, flexbox and
 * most modern CSS. Every alert also renders RTL when the recipient reads Arabic.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const C = {
  ink: '#12151a',
  body: '#4c545f',
  faint: '#6a7482',
  line: '#dde2ea',
  bg: '#f7f8fa',
  panel: '#ffffff',
  brand: '#ce2342',
  soon: '#b45309',
  live: '#0b7d53',
}

interface ShellOptions {
  locale: Locale
  title: string
  preheader: string
  bodyHtml: string
  footerNote?: string
}

function shell({ locale, title, preheader, bodyHtml, footerNote }: ShellOptions): string {
  const rtl = locale === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const align = rtl ? 'right' : 'left'
  const t = translator(locale)

  return `<!doctype html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:${C.panel};border:1px solid ${C.line};border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Arial,sans-serif;">
      <tr>
        <td dir="${dir}" align="${align}" style="padding:20px 24px;border-bottom:1px solid ${C.line};">
          <span style="font-size:15px;font-weight:700;color:${C.ink};letter-spacing:-0.2px;">${esc(t('app.name'))}</span>
          <span style="color:${C.line};padding:0 8px;">|</span>
          <span style="font-size:12px;color:${C.faint};">${esc(t('app.tagline'))}</span>
        </td>
      </tr>
      <tr><td dir="${dir}" align="${align}" style="padding:24px;">${bodyHtml}</td></tr>
      <tr>
        <td dir="${dir}" align="${align}" style="padding:16px 24px;border-top:1px solid ${C.line};background:${C.bg};">
          <p style="margin:0 0 6px;font-size:11px;line-height:1.6;color:${C.faint};">
            ${footerNote ? esc(footerNote) + '<br>' : ''}${esc(t('landing.footer.rights'))}
          </p>
          <p style="margin:0;font-size:11px;">
            <a href="${config.appUrl}/app/settings" style="color:${C.faint};text-decoration:underline;">${esc(t('nav.settings'))}</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function tenderRowHtml(tender: TenderRow, locale: Locale, score?: number): string {
  const t = translator(locale)
  const rtl = locale === 'ar'
  const align = rtl ? 'right' : 'left'
  const title = pickLang(locale, tender.title_fr, tender.title_ar, tender.title_en)
  const left = daysUntil(tender.deadline_at)

  const deadlineColor = left === null ? C.faint : left <= 3 ? C.soon : C.live
  const deadlineText =
    left === null
      ? '—'
      : left < 0
        ? t('deadline.passed')
        : `${formatDate(tender.deadline_at, locale)} · ${t('deadline.inDays', { n: left })}`

  const chips = [
    tender.source === 'ao' ? t('source.ao') : t('source.consultation'),
    pickLang(locale, tender.category_label_fr, tender.category_label_ar),
    pickLang(locale, tender.gov_label_fr, tender.gov_label_ar),
  ].filter(Boolean)

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid ${C.line};border-radius:10px;">
  <tr><td dir="${rtl ? 'rtl' : 'ltr'}" align="${align}" style="padding:14px 16px;">
    <a href="${config.appUrl}/app/tenders/${encodeURIComponent(tender.id)}"
       style="font-size:14px;font-weight:600;color:${C.ink};text-decoration:none;line-height:1.45;">${esc(title)}</a>
    ${score !== undefined ? `<span style="display:inline-block;margin:0 6px;padding:1px 7px;border-radius:20px;background:#fff1f3;color:${C.brand};font-size:11px;font-weight:700;">${score}</span>` : ''}
    <p style="margin:7px 0 0;font-size:12px;color:${C.body};">${esc(tender.buyer_name || '—')}</p>
    <p style="margin:6px 0 0;font-size:11px;color:${C.faint};">${chips.map(esc).join(' · ')}</p>
    <p style="margin:8px 0 0;font-size:12px;color:${deadlineColor};font-weight:600;">
      ${esc(t('tender.deadline'))} : ${esc(deadlineText)}
    </p>
    <p style="margin:6px 0 0;font-size:11px;color:${C.faint};font-family:ui-monospace,Consolas,monospace;">${esc(tender.reference)}</p>
  </td></tr>
</table>`
}

function button(label: string, href: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;">
  <tr><td style="border-radius:8px;background:${C.brand};">
    <a href="${href}" style="display:inline-block;padding:11px 20px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`
}

// --- alert emails ----------------------------------------------------------

export interface MatchEmailInput {
  locale: Locale
  watchlistName: string
  watchlistId: string
  matches: Array<{ tender: TenderRow; score: number }>
  /** 'instant' | 'daily' | 'weekly' — changes the framing, not the layout. */
  cadence: string
}

export function matchEmail(input: MatchEmailInput): { subject: string; html: string; text: string } {
  const t = translator(input.locale)
  const n = input.matches.length
  const plural = n > 1

  const subject =
    input.cadence === 'instant'
      ? plural
        ? `${n} nouveaux avis — ${input.watchlistName}`
        : `Nouvel avis — ${input.watchlistName}`
      : `${input.watchlistName} — ${n} avis`

  const heading = t(plural ? 'notif.newMatchPlural.title' : 'notif.newMatch.title', {
    count: n,
    watchlist: input.watchlistName,
  })

  const shown = input.matches.slice(0, 12)
  const overflow = n - shown.length

  const bodyHtml = `
<h1 style="margin:0 0 6px;font-size:19px;line-height:1.35;color:${C.ink};font-weight:650;">${esc(heading)}</h1>
<p style="margin:0 0 18px;font-size:13px;color:${C.body};">${esc(t('watchlist.subtitle'))}</p>
${shown.map((m) => tenderRowHtml(m.tender, input.locale, m.score)).join('')}
${overflow > 0 ? `<p style="margin:10px 0 0;font-size:12px;color:${C.faint};">+ ${overflow} ${esc(t('common.results'))}</p>` : ''}
${button(t('nav.feed'), `${config.appUrl}/app/watchlists/${input.watchlistId}`)}`

  const text = [
    heading,
    '',
    ...shown.map((m) => {
      const title = pickLang(input.locale, m.tender.title_fr, m.tender.title_ar)
      const left = daysUntil(m.tender.deadline_at)
      return `- ${title}\n  ${m.tender.buyer_name}\n  ${t('tender.deadline')}: ${formatDate(m.tender.deadline_at, input.locale)}${
        left !== null && left >= 0 ? ` (${t('deadline.inDays', { n: left })})` : ''
      }\n  ${config.appUrl}/app/tenders/${m.tender.id}`
    }),
    overflow > 0 ? `\n+ ${overflow}` : '',
    '',
    `${config.appUrl}/app/watchlists/${input.watchlistId}`,
  ].join('\n')

  return {
    subject,
    html: shell({
      locale: input.locale,
      title: subject,
      preheader: `${n} ${t('common.results')} — ${input.watchlistName}`,
      bodyHtml,
      footerNote: `${t('watchlist.title')}: ${input.watchlistName}`,
    }),
    text,
  }
}

export interface DeadlineEmailInput {
  locale: Locale
  items: Array<{ tender: TenderRow; days: number }>
}

export function deadlineEmail(input: DeadlineEmailInput): { subject: string; html: string; text: string } {
  const t = translator(input.locale)
  const n = input.items.length
  const subject =
    input.locale === 'ar' ? `${n} موعد نهائي يقترب` : `${n} échéance${n > 1 ? 's' : ''} imminente${n > 1 ? 's' : ''}`

  const bodyHtml = `
<h1 style="margin:0 0 6px;font-size:19px;line-height:1.35;color:${C.ink};font-weight:650;">${esc(t('dash.closingSoon'))}</h1>
<p style="margin:0 0 18px;font-size:13px;color:${C.body};">${esc(t('pipeline.subtitle'))}</p>
${input.items.map((i) => tenderRowHtml(i.tender, input.locale)).join('')}
${button(t('nav.pipeline'), `${config.appUrl}/app/pipeline`)}`

  const text = input.items
    .map(
      (i) =>
        `- ${pickLang(input.locale, i.tender.title_fr, i.tender.title_ar)} — ${t('deadline.inDays', { n: i.days })}\n  ${config.appUrl}/app/tenders/${i.tender.id}`,
    )
    .join('\n')

  return {
    subject,
    html: shell({ locale: input.locale, title: subject, preheader: subject, bodyHtml }),
    text,
  }
}

// --- telegram --------------------------------------------------------------

/** Telegram HTML is a tiny subset: b, i, a, code. Keep it flat and scannable. */
export function matchTelegram(input: MatchEmailInput): string {
  const t = translator(input.locale)
  const n = input.matches.length
  const head = `<b>${esc(input.watchlistName)}</b> — ${n} ${esc(t('common.results'))}`

  const lines = input.matches.slice(0, 8).map((m) => {
    const title = pickLang(input.locale, m.tender.title_fr, m.tender.title_ar)
    const left = daysUntil(m.tender.deadline_at)
    const when = left === null ? '' : left < 0 ? t('deadline.passed') : t('deadline.inDays', { n: left })
    return [
      `\n<b>${esc(title.slice(0, 140))}</b>`,
      `${esc(m.tender.buyer_name)}`,
      `⏳ ${esc(when)} · <code>${esc(m.tender.reference)}</code>`,
      `<a href="${config.appUrl}/app/tenders/${encodeURIComponent(m.tender.id)}">${esc(t('common.more'))}</a>`,
    ].join('\n')
  })

  const overflow = n - Math.min(n, 8)
  return [head, ...lines, overflow > 0 ? `\n+ ${overflow}` : ''].join('\n')
}
