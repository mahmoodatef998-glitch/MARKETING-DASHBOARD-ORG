'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, DollarSign, CheckSquare, Users,
  Target, Clock, AlertCircle, BarChart2, Trophy, UserCheck,
} from 'lucide-react'

// ─── Chart helpers ────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function DonutChart({
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

  let currentAngle = 0
  const paths = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const angle = (seg.value / total) * 360
      const startA = currentAngle
      currentAngle += angle
      const endA = currentAngle
      const s = polarToCartesian(cx, cy, r, startA)
      const e = polarToCartesian(cx, cy, r, endA)
      const si = polarToCartesian(cx, cy, innerR, startA)
      const ei = polarToCartesian(cx, cy, innerR, endA)
      const large = angle > 180 ? 1 : 0
      return {
        color: seg.color,
        d: `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${innerR} ${innerR} 0 ${large} 0 ${si.x} ${si.y} Z`,
      }
    })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="#0f172a" strokeWidth={2} />
      ))}
      <text
        x={cx} y={cy - 5}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={size * 0.13}
        fontWeight={700}
      >
        {total}
      </text>
      <text
        x={cx} y={cy + size * 0.1}
        textAnchor="middle"
        fill="#64748b"
        fontSize={size * 0.065}
        letterSpacing={1}
      >
        TOTAL
      </text>
    </svg>
  )
}

function BarChartSVG({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = 38
  const gap = 16
  const H = 150
  const W = data.length * (barW + gap) - gap

  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <svg
        style={{ minWidth: W, display: 'block' }}
        width="100%"
        viewBox={`-8 0 ${W + 16} ${H + 44}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={-8} y1={H * (1 - pct)}
            x2={W + 8} y2={H * (1 - pct)}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const barH = Math.max((d.value / max) * H, d.value > 0 ? 3 : 0)
          const x = i * (barW + gap)
          const y = H - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={5} fill="url(#barGrad)" />
              {d.value > 0 && (
                <text
                  x={x + barW / 2} y={y - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {d.value >= 1000 ? `$${(d.value / 1000).toFixed(1)}k` : `$${d.value}`}
                </text>
              )}
              <text
                x={x + barW / 2} y={H + 18}
                textAnchor="middle"
                fontSize={11}
                fill="#64748b"
              >
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

function HorizontalBars({ data }: { data: { name: string; revenue: number }[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-300 truncate max-w-[60%]">{d.name}</span>
            <span className="text-sm font-semibold text-slate-200">{formatCurrency(d.revenue)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
              style={{ width: `${(d.revenue / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">No paid invoices yet</p>
      )}
    </div>
  )
}

function RateRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle
          cx={44} cy={44} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
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

// ─── Team Performance ─────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
  admin:       'Admin',
}

interface MemberStats {
  id: string; name: string; role: string
  total: number; done: number; inProgress: number; review: number; overdue: number
  completionRate: number; doneThisMonth: number
}

function MemberRow({ m, isTop }: { m: MemberStats; isTop: boolean }) {
  const barPct   = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0
  const barColor = barPct >= 75 ? 'from-emerald-500 to-green-400'
                 : barPct >= 40 ? 'from-indigo-500 to-purple-500'
                 : 'from-amber-500 to-orange-500'

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300 border border-indigo-500/20">
          {m.name.charAt(0).toUpperCase()}
        </div>
        {isTop && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
            <Trophy className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Name + workload */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-200">{m.name}</span>
          {m.role && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-medium">
              {ROLE_LABELS[m.role] ?? m.role}
            </span>
          )}
          {isTop && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
              Top Performer
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 shrink-0 w-20 text-right">
            {m.done}/{m.total} tasks
          </span>
        </div>
        {/* Status badges */}
        <div className="flex items-center gap-3 mt-1.5 text-[11px]">
          <span className="text-emerald-400">✅ {m.done} done</span>
          {m.inProgress > 0 && <span className="text-purple-400">🔄 {m.inProgress} active</span>}
          {m.review > 0    && <span className="text-amber-400">⏳ {m.review} review</span>}
          {m.overdue > 0   && <span className="text-red-400">⚠️ {m.overdue} overdue</span>}
          {m.doneThisMonth > 0 && (
            <span className="text-slate-500 ml-auto">{m.doneThisMonth} this month</span>
          )}
        </div>
      </div>

      {/* Rate */}
      <div className="shrink-0 text-center w-14">
        <div className={`text-xl font-extrabold ${
          barPct >= 75 ? 'text-emerald-400' : barPct >= 40 ? 'text-indigo-400' : 'text-amber-400'
        }`}>
          {barPct}%
        </div>
        <div className="text-[10px] text-slate-600 mt-0.5">complete</div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  monthlyRevenue: { label: string; value: number }[]
  invoiceStatus: { label: string; value: number; color: string }[]
  taskStatus: { label: string; value: number; color: string }[]
  topClients: { name: string; revenue: number }[]
  teamPerformance: MemberStats[]
  kpis: {
    totalRevenue: number
    pendingRevenue: number
    collectionRate: number
    taskCompletionRate: number
    totalClients: number
    activeClients: number
    totalTasks: number
    completedTasks: number
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Failed to load reports.</p>
      </div>
    )
  }

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(data.kpis.totalRevenue),
      sub: `${formatCurrency(data.kpis.pendingRevenue)} pending`,
      icon: DollarSign,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
    },
    {
      title: 'Active Clients',
      value: data.kpis.activeClients,
      sub: `of ${data.kpis.totalClients} total`,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      title: 'Tasks Completed',
      value: data.kpis.completedTasks,
      sub: `of ${data.kpis.totalTasks} total`,
      icon: CheckSquare,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      title: 'Collection Rate',
      value: `${data.kpis.collectionRate}%`,
      sub: 'Paid invoices ratio',
      icon: TrendingUp,
      color: 'text-indigo-400',
      bg: 'bg-indigo-400/10',
    },
  ]

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-400">{k.title}</p>
                  <p className="text-2xl font-bold text-slate-100 mt-1">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
                </div>
                <div className={`p-2.5 rounded-xl ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue + Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart2 className="h-4 w-4 text-indigo-400" />
              Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSVG data={data.monthlyRevenue} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Top Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars data={data.topClients} />
          </CardContent>
        </Card>
      </div>

      {/* Invoice + Task Status + Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Invoice Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              Invoice Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <DonutChart segments={data.invoiceStatus} />
              <div className="space-y-2 flex-1">
                {data.invoiceStatus.map((s) => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-slate-400">{s.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-blue-400" />
              Task Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <DonutChart segments={data.taskStatus} />
              <div className="space-y-2 flex-1">
                {data.taskStatus.map((s) => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-slate-400">{s.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Rates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-green-400" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around pt-2">
              <RateRing
                pct={data.kpis.collectionRate}
                color="#4ade80"
                label="Collection Rate"
              />
              <RateRing
                pct={data.kpis.taskCompletionRate}
                color="#a78bfa"
                label="Task Completion"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Performance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4 text-indigo-400" />
              Team Performance
            </CardTitle>
            {data.teamPerformance.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                <Trophy className="h-3.5 w-3.5" />
                {data.teamPerformance[0].name}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.teamPerformance.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No team tasks assigned yet
            </p>
          ) : (
            data.teamPerformance.map((m, i) => (
              <MemberRow key={m.id} m={m} isTop={i === 0} />
            ))
          )}
        </CardContent>
      </Card>

    </div>
  )
}
