export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [invoicesRes, tasksRes, clientsRes, teamTasksRes] = await Promise.all([
    supabase.from('invoices').select('id, total, status, issued_date, due_date, client_id'),
    supabase.from('tasks').select('id, status, priority, assignee_id, created_at, updated_at'),
    supabase.from('clients').select('id, name, status, created_at'),
    supabase
      .from('tasks')
      .select('assigned_to, status, updated_at, assignee:profiles(display_name, role)')
      .not('assigned_to', 'is', null),
  ])

  const invoices  = invoicesRes.data ?? []
  const tasks     = tasksRes.data ?? []
  const clients   = clientsRes.data ?? []
  const teamTasks = teamTasksRes.data ?? []

  // ── Monthly revenue — last 6 months ────────────────────────────────────────
  const now = new Date()
  const monthEntries: { key: string; label: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthEntries.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
    })
  }
  const revenueByMonth: Record<string, number> = {}
  for (const { key } of monthEntries) revenueByMonth[key] = 0
  for (const inv of invoices) {
    if (inv.status === 'paid') {
      const d   = new Date(inv.issued_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in revenueByMonth) revenueByMonth[key] += inv.total
    }
  }
  const monthlyRevenue = monthEntries.map(({ key, label }) => ({ label, value: revenueByMonth[key] }))

  // ── Invoice / task status counts ────────────────────────────────────────────
  const invoiceStatus = [
    { label: 'Paid',    value: invoices.filter(i => i.status === 'paid').length,    color: '#4ade80' },
    { label: 'Sent',    value: invoices.filter(i => i.status === 'sent').length,    color: '#60a5fa' },
    { label: 'Draft',   value: invoices.filter(i => i.status === 'draft').length,   color: '#94a3b8' },
    { label: 'Overdue', value: invoices.filter(i => i.status === 'overdue').length, color: '#f87171' },
  ]
  const taskStatus = [
    { label: 'Done',        value: tasks.filter(t => t.status === 'done').length,        color: '#4ade80' },
    { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, color: '#a78bfa' },
    { label: 'Review',      value: tasks.filter(t => t.status === 'review').length,      color: '#fbbf24' },
    { label: 'To Do',       value: tasks.filter(t => t.status === 'todo').length,        color: '#60a5fa' },
    { label: 'Overdue',     value: tasks.filter(t => t.status === 'overdue').length,     color: '#f87171' },
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
      name: clients.find(c => c.id === clientId)?.name ?? 'Unknown',
      revenue,
    }))

  // ── Team performance ────────────────────────────────────────────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const memberMap: Record<string, {
    id: string; name: string; role: string
    total: number; done: number; inProgress: number; review: number; overdue: number; doneThisMonth: number
  }> = {}

  for (const t of teamTasks) {
    const uid  = t.assigned_to as string
    const info = (t as any).assignee as { display_name?: string; role?: string } | null
    if (!memberMap[uid]) {
      memberMap[uid] = {
        id: uid,
        name: info?.display_name ?? 'Team Member',
        role: info?.role ?? '',
        total: 0, done: 0, inProgress: 0, review: 0, overdue: 0, doneThisMonth: 0,
      }
    }
    const m = memberMap[uid]
    m.total++
    if (t.status === 'done')        { m.done++;       if (t.updated_at >= monthStart) m.doneThisMonth++ }
    if (t.status === 'in_progress') m.inProgress++
    if (t.status === 'review')      m.review++
    if (t.status === 'overdue')     m.overdue++
  }

  const teamPerformance = Object.values(memberMap)
    .map(m => ({ ...m, completionRate: m.total > 0 ? Math.round((m.done / m.total) * 100) : 0 }))
    .sort((a, b) => b.completionRate - a.completionRate || b.done - a.done)

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalRevenue      = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const pendingRevenue    = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const paidCount         = invoices.filter(i => i.status === 'paid').length
  const collectionRate    = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 100) : 0
  const completedTasks    = tasks.filter(t => t.status === 'done').length
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

  // ── Advanced Analytics ──────────────────────────────────────────────────────

  // Monthly growth %: current month vs previous month revenue
  const thisMonthKey = monthEntries[5].key
  const lastMonthKey = monthEntries[4].key
  const thisMonthRev = revenueByMonth[thisMonthKey] ?? 0
  const lastMonthRev = revenueByMonth[lastMonthKey] ?? 0
  const monthlyGrowthPct = lastMonthRev > 0
    ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
    : thisMonthRev > 0 ? 100 : 0

  // Client LTV (avg total paid revenue per paying client)
  const payingClients = new Set(invoices.filter(i => i.status === 'paid').map(i => i.client_id))
  const avgClientLTV = payingClients.size > 0 ? Math.round(totalRevenue / payingClients.size) : 0

  // Avg payment terms (issued_date → due_date)
  const paidInvoicesWithDates = invoices.filter(i => i.status === 'paid' && i.issued_date && i.due_date)
  const avgDaysToPayment = paidInvoicesWithDates.length > 0
    ? Math.round(
        paidInvoicesWithDates.reduce((sum, inv) => {
          const issued = new Date(inv.issued_date).getTime()
          const due    = new Date(inv.due_date).getTime()
          return sum + (due - issued) / 86_400_000
        }, 0) / paidInvoicesWithDates.length
      )
    : 0

  // Task priority breakdown
  const tasksByPriority = [
    { label: 'Urgent', value: tasks.filter(t => t.priority === 'urgent').length, color: '#ef4444' },
    { label: 'High',   value: tasks.filter(t => t.priority === 'high').length,   color: '#f97316' },
    { label: 'Medium', value: tasks.filter(t => t.priority === 'medium').length, color: '#eab308' },
    { label: 'Low',    value: tasks.filter(t => t.priority === 'low').length,    color: '#22c55e' },
  ]

  // New clients per month (last 6 months)
  const newClientsByMonth: Record<string, number> = {}
  for (const { key } of monthEntries) newClientsByMonth[key] = 0
  for (const c of clients) {
    if (!c.created_at) continue
    const d   = new Date(c.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key in newClientsByMonth) newClientsByMonth[key]++
  }
  const newClientsOverTime = monthEntries.map(({ key, label }) => ({ label, value: newClientsByMonth[key] }))

  return NextResponse.json({
    monthlyRevenue, invoiceStatus, taskStatus, topClients, teamPerformance,
    tasksByPriority, newClientsOverTime,
    kpis: {
      totalRevenue, pendingRevenue, collectionRate, taskCompletionRate,
      totalClients: clients.length,
      activeClients: clients.filter(c => c.status === 'active').length,
      totalTasks: tasks.length,
      completedTasks,
      monthlyGrowthPct,
      avgClientLTV,
      avgDaysToPayment,
    },
  })
}
