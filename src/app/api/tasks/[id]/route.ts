export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { updateNotionTask, deleteNotionPage } from '@/lib/notion'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { dbError } from '@/lib/utils'
import { sendSlack } from '@/lib/slack'
import { parseBody, TaskUpdateSchema } from '@/lib/validation'
import { logActivity } from '@/lib/activity-log'
import { logAudit } from '@/lib/audit'
import { sendPushNotification, type PushSubscription } from '@/lib/webpush'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: putProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (putProfile?.role === 'client') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  // Team members can only update tasks assigned to them
  if (['video_maker', 'designer', 'ai_video'].includes(putProfile?.role ?? '')) {
    const adminCheck = createAdminClient()
    const { data: taskCheck } = await adminCheck
      .from('tasks')
      .select('assigned_to')
      .eq('id', id)
      .is('deleted_at', null)
      .single()
    if (!taskCheck || taskCheck.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const parsed = parseBody(TaskUpdateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const updated: Record<string, unknown> = {
    title:               body.title,
    description:         body.description         || null,
    status:              body.status,
    priority:            body.priority,
    task_type:           body.task_type           || null,
    due_date:            body.due_date            || null,
    assigned_to:         body.assigned_to         || null,
    client_id:           body.client_id           || null,
    hook:                  body.hook                  || null,
    delivery_url:          body.delivery_url          || null,
    reference_image_url:   body.reference_image_url   || null,
    scheduled_publish_at:  body.scheduled_publish_at  || null,
    updated_at:            new Date().toISOString(),
  }

  // Fetch old state before update
  const { data: oldTask } = await supabase
    .from('tasks')
    .select('status, client_id, title, description, priority, due_date, assigned_to, scheduled_publish_at, started_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  // Auto-queue for admin approval when any task is marked done
  if (body.status === 'done' && oldTask?.status !== 'done') {
    updated.approval_status = 'pending'
  }

  // Time tracking: record when work starts and when it finishes
  const now = new Date().toISOString()
  if (body.status === 'in_progress' && oldTask?.status !== 'in_progress' && !oldTask?.started_at) {
    updated.started_at = now
  }
  if (body.status === 'done' && oldTask?.status !== 'done') {
    updated.completed_at = now
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updated)
    .eq('id', id)
    .select('*, client:clients(id, name, email), assignee:profiles!assigned_to(id, display_name)')
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionTask(data.notion_id, updated) } catch {}
  }

  // ── When task moves to "review" → notify client ───────────────────────────
  const justReview = oldTask?.status !== 'review' && body.status === 'review'
  if (justReview && data?.client?.email) {
    const admin = createAdminClient()
    const details = [
      `Task: ${data.title}`,
      data.description ? `Description: ${data.description}` : null,
      `Priority: ${data.priority}`,
      data.due_date ? `Due date: ${data.due_date}` : null,
    ].filter(Boolean).join('\n')
    try {
      const { subject, body: emailBody } = await generateEmailContent({
        type:          'task_in_review',
        recipientName: data.client.name,
        details,
      })
      await sendEmail({ to: data.client.email, subject, body: emailBody })
      await admin.from('automation_logs').insert({
        type: 'task_in_review', recipient_email: data.client.email,
        subject, status: 'sent', task_id: id, created_at: new Date().toISOString(),
      })
    } catch {}
    try { await sendSlack(`🔍 *Task ready for review*: "${data.title}" — client: ${data.client.name}`) } catch {}
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

  // ── When task is assigned/reassigned → notify new team member ────────────────
  const assigneeChanged = body.assigned_to && body.assigned_to !== oldTask?.assigned_to
  if (assigneeChanged && data) {
    const admin2 = createAdminClient()
    let memberEmail: string | undefined
    try {
      const { data: authUser } = await admin2.auth.admin.getUserById(body.assigned_to as string)
      memberEmail = authUser?.user?.email
      if (memberEmail) {
        const memberName = data.assignee?.display_name ?? memberEmail
        const details = [
          `Task: ${data.title}`,
          data.description ? `Description: ${data.description}` : null,
          `Priority: ${data.priority}`,
          data.due_date ? `Due date: ${data.due_date}` : null,
          data.client?.name ? `Client: ${data.client.name}` : null,
        ].filter(Boolean).join('\n')

        const { subject, body: emailBody } = await generateEmailContent({
          type:          'task_assigned',
          recipientName: memberName,
          details,
        })

        await sendEmail({ to: memberEmail, subject, body: emailBody })
        await admin2.from('automation_logs').insert({
          type:            'task_assigned',
          recipient_email: memberEmail,
          subject,
          status:          'sent',
          task_id:         id,
          created_at:      new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[tasks] assignment email failed:', err)
      try {
        await admin2.from('automation_logs').insert({
          type:            'task_assigned',
          recipient_email: memberEmail ?? (body.assigned_to as string) ?? '',
          subject:         `Task assigned: ${data.title}`,
          status:          'failed',
          error:           err instanceof Error ? err.message : String(err),
          task_id:         id,
          created_at:      new Date().toISOString(),
        })
      } catch {}
    }
  }

  // ── When scheduled_publish_at is set/changed → notify all media_buyers ──────
  const publishDateChanged =
    body.scheduled_publish_at !== undefined &&
    body.scheduled_publish_at !== (oldTask?.scheduled_publish_at ?? null) &&
    !!body.scheduled_publish_at

  if (publishDateChanged) {
    const notifyAdmin = createAdminClient()
    try {
      const { data: mediaBuyers } = await notifyAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'media_buyer')

      const mediaBuyerIds = (mediaBuyers ?? []).map((p: { id: string }) => p.id)

      if (mediaBuyerIds.length > 0) {
        const clientName = (data as { client?: { name?: string } | null })?.client?.name ?? 'Unknown Client'
        const taskName   = (data as { title?: string })?.title ?? 'Unknown Task'
        const publishDateStr = new Date(body.scheduled_publish_at as string).toLocaleString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })

        // Inbox message to each media_buyer
        const msgContent = `📅 Publish Date Scheduled\nTask: ${taskName}\nClient: ${clientName}\nScheduled for: ${publishDateStr}`
        await Promise.allSettled(
          mediaBuyerIds.map((mbId: string) =>
            notifyAdmin.from('messages').insert({
              sender_id:   user.id,
              receiver_id: mbId,
              content:     msgContent,
            })
          )
        )

        // Push notification to media_buyers
        const { data: subs } = await notifyAdmin
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .in('user_id', mediaBuyerIds)

        await Promise.allSettled(
          (subs ?? []).map((s: { endpoint: string; p256dh: string; auth: string }) =>
            sendPushNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as PushSubscription,
              {
                title: '📅 Publish Date Scheduled',
                body:  `${taskName} — ${clientName}\n${publishDateStr}`,
                url:   '/tasks',
                icon:  '/icon-192.png',
              }
            )
          )
        )
      }
    } catch (err) {
      console.error('[tasks] publish date notification failed:', err)
    }
  }

  // Audit log — record what changed with before/after snapshot
  await logAudit({
    userId:    user?.id,
    userEmail: user?.email,
    action:    'update',
    tableName: 'tasks',
    recordId:  id,
    oldValue:  oldTask as Record<string, unknown> ?? undefined,
    newValue:  { title: data?.title, status: data?.status, priority: data?.priority, assigned_to: data?.assigned_to, due_date: data?.due_date, client_id: data?.client_id },
  })

  // Log activity
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: delProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (delProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data } = await supabase.from('tasks').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
