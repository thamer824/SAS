import { cx } from '@/components/ui/primitives'

/**
 * Server-rendered SVG charts. No chart library, no client JS.
 *
 * Specs held to deliberately (see the dataviz method):
 *  - Categorical hues are assigned in FIXED slot order (--color-viz-1..6) and
 *    never cycled; a 7th series folds into "Autres".
 *  - Bars cap at 24px with a 4px rounded data-end, square at the baseline.
 *  - Lines are 2px; area fills are the same hue at ~10%.
 *  - Touching marks are separated by a 2px gap in the surface colour, never a
 *    stroke.
 *  - Grid is hairline, solid, one step off surface.
 *  - Every chart carries VISIBLE DIRECT LABELS. That is not decoration: three
 *    light-mode slots sit below 3:1 contrast, and labels are the required
 *    relief channel.
 *  - Text always wears text tokens, never a series colour.
 *  - Interaction: <title> on each mark gives a native tooltip with no JS.
 */

const SURFACE = 'var(--surface-panel)'
const GRID = 'var(--border-subtle)'
const INK_MUTED = 'var(--text-muted)'
const INK_FAINT = 'var(--text-faint)'
const INK = 'var(--text-primary)'

export const VIZ_SLOTS = [
  'var(--color-viz-1)',
  'var(--color-viz-2)',
  'var(--color-viz-3)',
  'var(--color-viz-4)',
  'var(--color-viz-5)',
  'var(--color-viz-6)',
] as const

export function vizSlot(index: number): string {
  return VIZ_SLOTS[Math.min(index, VIZ_SLOTS.length - 1)]
}

/** Round a max up to a clean axis ceiling: 1/2/5 × 10^n. */
function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const pow = 10 ** exp
  const frac = value / pow
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * pow
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(n))
}

// ===========================================================================
// Area + line: one series over time
// ===========================================================================

export interface TimePoint {
  label: string
  value: number
  /** Long form used in the tooltip, e.g. "semaine du 12 mai". */
  title?: string
}

export function TimeSeriesChart({
  points,
  height = 168,
  valueSuffix = '',
  className,
}: {
  points: TimePoint[]
  height?: number
  valueSuffix?: string
  className?: string
}) {
  if (points.length < 2) {
    return <ChartEmpty height={height} />
  }

  // viewBox units; the SVG scales to its container width.
  const W = 720
  const H = height
  const padT = 16
  const padB = 26
  const padS = 40
  const padE = 12

  const plotW = W - padS - padE
  const plotH = H - padT - padB

  const max = niceCeil(Math.max(...points.map((p) => p.value), 1))
  const x = (i: number) => padS + (i / (points.length - 1)) * plotW
  const y = (v: number) => padT + plotH - (v / max) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${padT + plotH} L${padS},${padT + plotH} Z`

  const ticks = [0, max / 2, max]
  const peakIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0)

  // Label at most ~7 x-ticks so they never collide.
  const step = Math.max(1, Math.ceil(points.length / 7))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cx('block h-auto w-full', className)}
      role="img"
      preserveAspectRatio="none"
    >
      {ticks.map((tv) => (
        <g key={tv}>
          <line x1={padS} x2={W - padE} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth="1" />
          <text
            x={padS - 7}
            y={y(tv) + 3.5}
            textAnchor="end"
            fontSize="9.5"
            fill={INK_FAINT}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {compact(tv)}
          </text>
        </g>
      ))}

      <path d={area} fill={VIZ_SLOTS[0]} fillOpacity="0.1" />
      <path
        d={line}
        fill="none"
        stroke={VIZ_SLOTS[0]}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Invisible wide hit areas give the native tooltip a usable target. */}
      {points.map((p, i) => (
        <rect
          key={`${p.label}-${i}`}
          x={x(i) - plotW / (points.length - 1) / 2}
          y={padT}
          width={plotW / (points.length - 1)}
          height={plotH}
          fill="transparent"
        >
          <title>{`${p.title ?? p.label} — ${p.value}${valueSuffix}`}</title>
        </rect>
      ))}

      {/* Direct label on the peak only: sparing labels are what makes them work. */}
      <circle
        cx={x(peakIndex)}
        cy={y(points[peakIndex].value)}
        r="4"
        fill={VIZ_SLOTS[0]}
        stroke={SURFACE}
        strokeWidth="2"
      />
      <text
        x={Math.min(W - padE - 4, Math.max(padS + 14, x(peakIndex)))}
        y={Math.max(padT + 9, y(points[peakIndex].value) - 9)}
        textAnchor="middle"
        fontSize="10"
        fontWeight="650"
        fill={INK}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {compact(points[peakIndex].value)}
      </text>

      {points.map((p, i) =>
        i % step === 0 || i === points.length - 1 ? (
          <text key={`t-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill={INK_FAINT}>
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// ===========================================================================
// Horizontal bars: ranked magnitude (top buyers, governorates, sectors)
// ===========================================================================

export interface BarDatum {
  label: string
  value: number
  href?: string
  /** Optional secondary line under the label. */
  meta?: string
}

export function RankedBars({
  data,
  max: maxOverride,
  valueFormatter = (n) => n.toLocaleString('fr-FR'),
  labelWidth = 'w-[46%]',
}: {
  data: BarDatum[]
  max?: number
  valueFormatter?: (n: number) => string
  labelWidth?: string
}) {
  if (!data.length) return <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">—</p>

  const max = maxOverride ?? Math.max(...data.map((d) => d.value), 1)

  // HTML rather than SVG: text wrapping, RTL mirroring and links all come free,
  // and a ranked bar list needs no coordinate system.
  return (
    <ol className="divide-y divide-[var(--border-subtle)]">
      {data.map((d, i) => (
        <li key={`${d.label}-${i}`} className="flex items-center gap-3 px-4 py-2">
          <span className={cx('min-w-0 shrink-0', labelWidth)}>
            {d.href ? (
              <a
                href={d.href}
                className="clamp-1 block text-xs underline-offset-2 hover:text-[var(--accent)] hover:underline bidi-isolate"
                title={d.label}
              >
                {d.label}
              </a>
            ) : (
              <span className="clamp-1 block text-xs bidi-isolate" title={d.label}>
                {d.label}
              </span>
            )}
            {d.meta ? (
              <span className="mt-0.5 block truncate text-2xs text-[var(--text-faint)]">{d.meta}</span>
            ) : null}
          </span>

          <span className="relative h-2.5 min-w-0 flex-1" title={`${d.label}: ${valueFormatter(d.value)}`}>
            <span
              className="absolute inset-y-0 start-0 block rounded-e-[4px]"
              style={{
                width: `${Math.max(1.5, (d.value / max) * 100)}%`,
                background: VIZ_SLOTS[0],
              }}
            />
          </span>

          <span
            className="num w-14 shrink-0 text-end text-xs font-semibold tabular-nums"
            style={{ color: INK }}
          >
            {valueFormatter(d.value)}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ===========================================================================
// Composition: part-to-whole across ≤ 6 categories
// ===========================================================================

export interface Slice {
  label: string
  value: number
  slot: number
}

/**
 * A single stacked bar plus a labelled legend. Chosen over a donut because the
 * shares here are often close, and a bar plus numbers compares close values
 * honestly where arcs do not.
 */
export function CompositionBar({
  slices,
  total,
  valueFormatter = (n) => n.toLocaleString('fr-FR'),
}: {
  slices: Slice[]
  total?: number
  valueFormatter?: (n: number) => string
}) {
  const sum = total ?? slices.reduce((a, s) => a + s.value, 0)
  if (!sum) return <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">—</p>

  return (
    <div className="px-4 py-3.5">
      {/* 2px surface-coloured gaps do the separating — no strokes on the marks. */}
      <div className="flex h-3 w-full overflow-hidden rounded-[4px]" style={{ gap: '2px' }}>
        {slices.map((s, i) => (
          <span
            key={`${s.label}-${i}`}
            className="block h-full first:rounded-s-[4px] last:rounded-e-[4px]"
            style={{
              width: `${(s.value / sum) * 100}%`,
              background: vizSlot(s.slot),
            }}
            title={`${s.label}: ${valueFormatter(s.value)} (${Math.round((s.value / sum) * 100)}%)`}
          />
        ))}
      </div>

      <ul className="mt-3.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {slices.map((s, i) => (
          <li key={`l-${s.label}-${i}`} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ background: vizSlot(s.slot) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate bidi-isolate" title={s.label}>
              {s.label}
            </span>
            <span className="num shrink-0 font-semibold tabular-nums">{valueFormatter(s.value)}</span>
            <span className="num w-9 shrink-0 text-end text-2xs text-[var(--text-muted)]">
              {Math.round((s.value / sum) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ===========================================================================
// Columns: distribution (lead-time histogram, day-of-week cadence)
// ===========================================================================

export interface Column {
  label: string
  value: number
  /** Highlight one column (e.g. the median bucket) without a second hue. */
  emphasis?: boolean
  title?: string
}

export function ColumnChart({
  columns,
  height = 132,
  valueFormatter = (n) => String(n),
}: {
  columns: Column[]
  height?: number
  valueFormatter?: (n: number) => string
}) {
  if (!columns.length) return <ChartEmpty height={height} />

  const max = Math.max(...columns.map((c) => c.value), 1)

  return (
    <div className="px-4 pb-1 pt-3">
      {/* `items-stretch` (not items-end) is load-bearing: each column must fill
          the track's height, otherwise the bar's percentage height resolves
          against an auto-height parent and collapses to zero. */}
      <div className="flex items-stretch gap-[2px]" style={{ height }}>
        {columns.map((c, i) => {
          const pct = (c.value / max) * 100
          return (
            <div
              key={`${c.label}-${i}`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {/* Value on the cap — the direct label the palette relief needs. */}
              <span className="num mb-1 shrink-0 text-2xs font-semibold tabular-nums text-[var(--text-secondary)]">
                {c.value > 0 ? valueFormatter(c.value) : ''}
              </span>
              <span
                className="block w-full max-w-6 rounded-t-[4px] transition-opacity hover:opacity-80"
                style={{
                  height: `${Math.max(pct, c.value > 0 ? 2 : 0)}%`,
                  background: c.emphasis ? VIZ_SLOTS[1] : VIZ_SLOTS[0],
                  opacity: c.emphasis ? 1 : 0.9,
                }}
                title={`${c.title ?? c.label}: ${valueFormatter(c.value)}`}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-[var(--border-subtle)] pt-1.5">
        {columns.map((c, i) => (
          <span
            key={`x-${c.label}-${i}`}
            /* Bucket labels mix digits with "≤", "–" and ">", which the RTL
               algorithm reorders into nonsense ("≤ 7 j" → "j 7 ≥"). Force LTR
               and isolate so they read correctly in Arabic too. */
            dir="ltr"
            className="min-w-0 flex-1 truncate text-center text-2xs text-[var(--text-faint)] bidi-isolate"
            title={c.label}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ===========================================================================
// Sparkline: 12-point trend inside a stat tile
// ===========================================================================

export function Sparkline({
  values,
  width = 96,
  height = 24,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - ((v - min) / span) * (height - 3) - 1.5

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className="block">
      <path d={d} fill="none" stroke={VIZ_SLOTS[0]} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.25" fill={VIZ_SLOTS[0]} />
    </svg>
  )
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="grid place-items-center text-2xs text-[var(--text-faint)]"
      style={{ height }}
      role="img"
      aria-label="Aucune donnée"
    >
      —
    </div>
  )
}

/** Escape hatch for tabular relief: the numbers behind any chart above. */
export function ChartTable({
  caption,
  rows,
  headers,
}: {
  caption: string
  rows: Array<[string, string]>
  headers: [string, string]
}) {
  return (
    <details className="border-t border-[var(--border-subtle)] px-4 py-2">
      <summary className="cursor-pointer text-2xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        {caption}
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr>
            <th scope="col" className="label-xs pb-1 text-start">
              {headers[0]}
            </th>
            <th scope="col" className="label-xs pb-1 text-end">
              {headers[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-[var(--border-subtle)]">
              <td className="py-1 pe-2 bidi-isolate">{k}</td>
              <td className="num py-1 text-end tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
