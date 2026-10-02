import { useState } from 'react'
import { cn } from '../lib/utils'

/**
 * Minimal, dependency-free SVG charts that follow the app theme and RTL.
 * Bars = primary series; optional line = secondary series (e.g. profit).
 */
export function BarLineChart({
  data,
  height = 200,
  format,
  labelFormat
}: {
  data: Array<{ label: string; bar: number; line?: number | null }>
  height?: number
  format: (v: number) => string
  labelFormat?: (label: string) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  // Bidi marks from Arabic date formatting scramble short labels in this LTR chart.
  const label = (l: string) => (labelFormat ? labelFormat(l) : l).replace(/[\u200e\u200f\u061c]/g, '')
  const max = Math.max(1, ...data.map((d) => Math.max(d.bar, d.line ?? 0)))
  const w = 100 / Math.max(data.length, 1)
  const bw = Math.min(w * 0.64, 7)
  const y = (v: number) => height - 24 - (Math.max(v, 0) / max) * (height - 40)
  const linePts = data.map((d, i) => (d.line === null || d.line === undefined ? null : `${(i + 0.5) * w},${y(d.line)}`)).filter(Boolean)
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => (
          <rect
            key={i}
            x={(i + 0.5) * w - bw / 2}
            width={bw}
            y={y(d.bar)}
            height={Math.max(0, height - 24 - y(d.bar))}
            rx="0.8"
            className={cn('transition-opacity', hover !== null && hover !== i ? 'opacity-50' : 'opacity-100')}
            fill="var(--primary)"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {linePts.length > 1 ? <polyline points={linePts.join(' ')} fill="none" stroke="var(--success)" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-subtle" style={{ visibility: data.length > 16 && i % 2 ? 'hidden' : 'visible' }}>
            {label(d.label)}
          </span>
        ))}
      </div>
      {hover !== null && data[hover] ? (
        <div className="pointer-events-none absolute top-1 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow" style={{ left: `${Math.min(80, hover * w)}%` }}>
          <p className="font-semibold">{label(data[hover].label)}</p>
          <p className="tabular">{format(data[hover].bar)}</p>
          {data[hover].line !== null && data[hover].line !== undefined ? <p className="tabular text-emerald-300">{format(data[hover].line!)}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Horizontal share bars (top products, payment methods…). */
export function ShareBars({ rows, format }: { rows: Array<{ label: string; value: number; hint?: string }>; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 flex justify-between gap-2 text-[13px]">
            <span className="truncate font-semibold">{r.label}</span>
            <span className="shrink-0 tabular text-muted">
              {format(r.value)}
              {r.hint ? ` · ${r.hint}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
