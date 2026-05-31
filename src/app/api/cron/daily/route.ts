export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { generateAndSendInvoice, toDateStr, type CycleType } from '@/lib/invoice-automation'

// Vercel cron: runs daily at 9:00 AM UTC
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 9 * * *" }] }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron) {
    // Allow logged-in admin users to trigger manually (for "Run Now" button)
    const { createServerClient } = await import('@/lib/supabase-server')
    const serverSupabase = await createServerClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await serverSupabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const now     = new Date()
  const today   = toDateStr(now)

  const d48h = new Date(now); d48h.setDate(d48h.getDate() + 2)
  const d24h = new Date(now); d24h.setDate(d24h.getDate() + 1)
  const date48h = toDateStr(d48h)
  const date24h = toDateStr(d24h)

  const results: { type: string; recipient: string; status: string }[] = []

  // ── Helper: send task email and log it ────────────────────────────────────
  async function sendTaskEmail(opts: {
    taskId:    string
    email:     string
    name:      string
    type:      'task_reminder_48h' | 'task_reminder_24h' | 'task_confirmation' | 'task_completed'
    details:   string
    flagField?: 'reminder_48h_sent_at' | 'reminder_24h_sent_at' | 'confirmation_sent_at'
  }) {
    const { taskId, email, name, type, details, flagField } = opts
    try {
      const { subject, body } = await generateEmailContent({ type, recipientName: name, details })
      await sendEmail({ to: email, subject, body })

      await supabase.from('automation_logs').insert({
        type,
        recipient_email: email,
        subject,
        status:     'sent',
        task_id:    taskId,
        created_at: now.toISOString(),
      })

      if (flagField) {
        await supabase.from('tasks').update({ [flagField]: now.toISOString() }).eq('id', taskId)
      }

      results.push({ type, recipient: email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type,
        recipient_email: email,
        subject:    type.replace(/_/g, ' '),
        status:     'failed',
        error:      err.message,
        task_id:    taskId,
        created_at: now.toISOString(),
      })
      results.push({ type, recipient: email, status: 'failed' })
    }
  }

  // ── Helper: build task detail string ─────────────────────────────────────
  function taskDetails(task: any): string {
    const parts = [
      `Task: ${task.title}`,
      task.description ? `Description: ${task.description}` : null,
      `Priority: ${task.priority}`,
      `Due date: ${task.due_date}`,
      `Status: ${task.status}`,
      task.client?.name  ? `Client: ${task.client.name}` : null,
      task.client?.email ? `Client email: ${task.client.email}` : null,
    ]
    return parts.filter(Boolean).join('\n')
  }

  // ── 1. Auto-generate invoices from billing plans ───────────────────────────
  const { data: duePlans } = await supabase
    .from('billing_plans')
    .select('*, client:clients(id, name, email)')
    .eq('is_active', true)
    .lte('next_invoice_date', today)

  for (const plan of duePlans ?? []) {
    if (!plan.client?.email) continue
    try {
      // Calculate period start to fetch completed tasks
      const periodStart = new Date(now)
      switch (plan.cycle_type as CycleType) {
        case 'monthly':       periodStart.setMonth(periodStart.getMonth() - 1); break
        case 'biweekly':      periodStart.setDate(periodStart.getDate() - 14); break
        case 'every_10_days': periodStart.setDate(periodStart.getDate() - 10); break
        case 'custom_days':   periodStart.setDate(periodStart.getDate() - (plan.custom_days ?? 30)); break
        default:              periodStart.setDate(periodStart.getDate() - 30);
      }

      const { data: doneTasks } = await supabase
        .from('tasks')
        .select('title, task_type, due_date')
        .eq('client_id', plan.client_id)
        .eq('status', 'done')
        .gte('updated_at', toDateStr(periodStart))

      await generateAndSendInvoice({
        supabase,
        clientId:       plan.client_id,
        clientEmail:    plan.client.email,
        clientName:     plan.client.name,
        amount:         plan.amount,
        currency:       plan.currency,
        billingPlanId:  plan.id,
        cycleType:      plan.cycle_type as CycleType,
        customDays:     plan.custom_days ?? undefined,
        completedTasks: doneTasks ?? [],
      })
      results.push({ type: 'auto_invoice', recipient: plan.client.email, status: 'sent' })
    } catch (err: any) {
      console.error('[cron] auto_invoice failed:', err.message)
      results.push({ type: 'auto_invoice', recipient: plan.client.email, status: 'failed' })
    }
  }

  // ── 2. Payment reminders for overdue sent invoices ─────────────────────────
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('*, client:clients(*)')
    .eq('status', 'sent')
    .lt('due_date', today)

  for (const invoice of overdueInvoices ?? []) {
    if (!invoice.client?.email) continue
    try {
      const { subject, body } = await generateEmailContent({
        type: 'payment_reminder',
        recipientName: invoice.client.name,
        details: `Invoice #${invoice.invoice_number} for $${invoice.total} was due on ${invoice.due_date}`,
      })

      await sendEmail({ to: invoice.client.email, subject, body })
      await supabase.from('invoices').update({ status: 'overdue' }).eq('id', invoice.id)
      await supabase.from('automation_logs').insert({
        type:            'payment_reminder',
        recipient_email: invoice.client.email,
        subject,
        status:          'sent',
        created_at:      now.toISOString(),
      })
      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type:            'payment_reminder',
        recipient_email: invoice.client.email,
        subject:         'Payment Reminder',
        status:          'failed',
        error:           err.message,
        created_at:      now.toISOString(),
      })
      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'failed' })
    }
  }

  // ── 3. Overdue task status update ─────────────────────────────────────────
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .not('status', 'in', '("done","overdue")')
    .lt('due_date', today)

  for (const task of overdueTasks ?? []) {
    if (!task.assigned_to) continue
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to)
      const email = authUser?.user?.email
      const name  = task.assignee?.display_name ?? email ?? 'Team Member'
      if (!email) continue

      const { subject, body } = await generateEmailContent({
        type:          'task_reminder',
        recipientName: name,
        details:       `Task "${task.title}" (Priority: ${task.priority}) was due on ${task.due_date}`,
      })

      await sendEmail({ to: email, subject, body })
      await supabase.from('tasks').update({ status: 'overdue' }).eq('id', task.id)
      await supabase.from('automation_logs').insert({
        type:            'task_reminder',
        recipient_email: email,
        subject,
        status:          'sent',
        task_id:         task.id,
        created_at:      now.toISOString(),
      })
      results.push({ type: 'task_reminder', recipient: email, status: 'sent' })
    } catch (err: any) {
      results.push({ type: 'task_reminder', recipient: task.assigned_to, status: 'failed' })
    }
  }

  // ── 4. 48-hour advance reminders ──────────────────────────────────────────
  const { data: tasks48h } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .eq('due_date', date48h)
    .is('reminder_48h_sent_at', null)
    .not('status', 'in', '("done","overdue")')
    .not('assigned_to', 'is', null)

  for (const task of tasks48h ?? []) {
    const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to).catch(() => ({ data: null }))
    const email = authUser?.user?.email
    const name  = task.assignee?.display_name ?? email ?? 'Team Member'
    if (!email) continue

    await sendTaskEmail({
      taskId:    task.id,
      email,
      name,
      type:      'task_reminder_48h',
      details:   taskDetails(task),
      flagField: 'reminder_48h_sent_at',
    })
  }

  // ── 5. 24-hour advance reminders ──────────────────────────────────────────
  const { data: tasks24h } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .eq('due_date', date24h)
    .is('reminder_24h_sent_at', null)
    .not('status', 'in', '("done","overdue")')
    .not('assigned_to', 'is', null)

  for (const task of tasks24h ?? []) {
    const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to).catch(() => ({ data: null }))
    const email = authUser?.user?.email
    const name  = task.assignee?.display_name ?? email ?? 'Team Member'
    if (!email) continue

    await sendTaskEmail({
      taskId:    task.id,
      email,
      name,
      type:      'task_reminder_24h',
      details:   taskDetails(task),
      flagField: 'reminder_24h_sent_at',
    })
  }

  // ── 6. Same-day confirmation requests ─────────────────────────────────────
  const { data: tasksToday } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .eq('due_date', today)
    .is('confirmation_sent_at', null)
    .not('status', 'in', '("done","overdue")')
    .not('assigned_to', 'is', null)

  for (const task of tasksToday ?? []) {
    const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to).catch(() => ({ data: null }))
    const email = authUser?.user?.email
    const name  = task.assignee?.display_name ?? email ?? 'Team Member'
    if (!email) continue

    await sendTaskEmail({
      taskId:    task.id,
      email,
      name,
      type:      'task_confirmation',
      details:   taskDetails(task),
      flagField: 'confirmation_sent_at',
    })
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}
