'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart, BarChartSVG, HorizontalBars, RateRing } from '@/components/charts'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, DollarSign, CheckSquare, Users,
  Target, Clock, AlertCircle, BarChart2, Trophy, UserCheck,
  Zap, Calendar, CreditCard, ArrowRight, Eye,
  Send, Film, ImageIcon,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Task, Client, BillingPlan, Invoice } from '@/types'

// ── Shared types ──────────────────────────────────────────────────────────────

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
    totalRevenue: number; pendingRevenue: number; collectionRate: number
    taskCompletionRate: number; totalClients: number; activeClients: number
    totalTasks: number; completedTasks: number; monthlyGrowthPct: number
    avgClientLTV: number; avgDaysToPayment: number; avgClientRating: number
    ratedTasksCount: number; revisionRate: number
  }
}

type TaskWithDelivery = Task & { delivery_url?: string; client?: { name: string } }

interface ScheduledPost {
  id: string
  status: 'pending' | 'published' | 'failed' | 'cancelled'
  platform: 'instagram' | 'facebook' | 'tiktok'
  scheduled_at: string
  published_at?: string
  caption?: string
  task?: { id: string; title: string }
}

interface MediaBuyerData {
  posts: ScheduledPost[]
  readyTasks: TaskWithDelivery[]
}

// ── Media Buyer Dashboard ─────────────────────────────────────────────────────

const PLATFORM_CFG: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-pink-500/15 text-pink-400' },
  facebook:  { label: 'Facebook',  color: 'bg-blue-500/15 text-blue-400' },
  tiktok:    { label: 'TikTok',    color: 'bg-slate-700 text-slate-300' },
}

function MediaBuyerDashboard({ data }: { data: MediaBuyerData | null }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Failed to load publishing data.</p>
      </div>
    )
  }

  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const scheduled        = data.posts.filter(p => p.status === 'pending')
  const publishedThisWeek = data.posts.filter(
    p => p.status === 'published' && p.published_at && new Date(p.published_at) >= weekAgo
  )
  const failed = data.posts.filter(p => p.status === 'failed')

  const statsCards = [
    {
      title: 'Ready to Publish',
      value: data.readyTasks.length,
      sub: 'tasks with uploaded media',
      icon: Eye,
      color: 'text-indigo-400', bg: 'bg-indigo-400/10',
    },
    {
      title: 'Scheduled',
      value: scheduled.length,
      sub: 'posts awaiting publish time',
      icon: Calendar,
      color: 'text-violet-400', bg: 'bg-violet-400/10',
    },
    {
      title: 'Published (7d)',
      value: publishedThisWeek.length,
      sub: 'posts this week',
      icon: CheckSquare,
      color: 'text-emerald-400', bg: 'bg-emerald-400/10',
    },
    {
      title: 'Failed',
      value: failed.length,
      sub: failed.length > 0 ? 'need attention' : 'all clear',
      icon: AlertCircle,
      color: failed.length > 0 ? 'text-red-400' : 'text-slate-400',
      bg: failed.length > 0 ? 'bg-red-400/10' : 'bg-slate-400/10',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Publishing Overview</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your social media command center</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsCards.map(k => (
          <Card key={k.title}>
            <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-xs text-slate-400">{k.title}</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-100 mt-1 truncate">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{k.sub}</p>
                </div>
                <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${k.bg}`}>
                  <k.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/scheduled-posts"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <Send className="h-4 w-4" /> Publishing Hub
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
        >
          <Zap className="h-4 w-4 text-indigo-400" /> Social Accounts
        </Link>
      </div>

      {/* Failed posts alert */}
      {failed.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-red-500/15">
              <AlertCircle className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-300">
                {failed.length} post{failed.length > 1 ? 's' : ''} failed to publish
              </p>
              <p className="text-xs text-red-400/70">Visit Publishing Hub to reschedule</p>
            </div>
          </div>
          <Link href="/scheduled-posts"
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
            Review <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ready to Publish */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-indigo-400" /> Ready to Publish
              </CardTitle>
              <Link href="/scheduled-posts"
                className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors">
                Open Hub <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.readyTasks.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No tasks ready yet.<br />
                <span className="text-xs">Tasks need status &quot;Done&quot; + uploaded media.</span>
              </p>
            ) : (
              <div className="space-y-2">
                {data.readyTasks.slice(0, 6).map(task => {
                  const isVideo = /\.(mp4|mov|webm|avi)/i.test(task.delivery_url ?? '')
                  return (
                    <div key={task.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                        {isVideo ? (
                          <Film className="h-4 w-4 text-slate-400" />
                        ) : task.delivery_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={task.delivery_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate font-medium">{task.title}</p>
                        {task.client?.name && (
                          <p className="text-xs text-slate-500 truncate">{task.client.name}</p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Ready
                      </span>
                    </div>
                  )
                })}
                {data.readyTasks.length > 6 && (
                  <p className="text-xs text-slate-500 text-center pt-1">
                    +{data.readyTasks.length - 6} more in Publishing Hub
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Scheduled */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-violet-400" /> Upcoming Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scheduled.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No scheduled posts yet.<br />
                <span className="text-xs">Head to Publishing Hub to schedule content.</span>
              </p>
            ) : (
              <div className="space-y-2">
                {scheduled.slice(0, 6).map(post => {
                  const cfg = PLATFORM_CFG[post.platform] ?? { label: post.platform, color: 'bg-slate-700 text-slate-300' }
                  const dt  = new Date(post.scheduled_at)
                  return (
                    <div key={post.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40">
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">
                          {post.task?.title ?? post.caption?.slice(0, 40) ?? 'Untitled'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {dt.toLocaleDateString()} · {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {scheduled.length > 6 && (
                  <p className="text-xs text-slate-500 text-center pt-1">
                    +{scheduled.length - 6} more scheduled
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Billing Overview Card ─────────────────────────────────────────────────────

function cycleLabel(plan: BillingPlan): string {
  if (plan.cycle_type === 'custom_days') return `Every ${plan.custom_days ?? '?'} Days`
  const map: Record<string, string> = { monthly: 'Monthly', biweekly: 'Every 2 Weeks', every_10_days: 'Every 10 Days' }
  return map[plan.cycle_type] ?? plan.cycle_type
}

function currSym(c?: string) {
  return c === 'EGP' ? 'EGP ' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : c === 'AED' ? 'AED ' : '$'
}

function BillingOverviewCard({ client, tasks }: { client: Client; tasks: Task[] }) {
  const plan = client.billing_plans?.find((p: BillingPlan) => p.is_active && p.cycle_type !== 'manual')
  if (!plan) return null

  const today      = new Date().toISOString().split('T')[0]
  const clientTasks = tasks.filter((t) => t.client_id === client.id)
  const done       = clientTasks.filter((t) => t.status === 'done').length
  const total      = clientTasks.length
  const pct        = total > 0 ? Math.round((done / total) * 100) : 0
  const sym        = currSym(plan.currency)
  const daysUntil  = Math.ceil((new Date(plan.next_invoice_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
  const isDueSoon  = daysUntil <= 2

  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-violet-500' : pct >= 25 ? 'bg-orange-400' : 'bg-red-500'

  return (
    <Card className="border-violet-500/20 bg-violet-950/10 hover:border-violet-500/40 transition-colors">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-slate-100 text-sm">{client.name}</p>
            <p className="text-xs text-violet-400 mt-0.5 flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              {cycleLabel(plan)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-slate-100">{sym}{plan.amount.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{plan.currency}</p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 text-xs mb-3 px-2.5 py-1.5 rounded-lg ${
          isDueSoon
            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
            : 'bg-slate-800/50 text-slate-400'
        }`}>
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>
            {plan.next_invoice_date <= today
              ? 'Invoice generating soon…'
              : `Next invoice: ${formatDate(plan.next_invoice_date)}`}
          </span>
        </div>

        {total > 0 ? (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Package Progress
              </span>
              <span className="text-slate-300 font-medium">{done}/{total} tasks · {pct}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic">No tasks linked to this client yet</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Cash Flow Projection ──────────────────────────────────────────────────────

function CashFlowProjection({ billingClients, openInvoices }: { billingClients: Client[]; openInvoices: Invoice[] }) {
  const todayMs = new Date().setHours(0, 0, 0, 0)

  function windowTotals(days: number) {
    const cutoff = new Date(todayMs)
    cutoff.setDate(cutoff.getDate() + days)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const todayStr  = new Date(todayMs).toISOString().split('T')[0]

    // Outstanding invoices (overdue + upcoming) due within window
    const fromInvoices = openInvoices
      .filter(inv => inv.due_date && inv.due_date <= cutoffStr)
      .reduce((sum, inv) => sum + Math.max(0, inv.total - (inv.received_amount ?? 0)), 0)

    // Active billing plans with next invoice due within window
    const fromPlans = billingClients.reduce((sum, client) => {
      const plan = client.billing_plans?.find((p: BillingPlan) => p.is_active && p.cycle_type !== 'manual')
      if (!plan?.next_invoice_date) return sum
      // Only count plans not already counted as open invoice (next_invoice_date > today means not yet invoiced)
      if (plan.next_invoice_date > todayStr && plan.next_invoice_date <= cutoffStr) {
        return sum + (plan.amount ?? 0)
      }
      return sum
    }, 0)

    return { fromInvoices, fromPlans, total: fromInvoices + fromPlans }
  }

  const w30 = windowTotals(30)
  const w60 = windowTotals(60)
  const w90 = windowTotals(90)

  const periods = [
    { label: 'Next 30 Days', ...w30, color: 'text-emerald-400', bg: 'bg-emerald-400/8', border: 'border-emerald-500/20', barColor: 'bg-emerald-500' },
    { label: 'Next 60 Days', ...w60, color: 'text-blue-400',    bg: 'bg-blue-400/8',    border: 'border-blue-500/20',    barColor: 'bg-blue-500'    },
    { label: 'Next 90 Days', ...w90, color: 'text-violet-400',  bg: 'bg-violet-400/8',  border: 'border-violet-500/20',  barColor: 'bg-violet-500'  },
  ]

  const maxTotal = Math.max(w90.total, 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Cash Flow Projection
        </h2>
        <span className="text-xs text-slate-500">Outstanding invoices + upcoming billing</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {periods.map(({ label, fromInvoices, fromPlans, total, color, bg, border, barColor }) => (
          <Card key={label} className={`border ${border} ${bg}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{total.toLocaleString()}</p>
              <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.round((total / maxTotal) * 100)}%` }} />
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Open invoices</span>
                  <span className="text-slate-300">{fromInvoices.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Upcoming billing</span>
                  <span className="text-slate-300">{fromPlans.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
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

// ── Main export ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [role,           setRole]          = useState<string | null>(null)
  const [data,           setData]          = useState<ReportData | null>(null)
  const [mbData,         setMbData]        = useState<MediaBuyerData | null>(null)
  const [reviewTasks,    setReviewTasks]   = useState<Task[]>([])
  const [billingClients, setBillingClients] = useState<Client[]>([])
  const [allTasks,       setAllTasks]      = useState<Task[]>([])
  const [openInvoices,   setOpenInvoices]  = useState<Invoice[]>([])
  const [loading,        setLoading]       = useState(true)

  // Detect role first — redirect team-only roles back to their portal
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) { setRole('admin'); return }
        const teamOnlyRoles = ['video_maker', 'designer', 'ai_video']
        if (teamOnlyRoles.includes(p.role)) { router.replace('/team-portal'); return }
        if (p.role === 'client') { router.replace('/client-portal'); return }
        setRole(p.role ?? 'admin')
      })
      .catch(() => setRole('admin'))
  }, [router])

  // Load data once role is known
  useEffect(() => {
    if (role === null) return

    if (role === 'admin') {
      Promise.all([
        fetch('/api/reports').then(r => r.ok ? r.json() : null),
        fetch('/api/tasks?status=review').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/clients').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/tasks').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/invoices').then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([reportData, reviewT, clients, allT, invs]) => {
        setData(reportData)
        setReviewTasks(Array.isArray(reviewT) ? reviewT : [])
        const clientList: Client[] = Array.isArray(clients) ? clients : (clients?.data ?? [])
        setBillingClients(clientList.filter((c: Client) =>
          c.billing_plans?.some((p: BillingPlan) => p.is_active && p.cycle_type !== 'manual')
        ))
        setAllTasks(Array.isArray(allT) ? allT : [])
        const invList: Invoice[] = Array.isArray(invs) ? invs : []
        setOpenInvoices(invList.filter((i: Invoice) => i.status !== 'paid' && i.status !== 'draft'))
        setLoading(false)
      }).catch(() => setLoading(false))

    } else if (role === 'media_buyer') {
      Promise.all([
        fetch('/api/social/scheduled-posts').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/tasks?status=done&approval_status=admin_approved').then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([posts, tasks]) => {
        const allTasks = Array.isArray(tasks) ? (tasks as TaskWithDelivery[]) : []
        setMbData({
          posts:      Array.isArray(posts) ? posts : [],
          readyTasks: allTasks,
        })
        setLoading(false)
      }).catch(() => setLoading(false))

    } else {
      // Other team roles — nothing to show here; they should be on /team-portal
      setLoading(false)
    }
  }, [role])

  if (loading || role === null) return <LoadingSkeleton />

  if (role === 'media_buyer') return <MediaBuyerDashboard data={mbData} />

  // ── Admin dashboard ─────────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Failed to load dashboard data.</p>
      </div>
    )
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
    {
      title: 'Avg Client Rating',
      value: data.kpis.avgClientRating > 0 ? `${data.kpis.avgClientRating} ★` : '—',
      sub: `from ${data.kpis.ratedTasksCount} rated task${data.kpis.ratedTasksCount !== 1 ? 's' : ''}`,
      icon: Target, color: 'text-pink-400', bg: 'bg-pink-400/10',
    },
    {
      title: 'Revision Rate',
      value: `${data.kpis.revisionRate}%`,
      sub: 'tasks that had revision requests',
      icon: AlertCircle,
      color: data.kpis.revisionRate > 30 ? 'text-red-400' : 'text-slate-400',
      bg:   data.kpis.revisionRate > 30 ? 'bg-red-400/10' : 'bg-slate-400/10',
    },
  ]

  const topMember = data.teamPerformance[0]

  return (
    <div className="space-y-6">

      {/* Ready for Review alert */}
      {reviewTasks.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/15">
                <Eye className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  {reviewTasks.length} task{reviewTasks.length > 1 ? 's' : ''} awaiting client approval
                </p>
                <p className="text-xs text-amber-400/70">These tasks are marked done and waiting for client review</p>
              </div>
            </div>
            <Link href="/tasks?status=review"
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {reviewTasks.slice(0, 4).map(task => (
              <div key={task.id} className="flex items-center justify-between rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-sm text-slate-200 truncate">{task.title}</span>
                  {(task as Task & { client?: { name: string } }).client?.name && (
                    <span className="text-xs text-slate-500 truncate hidden sm:block">
                      — {(task as Task & { client?: { name: string } }).client?.name}
                    </span>
                  )}
                </div>
                {task.assignee?.display_name && (
                  <span className="text-xs text-slate-500 shrink-0 ml-2">@ {task.assignee.display_name}</span>
                )}
              </div>
            ))}
            {reviewTasks.length > 4 && (
              <p className="text-xs text-amber-400/60 text-center pt-1">+{reviewTasks.length - 4} more</p>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-xs text-slate-400">{k.title}</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-100 mt-1 truncate">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{k.sub}</p>
                </div>
                <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${k.bg}`}>
                  <k.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cash Flow Projection */}
      {(billingClients.length > 0 || openInvoices.length > 0) && (
        <CashFlowProjection billingClients={billingClients} openInvoices={openInvoices} />
      )}

      {/* Billing Overview */}
      {billingClients.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-400" />
              Active Billing Plans
            </h2>
            <Link href="/invoices" className="text-xs text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
              View invoices <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {billingClients.map((client) => (
              <BillingOverviewCard key={client.id} client={client} tasks={allTasks} />
            ))}
          </div>
        </div>
      )}

      {/* Revenue + Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
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
              <RateRing pct={data.kpis.collectionRate}      color="#4ade80" label="Collection Rate"  />
              <RateRing pct={data.kpis.taskCompletionRate}  color="#a78bfa" label="Task Completion"  />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {advancedKpis.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-xs text-slate-400">{k.title}</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-100 mt-1 truncate">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{k.sub}</p>
                </div>
                <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${k.bg}`}>
                  <k.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Performance */}
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
              const pct      = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0
              const barColor = pct >= 75 ? 'from-emerald-500 to-green-400'
                             : pct >= 40 ? 'from-indigo-500 to-purple-500'
                             : 'from-amber-500 to-orange-500'
              return (
                <div key={m.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
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
                        <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                          style={{ width: `${pct}%` }} />
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
            <Link href="/reports"
              className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors pt-1">
              View all {data.teamPerformance.length} members <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
