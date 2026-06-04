export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [invoicesRes, tasksRes, clientsRes, teamTasksRes] = await Promise.all([
    supabase.from('invoices').select('id, total, status, issued_date, due_date, client_id'),
    supabase.from('tasks').select('id, status, priority, task_type, due_date, created_at, updated_at, client_id, assigned_to, client_rating, revision_notes'),
    supabase.from('clients').select('id, name, status, created_at'),
    supabase
      .from('tasks')
      .select('assigned_to, status, task_type, updated_at, assignee:profiles!assigned_to(display_name, role)')
      .not('assigned_to', 'is', null),
  ])

  const invoices  = invoicesRes.data  ?? []
  const tasks     = tasksRes.data     ?? []
  const clients   = clientsRes.data   ?? []
  const teamTasks = teamTasksRes.data ?? []

  // ── Month buckets — last 6 months ──────────────────────────────────────────
  const now = new Date()
  const monthEntries: { key: string; label: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthEntries.push({
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
    })
  }

  // ── Monthly revenue (paid) ──────────────────────────────────────────────────
  const revenueByMonth: Record<string, number> = {}
  for (const { key } of monthEntries) revenueByMonth[key] = 0
  for (const inv of invoices) {
    if (inv.status === 'paid') {
      const key = inv.issued_date.slice(0, 7)
      if (key in revenueByMonth) revenueByMonth[key] += inv.total
    }
  }
  const monthlyRevenue = monthEntries.map(({ key, label }) => ({ label, value: revenueByMonth[key] }))

  // ── Monthly content output (done tasks per month) ───────────────────────────
  const outputByMonth: Record<string, number> = {}
  for (const { key } of monthEntries) outputByMonth[key] = 0
  for (const t of tasks) {
    if (t.status === 'done') {
      const key = (t.updated_at ?? t.created_at).slice(0, 7)
      if (key in outputByMonth) outputByMonth[key]++
    }
  }
  const monthlyOutput = monthEntries.map(({ key, label }) => ({ label, value: outputByMonth[key] }))

  // ── New clients per month ───────────────────────────────────────────────────
  const newClientsByMonth: Record<string, number> = {}
  for (const { key } of monthEntries) newClientsByMonth[key] = 0
  for (const c of clients) {
    if (!c.created_at) continue
    const key = c.created_at.slice(0, 7)
    if (key in newClientsByMonth) newClientsByMonth[key]++
  }
  const newClientsOverTime = monthEntries.map(({ key, label }) => ({ label, value: newClientsByMonth[key] }))

  // ── Content type breakdown ──────────────────────────────────────────────────
  const TYPE_META: { key: string; label: string; color: string }[] = [
    { key: 'reel_video',  label: 'Reels / Short Video', color: '#f472b6' },
    { key: 'design',      label: 'Design',               color: '#60a5fa' },
    { key: 'ai_video',    label: 'AI Video',             color: '#a78bfa' },
    { key: 'post',        label: 'Social Media Post',    color: '#34d399' },
    { key: 'custom',      label: 'Custom / Other',       color: '#fbbf24' },
  ]
  const tasksByType = TYPE_META.map(({ key, label, color }) => ({
    label, color,
    value: tasks.filter((t) => t.task_type === key).length,
  }))

  // ── Task status breakdown ───────────────────────────────────────────────────
  const taskStatus = [
    { label: 'Done',        value: tasks.filter((t) => t.status === 'done').length,        color: '#4ade80' },
    { label: 'In Progress', value: tasks.filter((t) => t.status === 'in_progress').length, color: '#a78bfa' },
    { label: 'Review',      value: tasks.filter((t) => t.status === 'review').length,      color: '#fbbf24' },
    { label: 'To Do',       value: tasks.filter((t) => t.status === 'todo').length,        color: '#60a5fa' },
    { label: 'Overdue',     value: tasks.filter((t) => t.status === 'overdue').length,     color: '#f87171' },
  ]

  // ── Task priority breakdown ─────────────────────────────────────────────────
  const tasksByPriority = [
    { label: 'Urgent', value: tasks.filter((t) => t.priority === 'urgent').length, color: '#ef4444' },
    { label: 'High',   value: tasks.filter((t) => t.priority === 'high').length,   color: '#f97316' },
    { label: 'Medium', value: tasks.filter((t) => t.priority === 'medium').length, color: '#eab308' },
    { label: 'Low',    value: tasks.filter((t) => t.priority === 'low').length,    color: '#22c55e' },
  ]

  // ── Invoice status ──────────────────────────────────────────────────────────
  const invoiceStatus = [
    { label: 'Paid',    value: invoices.filter((i) => i.status === 'paid').length,    color: '#4ade80' },
    { label: 'Sent',    value: invoices.filter((i) => i.status === 'sent').length,    color: '#60a5fa' },
    { label: 'Draft',   value: invoices.filter((i) => i.status === 'draft').length,   color: '#94a3b8' },
    { label: 'Overdue', value: invoices.filter((i) => i.status === 'overdue').length, color: '#f87171' },
  ]

  // ── Top 5 clients by revenue ────────────────────────────────────────────────
  const clientRevenue: Record<string, number> = {}
  for (const inv of invoices) {
    if (inv.status === 'paid' && inv.client_id) {
      clientRevenue[inv.client_id] = (clientRevenue[inv.client_id] ?? 0) + inv.total
    }
  }
  const topClients = Object.entries(clientRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([clientId, revenue]) => ({
      name: clients.find((c) => c.id === clientId)?.name ?? 'Unknown',
      revenue,
    }))

  // ── Top 5 clients by task volume ────────────────────────────────────────────
  const clientTaskCount: Record<string, number> = {}
  for (const t of tasks) {
    if (t.client_id) clientTaskCount[t.client_id] = (clientTaskCount[t.client_id] ?? 0) + 1
  }
  const topClientsByTasks = Object.entries(clientTaskCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([clientId, count]) => ({
      name:  clients.find((c) => c.id === clientId)?.name ?? 'Unknown',
      count,
    }))

  // ── On-time delivery rate ───────────────────────────────────────────────────
  const doneTasks = tasks.filter((t) => t.status === 'done')
  const doneWithDue = doneTasks.filter((t) => t.due_date)
  const onTime = doneWithDue.filter((t) => {
    const completed = new Date(t.updated_at ?? t.created_at)
    const due       = new Date(t.due_date!)
    return completed <= due
  })
  const onTimeRate = doneWithDue.length > 0
    ? Math.round((onTime.length / doneWithDue.length) * 100)
    : 0

  // ── Team performance ────────────────────────────────────────────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const memberMap: Record<string, {
    id: string; name: string; role: string
    total: number; done: number; inProgress: number; review: number; overdue: number; doneThisMonth: number
    typeCount: Record<string, number>
  }> = {}

  for (const t of teamTasks) {
    const uid  = t.assigned_to as string
    const info = (t as { assigned_to: string; status: string; task_type: string | null; updated_at: string; assignee: { display_name?: string; role?: string } | null }).assignee
    if (!memberMap[uid]) {
      memberMap[uid] = {
        id: uid,
        name: info?.display_name ?? 'Team Member',
        role: info?.role ?? '',
        total: 0, done: 0, inProgress: 0, review: 0, overdue: 0, doneThisMonth: 0,
        typeCount: {},
      }
    }
    const m = memberMap[uid]
    const tt = (t as { task_type: string | null }).task_type
    m.total++
    if (tt) m.typeCount[tt] = (m.typeCount[tt] ?? 0) + 1
    if (t.status === 'done')        { m.done++;       if (t.updated_at >= monthStart) m.doneThisMonth++ }
    if (t.status === 'in_progress') m.inProgress++
    if (t.status === 'review')      m.review++
    if (t.status === 'overdue')     m.overdue++
  }

  const teamPerformance = Object.values(memberMap)
    .map((m) => ({ ...m, completionRate: m.total > 0 ? Math.round((m.done / m.total) * 100) : 0 }))
    .sort((a, b) => b.completionRate - a.completionRate || b.done - a.done)

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalRevenue       = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const pendingRevenue     = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const paidCount          = invoices.filter((i) => i.status === 'paid').length
  const collectionRate     = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 100) : 0
  const completedTasks     = tasks.filter((t) => t.status === 'done').length
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

  const thisMonthKey    = monthEntries[5].key
  const lastMonthKey    = monthEntries[4].key
  const thisMonthRev    = revenueByMonth[thisMonthKey] ?? 0
  const lastMonthRev    = revenueByMonth[lastMonthKey] ?? 0
  const monthlyGrowthPct = lastMonthRev > 0
    ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
    : thisMonthRev > 0 ? 100 : 0

  const payingClients = new Set(invoices.filter((i) => i.status === 'paid').map((i) => i.client_id))
  const avgClientLTV  = payingClients.size > 0 ? Math.round(totalRevenue / payingClients.size) : 0

  const paidWithDates    = invoices.filter((i) => i.status === 'paid' && i.issued_date && i.due_date)
  const avgDaysToPayment = paidWithDates.length > 0
    ? Math.round(
        paidWithDates.reduce((sum, inv) => {
          return sum + (new Date(inv.due_date).getTime() - new Date(inv.issued_date).getTime()) / 86_400_000
        }, 0) / paidWithDates.length,
      )
    : 0

  const thisMonthOutput = outputByMonth[thisMonthKey] ?? 0
  const lastMonthOutput = outputByMonth[lastMonthKey] ?? 0
  const outputGrowthPct = lastMonthOutput > 0
    ? Math.round(((thisMonthOutput - lastMonthOutput) / lastMonthOutput) * 100)
    : thisMonthOutput > 0 ? 100 : 0

  // ── Client rating avg ───────────────────────────────────────────────────────
  const ratedTasks = (tasks as unknown as { client_rating?: number | null }[]).filter(t => t.client_rating != null)
  const avgClientRating = ratedTasks.length > 0
    ? Math.round((ratedTasks.reduce((s, t) => s + (t.client_rating ?? 0), 0) / ratedTasks.length) * 10) / 10
    : 0

  // ── Revision rate ───────────────────────────────────────────────────────────
  const doneTasksAll = tasks.filter(t => t.status === 'done')
  const tasksWithRevision = (tasks as unknown as { revision_notes?: string | null }[]).filter(t => t.revision_notes)
  const revisionRate = tasks.length > 0 ? Math.round((tasksWithRevision.length / tasks.length) * 100) : 0

  return NextResponse.json({
    monthlyRevenue,
    monthlyOutput,
    newClientsOverTime,
    invoiceStatus,
    taskStatus,
    tasksByType,
    tasksByPriority,
    topClients,
    topClientsByTasks,
    teamPerformance,
    kpis: {
      totalRevenue,
      pendingRevenue,
      collectionRate,
      taskCompletionRate,
      totalClients:    clients.length,
      activeClients:   clients.filter((c) => c.status === 'active').length,
      totalTasks:      tasks.length,
      completedTasks,
      monthlyGrowthPct,
      avgClientLTV,
      avgDaysToPayment,
      onTimeRate,
      thisMonthOutput,
      outputGrowthPct,
      avgClientRating,
      revisionRate,
      ratedTasksCount: ratedTasks.length,
    },
  })
}
