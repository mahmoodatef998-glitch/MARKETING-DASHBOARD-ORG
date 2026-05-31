'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart, BarChartSVG, HorizontalBars, RateRing } from '@/components/charts'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, DollarSign, CheckSquare, Users,
  Target, Clock, Film, Palette, Bot, Megaphone, Trophy, UserCheck,
  Zap, Calendar, CreditCard, AlertCircle, BarChart2,
} from 'lucide-react'

// ─── Role / Type labels ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
  admin:       'Admin',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  reel_video: Film,
  design:     Palette,
  ai_video:   Bot,
  post:       Megaphone,
  custom:     Zap,
}

// ─── Team Member Row ──────────────────────────────────────────────────────────

interface MemberStats {
  id: string; name: string; role: string
  total: number; done: number; inProgress: number; review: number; overdue: number
  completionRate: number; doneThisMonth: number
  typeCount: Record<string, number>
}

function MemberRow({ m, isTop }: { m: MemberStats; isTop: boolean }) {
  const pct      = m.completionRate
  const barColor = pct >= 75 ? 'from-emerald-500 to-green-400'
                 : pct >= 40 ? 'from-indigo-500 to-purple-500'
                 : 'from-amber-500 to-orange-500'

  const topType = Object.entries(m.typeCount).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
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

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
          {topType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 ml-auto">
              Mostly: {ROLE_LABELS[topType[0]] ?? topType[0]} ({topType[1]})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 shrink-0 w-20 text-right">{m.done}/{m.total} tasks</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px]">
          <span className="text-emerald-400">✅ {m.done} done</span>
          {m.inProgress > 0 && <span className="text-purple-400">🔄 {m.inProgress} active</span>}
          {m.review > 0    && <span className="text-amber-400">⏳ {m.review} review</span>}
          {m.overdue > 0   && <span className="text-red-400">⚠️ {m.overdue} overdue</span>}
          {m.doneThisMonth > 0 && <span className="text-slate-500 ml-auto">{m.doneThisMonth} this month</span>}
        </div>
      </div>

      <div className="shrink-0 text-center w-14">
        <div className={`text-xl font-extrabold ${pct >= 75 ? 'text-emerald-400' : pct >= 40 ? 'text-indigo-400' : 'text-amber-400'}`}>
          {pct}%
        </div>
        <div className="text-[10px] text-slate-600 mt-0.5">complete</div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  teamPerformance:   MemberStats[]
  monthlyRevenue:    { label: string; value: number }[]
  monthlyOutput:     { label: string; value: number }[]
  newClientsOverTime:{ label: string; value: number }[]
  invoiceStatus:     { label: string; value: number; color: string }[]
  taskStatus:        { label: string; value: number; color: string }[]
  tasksByType:       { label: string; value: number; color: string }[]
  tasksByPriority:   { label: string; value: number; color: string }[]
  topClients:        { name: string; revenue: number }[]
  topClientsByTasks: { name: string; count: number }[]
  kpis: {
    totalRevenue: number; pendingRevenue: number; collectionRate: number
    taskCompletionRate: number; totalClients: number; activeClients: number
    totalTasks: number; completedTasks: number; monthlyGrowthPct: number
    avgClientLTV: number; avgDaysToPayment: number
    onTimeRate: number; thisMonthOutput: number; outputGrowthPct: number
  }
}

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</h2>
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color, bg }: {
  title: string; value: string | number; sub: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Inline bar for task type list ────────────────────────────────────────────

function TypeBar({ label, value, total, color, icon: Icon }: {
  label: string; value: number; total: number; color: string; icon: React.ElementType
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}22` }}>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-slate-300 truncate">{label}</span>
          <span className="text-xs font-semibold text-slate-200 ml-2">{value}</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className="text-[10px] text-slate-500 w-7 text-right shrink-0">{pct}%</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d: ReportData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-56 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64"><p className="text-slate-400">Failed to load reports.</p></div>
  }

  const totalTasks = data.tasksByType.reduce((s, t) => s + t.value, 0)

  return (
    <div className="space-y-8">

      {/* ── 1. Financial Overview ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Section title="Financial Overview" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Total Revenue" value={formatCurrency(data.kpis.totalRevenue)}
            sub={`${formatCurrency(data.kpis.pendingRevenue)} pending`}
            icon={DollarSign} color="text-green-400" bg="bg-green-400/10" />
          <KpiCard title="Monthly Growth" value={`${data.kpis.monthlyGrowthPct > 0 ? '+' : ''}${data.kpis.monthlyGrowthPct}%`}
            sub="vs last month revenue"
            icon={data.kpis.monthlyGrowthPct >= 0 ? TrendingUp : TrendingDown}
            color={data.kpis.monthlyGrowthPct >= 0 ? 'text-emerald-400' : 'text-red-400'}
            bg={data.kpis.monthlyGrowthPct >= 0 ? 'bg-emerald-400/10' : 'bg-red-400/10'} />
          <KpiCard title="Avg Client LTV" value={formatCurrency(data.kpis.avgClientLTV)}
            sub="Lifetime value per paying client"
            icon={CreditCard} color="text-cyan-400" bg="bg-cyan-400/10" />
          <KpiCard title="Collection Rate" value={`${data.kpis.collectionRate}%`}
            sub="Paid / total invoices"
            icon={Target} color="text-indigo-400" bg="bg-indigo-400/10" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart2 className="h-4 w-4 text-indigo-400" /> Monthly Revenue
              </CardTitle>
            </CardHeader>
            <CardContent><BarChartSVG data={data.monthlyRevenue} /></CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-purple-400" /> Top Clients by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent><HorizontalBars data={data.topClients} /></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-yellow-400" /> Invoice Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <DonutChart segments={data.invoiceStatus} />
                <div className="space-y-2 flex-1">
                  {data.invoiceStatus.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-slate-400">{s.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-300">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-orange-400" /> Avg Payment Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center h-[168px] gap-2">
              <p className="text-5xl font-extrabold text-slate-100">{data.kpis.avgDaysToPayment}<span className="text-2xl text-slate-500 ml-1">d</span></p>
              <p className="text-xs text-slate-500">average days from invoice issued to due</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-cyan-400" /> New Clients (6 months)
              </CardTitle>
            </CardHeader>
            <CardContent><BarChartSVG data={data.newClientsOverTime} currency={false} /></CardContent>
          </Card>
        </div>
      </div>

      {/* ── 2. Content Production ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Section title="Content Production" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Content Delivered" value={data.kpis.completedTasks}
            sub={`of ${data.kpis.totalTasks} total tasks`}
            icon={CheckSquare} color="text-purple-400" bg="bg-purple-400/10" />
          <KpiCard title="This Month Output" value={data.kpis.thisMonthOutput}
            sub={`${data.kpis.outputGrowthPct > 0 ? '+' : ''}${data.kpis.outputGrowthPct}% vs last month`}
            icon={data.kpis.outputGrowthPct >= 0 ? TrendingUp : TrendingDown}
            color={data.kpis.outputGrowthPct >= 0 ? 'text-emerald-400' : 'text-red-400'}
            bg={data.kpis.outputGrowthPct >= 0 ? 'bg-emerald-400/10' : 'bg-red-400/10'} />
          <KpiCard title="On-time Delivery" value={`${data.kpis.onTimeRate}%`}
            sub="Tasks done before due date"
            icon={Zap} color="text-yellow-400" bg="bg-yellow-400/10" />
          <KpiCard title="Completion Rate" value={`${data.kpis.taskCompletionRate}%`}
            sub={`${data.kpis.completedTasks} of ${data.kpis.totalTasks} done`}
            icon={Target} color="text-green-400" bg="bg-green-400/10" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4 text-purple-400" /> Monthly Content Output
              </CardTitle>
            </CardHeader>
            <CardContent><BarChartSVG data={data.monthlyOutput} currency={false} /></CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Film className="h-4 w-4 text-pink-400" /> Content by Type
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {data.tasksByType.map((t) => (
                <TypeBar
                  key={t.label}
                  label={t.label}
                  value={t.value}
                  total={totalTasks}
                  color={t.color}
                  icon={TYPE_ICONS[data.tasksByType.indexOf(t) === 0 ? 'reel_video'
                    : data.tasksByType.indexOf(t) === 1 ? 'design'
                    : data.tasksByType.indexOf(t) === 2 ? 'ai_video'
                    : data.tasksByType.indexOf(t) === 3 ? 'post' : 'custom'] ?? Zap}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-blue-400" /> Task Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <DonutChart segments={data.taskStatus} />
                <div className="space-y-2 flex-1">
                  {data.taskStatus.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-slate-400">{s.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-300">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-orange-400" /> Priority Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <DonutChart segments={data.tasksByPriority} />
                <div className="space-y-2 flex-1">
                  {data.tasksByPriority.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-slate-400">{s.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-300">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-green-400" /> Performance Rates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around pt-2">
                <RateRing pct={data.kpis.onTimeRate} color="#fbbf24" label="On-time Delivery" />
                <RateRing pct={data.kpis.taskCompletionRate} color="#a78bfa" label="Completion Rate" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 3. Client Analytics ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Section title="Client Analytics" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Active Clients" value={data.kpis.activeClients}
            sub={`of ${data.kpis.totalClients} total`}
            icon={Users} color="text-blue-400" bg="bg-blue-400/10" />
          <KpiCard title="Avg Client LTV" value={formatCurrency(data.kpis.avgClientLTV)}
            sub="Revenue per paying client"
            icon={CreditCard} color="text-cyan-400" bg="bg-cyan-400/10" />
          <KpiCard title="Collection Rate" value={`${data.kpis.collectionRate}%`}
            sub="Paid vs total invoices"
            icon={TrendingUp} color="text-indigo-400" bg="bg-indigo-400/10" />
          <KpiCard title="Pending Revenue" value={formatCurrency(data.kpis.pendingRevenue)}
            sub="Sent & overdue invoices"
            icon={AlertCircle} color="text-yellow-400" bg="bg-yellow-400/10" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-green-400" /> Top Clients by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent><HorizontalBars data={data.topClients} /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4 text-purple-400" /> Top Clients by Task Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topClientsByTasks.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No tasks assigned to clients yet</p>
              ) : (
                <div className="space-y-3">
                  {data.topClientsByTasks.map((c, i) => {
                    const max = data.topClientsByTasks[0].count
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300 truncate max-w-[60%]">{c.name}</span>
                          <span className="text-sm font-semibold text-slate-200">{c.count} tasks</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-700"
                            style={{ width: `${(c.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 4. Team Performance ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Section title="Team Performance" />
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-indigo-400" /> Team Leaderboard
              </CardTitle>
              {data.teamPerformance.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <Trophy className="h-3.5 w-3.5" /> {data.teamPerformance[0].name}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.teamPerformance.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No team tasks assigned yet</p>
            ) : (
              data.teamPerformance.map((m, i) => (
                <MemberRow key={m.id} m={m} isTop={i === 0} />
              ))
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
