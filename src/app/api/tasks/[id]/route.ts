export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { updateNotionTask, deleteNotionPage } from '@/lib/notion'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const body = await req.json()

  // Normalize empty strings to null for optional FK / enum / date columns.
  // The form sends '' for unset selects; Supabase rejects them against CHECK/FK constraints.
  const updated: Record<string, unknown> = {
    title:       body.title,
    description: body.description || null,
    status:      body.status,
    priority:    body.priority,
    task_type:   body.task_type   || null,
    due_date:    body.due_date    || null,
    assigned_to: body.assigned_to || null,
    client_id:   body.client_id   || null,
    updated_at:  new Date().toISOString(),
  }

  // Fetch old status before update so we know if it changed to 'done'
  const { data: oldTask } = await supabase
    .from('tasks')
    .select('status, client_id, title, description, priority, due_date, assigned_to')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('tasks')
    .update(updated)
    .eq('id', id)
    .select('*, client:clients(id, name, email), assignee:profiles!assigned_to(id, display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionTask(data.notion_id, updated) } catch {}
  }

  // ── When task is marked done → notify client ───────────────────────────────
  const justCompleted = oldTask?.status !== 'done' && body.status === 'done'
  if (justCompleted && data?.client?.email) {
    const admin = createAdminClient()
    const clientName = data.client.name
    const clientEmail = data.client.email

    // Get team member name for the email
    let memberName = data.assignee?.display_name ?? 'Your team member'
    if (!data.assignee && data.assigned_to) {
      const { data: authUser } = await admin.auth.admin.getUserById(data.assigned_to).catch(() => ({ data: null }))
      if (authUser?.user?.email) memberName = authUser.user.email
    }

    const details = [
      `Task: ${data.title}`,
      data.description ? `Description: ${data.description}` : null,
      `Priority: ${data.priority}`,
      data.due_date ? `Due date: ${data.due_date}` : null,
      `Completed by: ${memberName}`,
      `Completed on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    ].filter(Boolean).join('\n')

    try {
      const { subject, body: emailBody } = await generateEmailContent({
        type:          'task_completed',
        recipientName: clientName,
        details,
      })

      await sendEmail({ to: clientEmail, subject, body: emailBody })

      await admin.from('automation_logs').insert({
        type:            'task_completed',
        recipient_email: clientEmail,
        subject,
        status:          'sent',
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
    } catch (err: unknown) {
      // Non-blocking — don't fail the status update if email fails
      const msg = err instanceof Error ? err.message : String(err)
      await admin.from('automation_logs').insert({
        type:            'task_completed',
        recipient_email: clientEmail,
        subject:         `Task "${data.title}" completed`,
        status:          'failed',
        error:           msg,
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
      console.error('[tasks] completion email failed:', msg)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data } = await supabase.from('tasks').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
