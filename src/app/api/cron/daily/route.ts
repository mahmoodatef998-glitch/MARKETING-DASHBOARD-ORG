export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'

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

  // ── Payment Reminders ─────────────────────────────────────────────────────
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

      // Update invoice status + log
      await supabase.from('invoices').update({ status: 'overdue' }).eq('id', invoice.id)
      await supabase.from('automation_logs').insert({
        type: 'payment_reminder',
        recipient_email: invoice.client.email,
        subject,
        status: 'sent',
        created_at: new Date().toISOString(),
      })

      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'sent' })
    } catch (err: any) {
      await supabase.from('automation_logs').insert({
        type: 'payment_reminder',
        recipient_email: invoice.client.email,
        subject: 'Payment Reminder',
        status: 'failed',
        error: err.message,
        created_at: new Date().toISOString(),
      })
      results.push({ type: 'payment_reminder', recipient: invoice.client.email, status: 'failed' })
    }
  }

  // ── Task Reminders ────────────────────────────────────────────────────────
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('*, assignee:team_members(*)')
    .not('status', 'eq', 'done')
    .lt('due_date', today)

  for (const task of overdueTasks ?? []) {
    if (!task.assignee?.email) continue
    try {
      const { subject, body } = await generateEmailContent({
        type: 'task_reminder',
        recipientName: task.assignee.name,
        details: `Task "${task.title}" (Priority: ${task.priority}) was due on ${task.due_date}`,
      })

      await sendEmail({ to: task.assignee.email, subject, body })
      await supabase.from('tasks').update({ status: 'overdue' }).eq('id', task.id)
      await supabase.from('automation_logs').insert({
        type: 'task_reminder',
        recipient_email: task.assignee.email,
        subject,
        status: 'sent',
        created_at: new Date().toISOString(),
      })

      results.push({ type: 'task_reminder', recipient: task.assignee.email, status: 'sent' })
    } catch (err: any) {
      results.push({ type: 'task_reminder', recipient: task.assignee.email, status: 'failed' })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}
