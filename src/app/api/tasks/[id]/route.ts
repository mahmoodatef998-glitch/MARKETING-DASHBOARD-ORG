export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { updateNotionTask, deleteNotionPage } from '@/lib/notion'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { parseBody, TaskUpdateSchema } from '@/lib/validation'
import { logActivity } from '@/lib/activity-log'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = parseBody(TaskUpdateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const updated: Record<string, unknown> = {
    title:       body.title,
    description: body.description ?? null,
    status:      body.status,
    priority:    body.priority,
    task_type:   body.task_type   ?? null,
    due_date:    body.due_date    ?? null,
    assigned_to: body.assigned_to ?? null,
    client_id:   body.client_id   ?? null,
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

  // ── When task is re-assigned → notify new team member ─────────────────────
  const assigneeChanged = oldTask?.assigned_to !== body.assigned_to && !!body.assigned_to
  if (assigneeChanged && body.assigned_to) {
    try {
      const adminForAssign = createAdminClient()
      const { data: authUser } = await adminForAssign.auth.admin.getUserById(body.assigned_to as string)
      const memberEmail = authUser?.user?.email
      if (memberEmail) {
        await sendEmail({
          to:      memberEmail,
          subject: `📋 Task assigned to you: "${data.title}"`,
          body: [
            `A task has been assigned to you:`,
            ``,
            `  Title:    ${data.title}`,
            data.description ? `  Details:  ${data.description}` : null,
            `  Priority: ${data.priority}`,
            `  Status:   ${data.status}`,
            data.due_date ? `  Due:      ${data.due_date}` : null,
            data.client?.name ? `  Client:   ${data.client.name}` : null,
            data.revision_notes ? `\nRevision notes:\n${data.revision_notes}` : null,
            ``,
            `Log in to your portal to get started.`,
          ].filter(Boolean).join('\n'),
        })
      }
    } catch (e: any) {
      console.error('[tasks PUT] assign notify failed:', e.message)
    }
  }

  // ── When task moves to review → notify client to approve ──────────────────
  const justReview = oldTask?.status !== 'review' && body.status === 'review'
  if (justReview && data?.client?.email) {
    const admin = createAdminClient()
    const clientName  = data.client.name
    const clientEmail = data.client.email
    const details = [
      `Task: ${data.title}`,
      data.description ? `Description: ${data.description}` : null,
      `Type: ${data.task_type?.replace(/_/g, ' ') ?? 'General'}`,
      `Priority: ${data.priority}`,
      data.due_date ? `Due date: ${data.due_date}` : null,
      data.delivery_url ? `Delivery link: ${data.delivery_url}` : null,
    ].filter(Boolean).join('\n')

    try {
      const { subject, body: emailBody } = await generateEmailContent({
        type:          'task_review_ready',
        recipientName: clientName,
        details,
      })
      await sendEmail({ to: clientEmail, subject, body: emailBody })
      await admin.from('automation_logs').insert({
        type:            'task_review_ready',
        recipient_email: clientEmail,
        subject,
        status:          'sent',
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await admin.from('automation_logs').insert({
        type:            'task_review_ready',
        recipient_email: clientEmail,
        subject:         `Task "${data.title}" ready for review`,
        status:          'failed',
        error:           msg,
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
    }
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

  // Log activity
  const { data: { user } } = await supabase.auth.getUser()
  if (body.status && oldTask?.status !== body.status) {
    await logActivity({
      supabase: createAdminClient(),
      userId:     user?.id,
      action:     'task.status_changed',
      entityType: 'task',
      entityId:   id,
      entityName: data?.title,
      oldValue:   { status: oldTask?.status },
      newValue:   { status: body.status },
    })
  } else if (user) {
    await logActivity({
      supabase: createAdminClient(),
      userId:     user.id,
      action:     'task.updated',
      entityType: 'task',
      entityId:   id,
      entityName: data?.title,
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data } = await supabase.from('tasks').select('notion_id, title').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  // Soft delete — preserves data for audit trail and undo
  const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  await logActivity({
    supabase: createAdminClient(),
    userId:     user?.id,
    action:     'task.deleted',
    entityType: 'task',
    entityId:   id,
    entityName: data?.title,
  })

  return NextResponse.json({ success: true })
}
