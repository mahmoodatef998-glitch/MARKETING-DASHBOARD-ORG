export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { generateAndSendInvoice, toDateStr, type CycleType } from '@/lib/invoice-automation'
import { rateLimit } from '@/lib/rate-limit'
import { sendSlack } from '@/lib/slack'

// Vercel cron: runs daily at 9:00 AM UTC
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 9 * * *" }] }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron) {
    // Rate-limit manual triggers: 5 per hour per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rl = rateLimit(ip, { limit: 5, window: 60 * 60_000 })
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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

  // ── Wrap entire cron in try/catch so failures trigger an admin alert ─────────
  try {

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
      // Slack mirror for 48h/24h reminders
      if (type === 'task_reminder_48h' || type === 'task_reminder_24h') {
        try { await sendSlack(`⏰ *${type === 'task_reminder_48h' ? '48h' : '24h'} reminder* sent to ${name}: task "${opts.details.split('\n')[0].replace('Task: ', '')}"`) } catch {}
      }
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
  // Send invoice 2 days before the due date so the client has time to pay
  const d2before = new Date(now); d2before.setDate(d2before.getDate() + 2)
  const date2before = toDateStr(d2before)

  const { data: duePlans } = await supabase
    .from('billing_plans')
    .select('*, client:clients(id, name, email)')
    .eq('is_active', true)
    .neq('cycle_type', 'manual')
    .lte('next_invoice_date', date2before)

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
        .eq('approval_status', 'admin_approved')
        .is('deleted_at', null)
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
        dueDate:        plan.next_invoice_date, // actual payment due date
      })

      await supabase.from('automation_logs').insert({
        type:            'auto_invoice',
        recipient_email: plan.client.email,
        subject:         `Invoice generated for ${plan.client.name}`,
        status:          'sent',
        created_at:      now.toISOString(),
      })
      results.push({ type: 'auto_invoice', recipient: plan.client.email, status: 'sent' })
    } catch (err: any) {
      console.error('[cron] auto_invoice failed:', err.message)
      try {
        await supabase.from('automation_logs').insert({
          type:            'auto_invoice',
          recipient_email: plan.client.email,
          subject:         `Invoice generation failed for ${plan.client.name}`,
          status:          'failed',
          error:           err.message,
          created_at:      now.toISOString(),
        })
      } catch {}
      results.push({ type: 'auto_invoice', recipient: plan.client.email, status: 'failed' })
    }
  }

  // ── 2. Payment reminders for overdue sent invoices ─────────────────────────
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('*, client:clients(*)')
    .eq('status', 'sent')
    .is('deleted_at', null)
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

  // ── 2b. 3-day invoice due reminder ───────────────────────────────────────
  const d3days = new Date(now); d3days.setDate(d3days.getDate() + 3)
  const date3d = toDateStr(d3days)

  const { data: invoicesDue3d } = await supabase
    .from('invoices')
    .select('*, client:clients(name, email)')
    .eq('status', 'sent')
    .eq('due_date', date3d)
    .is('reminder_3d_sent_at', null)
    .is('deleted_at', null)

  for (const invoice of invoicesDue3d ?? []) {
    const client = invoice.client as { name: string; email: string } | null
    if (!client?.email) continue
    try {
      const { subject, body } = await generateEmailContent({
        type: 'payment_reminder',
        recipientName: client.name,
        details: `Invoice #${invoice.invoice_number} for ${invoice.currency ?? 'AED'} ${invoice.total} is due in 3 days on ${invoice.due_date}. Please arrange payment to avoid any service interruptions.`,
      })
      await sendEmail({ to: client.email, subject: `[3 Days Left] ${subject}`, body })
      await supabase.from('invoices').update({ reminder_3d_sent_at: now.toISOString() }).eq('id', invoice.id)
      await supabase.from('automation_logs').insert({
        type: 'invoice_reminder_3d', recipient_email: client.email, subject, status: 'sent', created_at: now.toISOString(),
      })
      results.push({ type: 'invoice_reminder_3d', recipient: client.email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type: 'invoice_reminder_3d', recipient_email: client.email, subject: '3-day invoice reminder', status: 'failed', error: err.message, created_at: now.toISOString(),
      })
      results.push({ type: 'invoice_reminder_3d', recipient: client.email, status: 'failed' })
    }
  }

  // ── 2c. 1-day invoice due reminder ───────────────────────────────────────
  const d1day = new Date(now); d1day.setDate(d1day.getDate() + 1)
  const date1d = toDateStr(d1day)

  const { data: invoicesDue1d } = await supabase
    .from('invoices')
    .select('*, client:clients(name, email)')
    .eq('status', 'sent')
    .eq('due_date', date1d)
    .is('reminder_1d_sent_at', null)
    .is('deleted_at', null)

  for (const invoice of invoicesDue1d ?? []) {
    const client = invoice.client as { name: string; email: string } | null
    if (!client?.email) continue
    try {
      const { subject, body } = await generateEmailContent({
        type: 'payment_reminder',
        recipientName: client.name,
        details: `URGENT: Invoice #${invoice.invoice_number} for ${invoice.currency ?? 'AED'} ${invoice.total} is due TOMORROW on ${invoice.due_date}.`,
      })
      await sendEmail({ to: client.email, subject: `[Due Tomorrow] ${subject}`, body })
      await supabase.from('invoices').update({ reminder_1d_sent_at: now.toISOString() }).eq('id', invoice.id)
      await supabase.from('automation_logs').insert({
        type: 'invoice_reminder_1d', recipient_email: client.email, subject, status: 'sent', created_at: now.toISOString(),
      })
      results.push({ type: 'invoice_reminder_1d', recipient: client.email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type: 'invoice_reminder_1d', recipient_email: client.email, subject: '1-day invoice reminder', status: 'failed', error: err.message, created_at: now.toISOString(),
      })
      results.push({ type: 'invoice_reminder_1d', recipient: client.email, status: 'failed' })
    }
  }

  // ── 3. Overdue task status update ─────────────────────────────────────────
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .not('status', 'in', '("done","overdue")')
    .is('deleted_at', null)
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
      try {
        await supabase.from('automation_logs').insert({
          type:            'task_reminder',
          recipient_email: task.assigned_to,
          subject:         'Overdue Task Reminder',
          status:          'failed',
          error:           err.message,
          task_id:         task.id,
          created_at:      now.toISOString(),
        })
      } catch {}
      results.push({ type: 'task_reminder', recipient: task.assigned_to, status: 'failed' })
    }
  }

  // ── 4. 48-hour advance reminders ──────────────────────────────────────────
  const { data: tasks48h } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name), client:clients(id, name, email)')
    .eq('due_date', date48h)
    .is('reminder_48h_sent_at', null)
    .is('deleted_at', null)
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
    .is('deleted_at', null)
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
    .is('deleted_at', null)
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

  // ── 7. Weekly client report (Sundays only) ────────────────────────────────
  if (now.getDay() === 0) {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)
    const weekStartStr = toDateStr(weekStart)

    const { data: activeClients } = await supabase
      .from('clients')
      .select('id, name, email')
      .eq('status', 'active')
      .is('deleted_at', null)

    for (const client of activeClients ?? []) {
      try {
        const [doneTasks, pendingTasks, overdueCount] = await Promise.all([
          supabase.from('tasks').select('title, task_type').eq('client_id', client.id).eq('status', 'done').is('deleted_at', null).gte('updated_at', weekStartStr),
          supabase.from('tasks').select('title, due_date').eq('client_id', client.id).in('status', ['todo', 'in_progress', 'review']).is('deleted_at', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('status', 'overdue').is('deleted_at', null),
        ])

        const completedList = (doneTasks.data ?? []).map(t => `• ${t.title}`).join('\n') || 'No tasks completed this week'
        const upcomingList  = (pendingTasks.data ?? []).slice(0, 5).map(t => `• ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n') || 'No pending tasks'

        const details = [
          `Week: ${weekStartStr} → ${today}`,
          `Completed this week (${doneTasks.data?.length ?? 0} tasks):\n${completedList}`,
          `Upcoming (${pendingTasks.data?.length ?? 0} tasks):\n${upcomingList}`,
          overdueCount.count ? `⚠️ Overdue tasks: ${overdueCount.count}` : null,
        ].filter(Boolean).join('\n\n')

        const { subject, body } = await generateEmailContent({
          type:          'weekly_report',
          recipientName: client.name,
          details,
        })

        await sendEmail({ to: client.email, subject, body })
        await supabase.from('automation_logs').insert({
          type:            'weekly_report',
          recipient_email: client.email,
          subject,
          status:          'sent',
          created_at:      now.toISOString(),
        })
        results.push({ type: 'weekly_report', recipient: client.email, status: 'sent' })
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type:            'weekly_report',
          recipient_email: client.email,
          subject:         'Weekly Progress Report',
          status:          'failed',
          error:           err.message,
          created_at:      now.toISOString(),
        })
        results.push({ type: 'weekly_report', recipient: client.email, status: 'failed' })
      }
    }
  }

  // ── 7b. Monthly client report (1st of each month) ────────────────────────
  if (now.getDate() === 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
    const monthStartStr = toDateStr(monthStart)
    const monthEndStr   = toDateStr(monthEnd)
    const monthLabel    = monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' })

    const { data: activeClientsM } = await supabase
      .from('clients')
      .select('id, name, email')
      .eq('status', 'active')
      .is('deleted_at', null)

    for (const client of activeClientsM ?? []) {
      try {
        const [doneTasks, paidInvoices, totalInvoices] = await Promise.all([
          supabase.from('tasks').select('title, task_type').eq('client_id', client.id).eq('status', 'done').is('deleted_at', null).gte('updated_at', monthStartStr).lte('updated_at', monthEndStr + 'T23:59:59Z'),
          supabase.from('invoices').select('invoice_number, total, received_amount').eq('client_id', client.id).eq('status', 'paid').is('deleted_at', null).gte('received_at', monthStartStr).lte('received_at', monthEndStr + 'T23:59:59Z'),
          supabase.from('invoices').select('invoice_number, total, status').eq('client_id', client.id).in('status', ['sent', 'overdue', 'paid']).is('deleted_at', null).gte('issued_date', monthStartStr).lte('issued_date', monthEndStr),
        ])

        const completedList = (doneTasks.data ?? []).map(t => `• ${t.title}`).join('\n') || 'No tasks completed'
        const totalPaid = (paidInvoices.data ?? []).reduce((s, i) => s + (i.received_amount ?? i.total), 0)
        const unpaidCount = (totalInvoices.data ?? []).filter(i => i.status !== 'paid').length

        const details = [
          `Monthly Report: ${monthLabel}`,
          ``,
          `✅ Completed Tasks (${doneTasks.data?.length ?? 0}):\n${completedList}`,
          ``,
          `💰 Payments: ${totalPaid > 0 ? `${totalPaid.toLocaleString()} paid this month` : 'No payments recorded'}`,
          unpaidCount > 0 ? `⚠️ Outstanding invoices: ${unpaidCount}` : '',
        ].filter(Boolean).join('\n')

        const { subject, body } = await generateEmailContent({
          type: 'weekly_report',
          recipientName: client.name,
          details,
        })

        await sendEmail({ to: client.email, subject: `Monthly Report — ${monthLabel}`, body })
        await supabase.from('automation_logs').insert({
          type: 'monthly_report', recipient_email: client.email, subject: `Monthly Report — ${monthLabel}`, status: 'sent', created_at: now.toISOString(),
        })
        results.push({ type: 'monthly_report', recipient: client.email, status: 'sent' })
      } catch (err: any) {
        await supabase.from('automation_logs').insert({
          type: 'monthly_report', recipient_email: client.email, subject: `Monthly Report — ${monthLabel}`, status: 'failed', error: err.message, created_at: now.toISOString(),
        })
        results.push({ type: 'monthly_report', recipient: client.email, status: 'failed' })
      }
    }
  }

  // ── 8. Package renewal alerts (7 days before end_date) ───────────────────
  const in7days = new Date(now); in7days.setDate(in7days.getDate() + 7)
  const in7str  = toDateStr(in7days)

  const { data: expiringPackages } = await supabase
    .from('client_packages')
    .select('id, name, end_date, client:clients(id, name, email)')
    .eq('is_active', true)
    .eq('end_date', in7str)

  for (const pkg of expiringPackages ?? []) {
    const client = pkg.client as unknown as { id: string; name: string; email: string } | null
    if (!client?.email) continue
    try {
      await sendEmail({
        to:      client.email,
        subject: `Your package "${pkg.name}" expires in 7 days`,
        body: [
          `Dear ${client.name},`,
          ``,
          `Your package "${pkg.name}" is set to expire on ${pkg.end_date}.`,
          ``,
          `Please contact us to renew your package and ensure uninterrupted service.`,
          ``,
          `Best regards,`,
          process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency',
        ].join('\n'),
      })
      await supabase.from('automation_logs').insert({
        type:            'package_renewal_alert',
        recipient_email: client.email,
        subject:         `Package "${pkg.name}" expires in 7 days`,
        status:          'sent',
        created_at:      now.toISOString(),
      })
      results.push({ type: 'package_renewal_alert', recipient: client.email, status: 'sent' })
    } catch (err: any) {
      try {
        await supabase.from('automation_logs').insert({
          type:            'package_renewal_alert',
          recipient_email: client.email,
          subject:         `Package renewal alert failed for ${client.name}`,
          status:          'failed',
          error:           err.message,
          created_at:      now.toISOString(),
        })
      } catch {}
      results.push({ type: 'package_renewal_alert', recipient: client.email, status: 'failed' })
    }
  }

  // ── 9. Data Retention Policy ─────────────────────────────────────────────
  try {
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const oneYearAgo  = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const twoYearsAgoStr  = twoYearsAgo.toISOString()
    const oneYearAgoStr   = oneYearAgo.toISOString()
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString()

    // Soft-delete paid invoices older than 2 years
    await supabase
      .from('invoices')
      .update({ deleted_at: now.toISOString() })
      .eq('status', 'paid')
      .is('deleted_at', null)
      .lt('updated_at', twoYearsAgoStr)

    // Soft-delete done/overdue tasks older than 1 year
    await supabase
      .from('tasks')
      .update({ deleted_at: now.toISOString() })
      .in('status', ['done', 'overdue'])
      .is('deleted_at', null)
      .lt('updated_at', oneYearAgoStr)

    // Hard-delete automation_logs older than 90 days
    await supabase
      .from('automation_logs')
      .delete()
      .lt('created_at', ninetyDaysAgoStr)

    // Hard-delete audit_logs older than 365 days
    await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', oneYearAgoStr)
  } catch (retentionErr: unknown) {
    console.error('[cron] data retention failed:', retentionErr instanceof Error ? retentionErr.message : String(retentionErr))
  }

    // ── Log successful run + ping external monitor ─────────────────────────────
    try {
      await supabase.from('automation_logs').insert({
        type:    'cron_health',
        subject: `Daily cron completed: ${results.length} actions`,
        status:  'success',
        created_at: now.toISOString(),
      })
    } catch {}

    if (process.env.CRON_MONITOR_URL) {
      try { await fetch(process.env.CRON_MONITOR_URL) } catch {}
    }

    return NextResponse.json({ success: true, processed: results.length, results })

  } catch (cronErr: unknown) {
    const errMsg = cronErr instanceof Error ? cronErr.message : String(cronErr)
    console.error('[cron/daily] FATAL ERROR:', errMsg)

    // Log failure
    try {
      await supabase.from('automation_logs').insert({
        type:    'cron_health',
        subject: 'Daily cron FAILED',
        status:  'failed',
        error:   errMsg,
        created_at: now.toISOString(),
      })
    } catch {}

    // Alert admin via email
    const adminEmail = process.env.GMAIL_SENDER_EMAIL
    if (adminEmail) {
      try {
        await sendEmail({
          to:      adminEmail,
          subject: `⚠️ URGENT: Daily Cron Failed — ${today}`,
          body:    `The daily automation cron job failed with the following error:\n\n${errMsg}\n\nPlease check the server logs and fix immediately to avoid missed invoices and reminders.`,
        })
      } catch {}
    }

    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
