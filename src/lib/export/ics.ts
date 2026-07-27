import { config } from '@/lib/config'
import type { TenderRow } from '@/lib/queries/tenders'
import { tunepsSourceUrl } from '@/lib/tuneps/map'

/**
 * RFC 5545 calendar feed.
 *
 * The point: a supplier subscribes once in Outlook or Google Calendar and every
 * future deadline appears automatically, with a reminder. Nobody has to
 * remember to check a website.
 */

/**
 * RFC 5545 line folding.
 *
 * The 75-octet limit is measured in OCTETS, not characters — which matters a
 * great deal here: Arabic titles are 2 bytes per character in UTF-8 and French
 * accents are 2 bytes, so a naive 74-*character* split produces lines up to
 * ~150 bytes and some calendar clients truncate or reject them.
 *
 * Splitting is also done on code POINTS, never code units, so a surrogate pair
 * (an emoji in a buyer's title) is never cut in half.
 */
function fold(line: string): string {
  const LIMIT = 75
  if (Buffer.byteLength(line, 'utf8') <= LIMIT) return line

  const out: string[] = []
  let current = ''
  let currentBytes = 0
  // First line has no leading space; continuations spend 1 octet on it.
  let budget = LIMIT

  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8')
    if (currentBytes + size > budget) {
      out.push(current)
      current = char
      currentBytes = size
      budget = LIMIT - 1
    } else {
      current += char
      currentBytes += size
    }
  }
  if (current) out.push(current)

  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n')
}

function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(iso: string): string {
  return `${new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
}

export interface IcsOptions {
  calendarName: string
  /** Minutes before the deadline to fire an alarm. */
  reminderMinutes?: number
}

export function tendersToIcs(rows: TenderRow[], opts: IcsOptions): string {
  const now = stamp(new Date().toISOString())
  const reminder = opts.reminderMinutes ?? 48 * 60

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mounaqasat//Veille marches publics TN//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(opts.calendarName)}`),
    'X-WR-TIMEZONE:Africa/Tunis',
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ]

  for (const t of rows) {
    if (!t.deadline_at) continue
    const start = stamp(t.deadline_at)
    // 30-minute block: the deadline is an instant, but calendars need duration.
    const end = stamp(new Date(Date.parse(t.deadline_at) + 30 * 60_000).toISOString())

    const title = t.title_fr || t.title_ar || t.reference
    const label = t.source === 'ao' ? 'AO' : 'CONS'

    const description = [
      `${t.buyer_name}`,
      '',
      `Référence : ${t.reference}${t.mod_seq !== '00' ? ` (rév. ${t.mod_seq})` : ''}`,
      t.category_label_fr ? `Secteur : ${t.category_label_fr}` : '',
      t.gov_label_fr ? `Gouvernorat : ${t.gov_label_fr}` : '',
      t.bid_open_at ? `Ouverture des plis : ${t.bid_open_at.slice(0, 16).replace('T', ' ')} UTC` : '',
      '',
      `Fiche : ${config.appUrl}/app/tenders/${t.id}`,
      `Source TUNEPS : ${tunepsSourceUrl(t)}`,
    ]
      .filter(Boolean)
      .join('\n')

    lines.push(
      'BEGIN:VEVENT',
      // Stable UID including mod_seq: a re-issued notice updates the existing
      // event instead of duplicating it.
      fold(`UID:${t.id}-${t.mod_seq}@mounaqasat`),
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      fold(`SUMMARY:[${label}] ${esc(title.slice(0, 180))}`),
      fold(`DESCRIPTION:${esc(description)}`),
      fold(`URL:${config.appUrl}/app/tenders/${t.id}`),
      t.gov_label_fr ? fold(`LOCATION:${esc(t.gov_label_fr)}`) : '',
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${esc(`Échéance : ${title.slice(0, 120)}`)}`),
      `TRIGGER:-PT${reminder}M`,
      'END:VALARM',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return `${lines.filter(Boolean).join('\r\n')}\r\n`
}
