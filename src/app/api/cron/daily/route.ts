export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { generateAndSendInvoice, type CycleType } from '@/lib/invoice-automation'

// Vercel cron: runs daily at 9:00 AM UTC
// vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 9 * * *" }] }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const results: { type: string; recipient: string; status: string }[] = []

  // ── 1. Auto-generate invoices from billing plans ───────────────────────────
  const { data: duePlans } = await supabase
    .from('billing_plans')
    .select('*, client:clients(id, name, email)')
    .eq('is_active', true)
    .lte('next_invoice_date', today)

  for (const plan of duePlans ?? []) {
    if (!plan.client?.email) continue
    try {
      await generateAndSendInvoice({
        supabase,
        clientId:      plan.client_id,
        clientEmail:   plan.client.email,
        clientName:    plan.client.name,
        amount:        plan.amount,
        currency:      plan.currency,
        billingPlanId: plan.id,
        cycleType:     plan.cycle_type as CycleType,
        customDays:    plan.custom_days ?? undefined,
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
        created_at:      new Date().toISOString(),
      })
      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type:            'payment_reminder',
        recipient_email: invoice.client.email,
        subject:         'Payment Reminder',
        status:          'failed',
        error:           err.message,
        created_at:      new Date().toISOString(),
      })
      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'failed' })
    }
  }

  // ── 3. Task reminders for overdue tasks (via profiles, not team_members) ───
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name)')
    .not('status', 'eq', 'done')
    .lt('due_date', today)

  for (const task of overdueTasks ?? []) {
    // Get the auth user's email from Supabase auth
    if (!task.assigned_to) continue
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to)
      const email = authUser?.user?.email
      const name  = task.assignee?.display_name ?? email ?? 'Team Member'
      if (!email) continue

      const { subject, body } = await generateEmailContent({
        type: 'task_reminder',
        recipientName: name,
        details: `Task "${task.title}" (Priority: ${task.priority}) was due on ${task.due_date}`,
      })

      await sendEmail({ to: email, subject, body })
      await supabase.from('tasks').update({ status: 'overdue' }).eq('id', task.id)
      await supabase.from('automation_logs').insert({
        type:            'task_reminder',
        recipient_email: email,
        subject,
        status:          'sent',
        created_at:      new Date().toISOString(),
      })
      results.push({ type: 'task_reminder', recipient: email, status: 'sent' })
    } catch (err: any) {
      results.push({ type: 'task_reminder', recipient: task.assigned_to, status: 'failed' })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}
