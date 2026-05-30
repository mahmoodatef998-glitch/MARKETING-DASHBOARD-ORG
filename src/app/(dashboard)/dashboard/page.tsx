'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart, BarChartSVG, HorizontalBars, RateRing } from '@/components/charts'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, DollarSign, CheckSquare, Users,
  Target, Clock, AlertCircle, BarChart2, Trophy, UserCheck,
  Zap, Calendar, CreditCard, ArrowRight,
} from 'lucide-react'

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

interface ReportData {
  teamPerformance: MemberStats[]
  monthlyRevenue: { label: string; value: number }[]
  invoiceStatus: { label: string; value: number; color: string }[]
  taskStatus: { label: string; value: number; color: string }[]
  tasksByPriority: { label: string; value: number; color: string }[]
  newClientsOverTime: { label: string; value: number }[]
  topClients: { name: string; revenue: number }[]
  kpis: {
    totalRevenue: number
    pendingRevenue: number
    collectionRate: number
    taskCompletionRate: number
    totalClients: number
    activeClients: number
    totalTasks: number
    completedTasks: number
    monthlyGrowthPct: number
    avgClientLTV: number
    avgDaysToPayment: number
  }
}

export default function DashboardPage() {
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
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64"><p className="text-slate-400">Failed to load data.</p></div>
  }

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(data.kpis.totalRevenue),
      sub: `${formatCurrency(data.kpis.pendingRevenue)} pending`,
      icon: DollarSign, color: 'text-green-400', bg: 'bg-green-400/10',
    },
    {
      title: 'Active Clients',
      value: data.kpis.activeClients,
      sub: `of ${data.kpis.totalClients} total`,
      icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10',
    },
    {
      title: 'Tasks Completed',
      value: data.kpis.completedTasks,
      sub: `of ${data.kpis.totalTasks} total`,
      icon: CheckSquare, color: 'text-purple-400', bg: 'bg-purple-400/10',
    },
    {
      title: 'Collection Rate',
      value: `${data.kpis.collectionRate}%`,
      sub: 'Paid invoices ratio',
      icon: TrendingUp, color: 'text-indigo-400', bg: 'bg-indigo-400/10',
    },
  ]

  const advancedKpis = [
    {
      title: 'Monthly Growth',
      value: `${data.kpis.monthlyGrowthPct > 0 ? '+' : ''}${data.kpis.monthlyGrowthPct}%`,
      sub: 'vs last month revenue',
      icon: data.kpis.monthlyGrowthPct >= 0 ? TrendingUp : TrendingDown,
      color: data.kpis.monthlyGrowthPct >= 0 ? 'text-emerald-400' : 'text-red-400',
      bg:    data.kpis.monthlyGrowthPct >= 0 ? 'bg-emerald-400/10' : 'bg-red-400/10',
    },
    {
      title: 'Avg Client LTV',
      value: formatCurrency(data.kpis.avgClientLTV),
      sub: 'Lifetime value per paying client',
      icon: CreditCard, color: 'text-cyan-400', bg: 'bg-cyan-400/10',
    },
    {
      title: 'Avg Payment Terms',
      value: `${data.kpis.avgDaysToPayment}d`,
      sub: 'Avg days issued → due',
      icon: Calendar, color: 'text-orange-400', bg: 'bg-orange-400/10',
    },
    {
      title: 'Task Completion',
      value: `${data.kpis.taskCompletionRate}%`,
      sub: `${data.kpis.completedTasks} of ${data.kpis.totalTasks} done`,
      icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10',
    },
  ]

  const topMember = data.teamPerformance[0]

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
              <BarChart2 className="h-4 w-4 text-indigo-400" /> Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent><BarChartSVG data={data.monthlyRevenue} /></CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-purple-400" /> Top Clients
            </CardTitle>
          </CardHeader>
          <CardContent><HorizontalBars data={data.topClients} /></CardContent>
        </Card>
      </div>

      {/* Status donuts + Performance rings */}
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
              <Target className="h-4 w-4 text-green-400" /> Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around pt-2">
              <RateRing pct={data.kpis.collectionRate} color="#4ade80" label="Collection Rate" />
              <RateRing pct={data.kpis.taskCompletionRate} color="#a78bfa" label="Task Completion" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {advancedKpis.map((k) => (
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

      {/* Team Performance (top 3) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4 text-indigo-400" /> Team Performance
            </CardTitle>
            {topMember && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                <Trophy className="h-3.5 w-3.5" /> {topMember.name}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.teamPerformance.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No team tasks assigned yet</p>
          ) : (
            data.teamPerformance.slice(0, 3).map((m, idx) => {
              const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0
              const barColor = pct >= 75 ? 'from-emerald-500 to-green-400'
                             : pct >= 40 ? 'from-indigo-500 to-purple-500'
                             : 'from-amber-500 to-orange-500'
              return (
                <div key={m.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300 border border-indigo-500/20">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    {idx === 0 && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                        <Trophy className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-200">{m.name}</span>
                      {m.role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{m.done}/{m.total}</span>
                    </div>
                  </div>
                  <div className={`text-lg font-extrabold shrink-0 w-12 text-right ${pct >= 75 ? 'text-emerald-400' : pct >= 40 ? 'text-indigo-400' : 'text-amber-400'}`}>
                    {pct}%
                  </div>
                </div>
              )
            })
          )}
          {data.teamPerformance.length > 3 && (
            <Link href="/reports" className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors pt-1">
              View all {data.teamPerformance.length} members <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
