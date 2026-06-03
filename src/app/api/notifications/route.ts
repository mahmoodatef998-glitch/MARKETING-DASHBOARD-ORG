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
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const [tasksRes, invoicesRes, logsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, due_date')
      .in('status', ['overdue', 'todo', 'in_progress']),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total')
      .eq('status', 'overdue'),
    supabase
      .from('automation_logs')
      .select('id, type, subject, status, created_at')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const notifications: Notification[] = []

  for (const task of tasksRes.data ?? []) {
    if (task.status === 'overdue') {
      notifications.push({
        id: `task-overdue-${task.id}`,
        type: 'overdue_task',
        title: 'Overdue Task',
        message: task.title,
        severity: 'error',
        link: '/tasks',
      })
    } else if (task.due_date === today) {
      notifications.push({
        id: `task-due-${task.id}`,
        type: 'task_due_today',
        title: 'Due Today',
        message: task.title,
        severity: 'warning',
        link: '/tasks',
      })
    }
  }

  for (const inv of invoicesRes.data ?? []) {
    notifications.push({
      id: `invoice-overdue-${inv.id}`,
      type: 'overdue_invoice',
      title: 'Invoice Overdue',
      message: `#${inv.invoice_number} — $${inv.total.toFixed(2)}`,
      severity: 'error',
      link: '/invoices',
    })
  }

  for (const log of logsRes.data ?? []) {
    notifications.push({
      id: `auto-failed-${log.id}`,
      type: 'automation_failed',
      title: 'Automation Failed',
      message: log.subject,
      severity: 'warning',
      link: '/automation',
    })
  }

  return NextResponse.json(notifications)
}
