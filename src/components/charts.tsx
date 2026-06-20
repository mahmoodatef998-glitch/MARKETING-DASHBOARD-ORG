'use client'

// ─── Shared SVG chart components used by both Dashboard and Reports ────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function DonutChart({
  segments,
  size = 148,
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const innerR = r * 0.58

  if (total === 0) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center">
        <p className="text-xs text-slate-500">No data yet</p>
      </div>
    )
  }

  const paths = segments
    .filter((s) => s.value > 0)
    .reduce<{ list: { color: string; d: string }[]; angle: number }>(
      (acc, seg) => {
        const angle = (seg.value / total) * 360
        const startA = acc.angle
        const endA = acc.angle + angle
        const s = polarToCartesian(cx, cy, r, startA)
        const e = polarToCartesian(cx, cy, r, endA)
        const si = polarToCartesian(cx, cy, innerR, startA)
        const ei = polarToCartesian(cx, cy, innerR, endA)
        const large = angle > 180 ? 1 : 0
        return {
          angle: endA,
          list: [...acc.list, {
            color: seg.color,
            d: `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${innerR} ${innerR} 0 ${large} 0 ${si.x} ${si.y} Z`,
          }],
        }
      },
      { list: [], angle: 0 }
    ).list

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="#0f172a" strokeWidth={2} />
      ))}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#e2e8f0" fontSize={size * 0.13} fontWeight={700}>
        {total}
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fill="#64748b" fontSize={size * 0.065} letterSpacing={1}>
        TOTAL
      </text>
    </svg>
  )
}

export function BarChartSVG({ data, currency = true }: { data: { label: string; value: number }[], currency?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = 38
  const gap = 16
  const H = 150
  const W = data.length * (barW + gap) - gap

  return (
    <div className="w-full overflow-x-auto">
      <svg
        style={{ minWidth: W, display: 'block' }}
        width="100%"
        viewBox={`-8 0 ${W + 16} ${H + 44}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={-8} y1={H * (1 - pct)} x2={W + 8} y2={H * (1 - pct)} stroke="#1e293b" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max((d.value / max) * H, d.value > 0 ? 3 : 0)
          const x = i * (barW + gap)
          const y = H - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={5} fill="url(#barGrad)" />
              {d.value > 0 && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
                  {currency ? (d.value >= 1000 ? `$${(d.value / 1000).toFixed(1)}k` : `$${d.value}`) : d.value}
                </text>
              )}
              <text x={x + barW / 2} y={H + 18} textAnchor="middle" fontSize={11} fill="#64748b">
                {d.label}
              </text>
            </g>
          )
        })}
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

export function HorizontalBars({ data }: { data: { name: string; revenue: number }[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-300 truncate max-w-[60%]">{d.name}</span>
            <span className="text-sm font-semibold text-slate-200">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AED' }).format(d.revenue)}
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
              style={{ width: `${(d.revenue / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No paid invoices yet</p>}
    </div>
  )
}

export function RateRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle
          cx={44} cy={44} r={r}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x={44} y={44} textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize={16} fontWeight={700}>
          {pct}%
        </text>
      </svg>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}
