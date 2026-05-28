export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [invoicesRes, tasksRes, clientsRes, teamTasksRes] = await Promise.all([
    supabase.from('invoices').select('id, total, status, issued_date, client_id'),
    supabase.from('tasks').select('id, status, priority, assignee_id'),
    supabase.from('clients').select('id, name, status'),
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

  return NextResponse.json({
    monthlyRevenue, invoiceStatus, taskStatus, topClients, teamPerformance,
    kpis: {
      totalRevenue, pendingRevenue, collectionRate, taskCompletionRate,
      totalClients: clients.length,
      activeClients: clients.filter(c => c.status === 'active').length,
      totalTasks: tasks.length,
      completedTasks,
    },
  })
}
