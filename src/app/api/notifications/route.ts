export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export interface Notification {
  id: string
  type: 'overdue_task' | 'overdue_invoice' | 'task_due_today' | 'automation_failed'
  title: string
  message: string
  severity: 'error' | 'warning' | 'info'
  link?: string
  count?: number
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  let tasksQuery = supabase
    .from('tasks')
    .select('id, title, status, due_date')
    .in('status', ['overdue', 'todo', 'in_progress'])
    .is('deleted_at', null)
  let invoicesQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, total')
    .eq('status', 'overdue')

  if (isClient) {
    if (!profile.client_id) return NextResponse.json([])
    tasksQuery   = tasksQuery.eq('client_id', profile.client_id)
    invoicesQuery = invoicesQuery.eq('client_id', profile.client_id)
  }

  const [tasksRes, invoicesRes, logsRes] = await Promise.all([
    tasksQuery,
    invoicesQuery,
    isClient
      ? Promise.resolve({ data: [] })
      : supabase
          .from('automation_logs')
          .select('id, type, subject, status, created_at')
          .eq('status', 'failed')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(3),
  ])

  const notifications: Notification[] = []

  // ── Overdue tasks → grouped ────────────────────────────────────────────────
  const overdueTasks = (tasksRes.data ?? []).filter(t => t.status === 'overdue')
  if (overdueTasks.length === 1) {
    notifications.push({
      id:       `task-overdue-${overdueTasks[0].id}`,
      type:     'overdue_task',
      title:    'Overdue Task',
      message:  overdueTasks[0].title,
      severity: 'error',
      link:     '/tasks',
    })
  } else if (overdueTasks.length > 1) {
    const preview = overdueTasks.slice(0, 2).map(t => t.title).join(', ')
    notifications.push({
      id:       'tasks-overdue-group',
      type:     'overdue_task',
      title:    `${overdueTasks.length} Overdue Tasks`,
      message:  overdueTasks.length > 2 ? `${preview} +${overdueTasks.length - 2} more` : preview,
      severity: 'error',
      link:     '/tasks',
      count:    overdueTasks.length,
    })
  }

  // ── Due today → individual (high signal, max 3) ───────────────────────────
  const dueTodayTasks = (tasksRes.data ?? []).filter(t => t.due_date === today && t.status !== 'overdue')
  for (const task of dueTodayTasks.slice(0, 3)) {
    notifications.push({
      id:       `task-due-${task.id}`,
      type:     'task_due_today',
      title:    'Due Today',
      message:  task.title,
      severity: 'warning',
      link:     '/tasks',
    })
  }
  if (dueTodayTasks.length > 3) {
    notifications.push({
      id:       'tasks-due-today-group',
      type:     'task_due_today',
      title:    `+${dueTodayTasks.length - 3} more due today`,
      message:  'Check the tasks page for the full list',
      severity: 'warning',
      link:     '/tasks',
      count:    dueTodayTasks.length - 3,
    })
  }

  // ── Overdue invoices → grouped ─────────────────────────────────────────────
  const overdueInvoices = invoicesRes.data ?? []
  if (overdueInvoices.length === 1) {
    notifications.push({
      id:       `invoice-overdue-${overdueInvoices[0].id}`,
      type:     'overdue_invoice',
      title:    'Invoice Overdue',
      message:  `#${overdueInvoices[0].invoice_number} — $${overdueInvoices[0].total.toFixed(2)}`,
      severity: 'error',
      link:     '/invoices',
    })
  } else if (overdueInvoices.length > 1) {
    const total = overdueInvoices.reduce((s, i) => s + (i.total ?? 0), 0)
    notifications.push({
      id:       'invoices-overdue-group',
      type:     'overdue_invoice',
      title:    `${overdueInvoices.length} Invoices Overdue`,
      message:  `Total outstanding: $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      severity: 'error',
      link:     '/invoices',
      count:    overdueInvoices.length,
    })
  }

  // ── Automation failures → individual (already capped at 3) ────────────────
  for (const log of logsRes.data ?? []) {
    notifications.push({
      id:       `auto-failed-${log.id}`,
      type:     'automation_failed',
      title:    'Automation Failed',
      message:  log.subject,
      severity: 'warning',
      link:     '/automation',
    })
  }

  return NextResponse.json(notifications)
}
