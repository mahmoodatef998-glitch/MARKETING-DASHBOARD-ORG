export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionTask } from '@/lib/notion'
import { generateId, dbError } from '@/lib/utils'
import { TaskCreateSchema, parseBody } from '@/lib/validation'
import { DEMO_TASKS } from '@/lib/demo-data'
import { sendSlack } from '@/lib/slack'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushNotification, type PushSubscription } from '@/lib/webpush'
import type { Task } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET(req: NextRequest) {
  if (DEMO) {
    const { searchParams } = new URL(req.url)
    let tasks = [...DEMO_TASKS]
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const assigneeId = searchParams.get('assignee_id')
    if (status) tasks = tasks.filter((t) => t.status === status)
    if (clientId) tasks = tasks.filter((t) => t.client_id === clientId)
    if (assigneeId) tasks = tasks.filter((t) => t.assignee_id === assigneeId)
    return NextResponse.json(tasks)
  }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id, team_member_id')
    .eq('id', user.id)
    .single()

  const { searchParams } = new URL(req.url)
  // Use admin client to bypass RLS — auth + role checks are enforced above
  const adminDb = createAdminClient()
  let query = adminDb
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id,display_name,role), client:clients(id,name,email)')
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  // Clients only see their own tasks — enforced server-side regardless of query params
  if (profile?.role === 'client') {
    if (!profile.client_id) return NextResponse.json([])
    query = query.eq('client_id', profile.client_id)
  } else if (['video_maker', 'designer', 'ai_video'].includes(profile?.role ?? '')) {
    // Team members only see tasks assigned to them — no override via query params
    query = query.eq('assigned_to', user.id)
    const status = searchParams.get('status')
    if (status) query = query.eq('status', status)
  } else {
    // admin + media_buyer: full visibility with optional filters
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const assignedTo = searchParams.get('assigned_to')
    const approvalStatus = searchParams.get('approval_status')
    if (status) query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
    if (approvalStatus) query = query.eq('approval_status', approvalStatus)
  }

  const { data, error } = await query
  if (error) {
    console.error('[tasks GET]', error.message)
    return NextResponse.json({ error: dbError(error) }, { status: 500 })
  }
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  })
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const { ok } = rateLimit(ip, { limit: 60, window: 60_000 })
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawBody = await req.json().catch(() => null)
  const parsed = parseBody(TaskCreateSchema, rawBody)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const b = parsed.data
  const task: Task = {
    id: generateId(),
    title:               b.title,
    description:         (b.description         as string | undefined) ?? undefined,
    status:              b.status              ?? 'todo',
    priority:            b.priority            ?? 'medium',
    task_type:           (b.task_type           as import('@/types').TaskType | undefined) ?? undefined,
    due_date:            (b.due_date            as string | undefined) ?? undefined,
    assigned_to:         (b.assigned_to         as string | undefined) ?? undefined,
    client_id:           (b.client_id           as string | undefined) ?? undefined,
    delivery_url:          (b.delivery_url          as string | undefined) ?? undefined,
    reference_image_url:   (b.reference_image_url   as string | undefined) ?? undefined,
    scheduled_publish_at:  (b.scheduled_publish_at  as string | undefined) ?? undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert(task)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  try { const notionId = await createNotionTask(task); await supabase.from('tasks').update({ notion_id: notionId }).eq('id', task.id) } catch {}
  if (task.assigned_to) {
    try { await sendSlack(`📋 *New task assigned*: "${task.title}" (${task.priority} priority${task.due_date ? `, due ${task.due_date}` : ''})`) } catch {}

    // Email notification to the assigned team member
    const adminClient = createAdminClient()
    let memberEmail: string | undefined
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(task.assigned_to)
      memberEmail = authUser?.user?.email

      if (memberEmail) {
        const { data: profile } = await adminClient.from('profiles').select('display_name').eq('id', task.assigned_to).single()
        const memberName = profile?.display_name ?? memberEmail

        const { data: client } = task.client_id
          ? await adminClient.from('clients').select('name').eq('id', task.client_id).is('deleted_at', null).single()
          : { data: null }

        const details = [
          `Task: ${task.title}`,
          task.description ? `Description: ${task.description}` : null,
          `Priority: ${task.priority}`,
          task.due_date ? `Due date: ${task.due_date}` : null,
          client?.name ? `Client: ${client.name}` : null,
        ].filter(Boolean).join('\n')

        const { subject, body: emailBody } = await generateEmailContent({
          type:          'task_assigned',
          recipientName: memberName,
          details,
        })

        await sendEmail({ to: memberEmail, subject, body: emailBody })
        await adminClient.from('automation_logs').insert({
          type:            'task_assigned',
          recipient_email: memberEmail,
          subject,
          status:          'sent',
          task_id:         task.id,
          created_at:      new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[tasks] assignment email failed:', err)
      try {
        await adminClient.from('automation_logs').insert({
          type:            'task_assigned',
          recipient_email: memberEmail ?? task.assigned_to ?? '',
          subject:         `Task assigned: ${task.title}`,
          status:          'failed',
          error:           err instanceof Error ? err.message : String(err),
          task_id:         task.id,
          created_at:      new Date().toISOString(),
        })
      } catch {}
    }
  }
  // ── If scheduled_publish_at set at creation → notify media_buyers ────────────
  if (task.scheduled_publish_at) {
    const notifyAdmin = createAdminClient()
    try {
      const { data: mediaBuyers } = await notifyAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'media_buyer')

      const mediaBuyerIds = (mediaBuyers ?? []).map((p: { id: string }) => p.id)

      if (mediaBuyerIds.length > 0) {
        const clientName = task.client_id
          ? (await notifyAdmin.from('clients').select('name').eq('id', task.client_id).is('deleted_at', null).single()).data?.name ?? 'Unknown Client'
          : 'Unknown Client'

        const publishDateStr = new Date(task.scheduled_publish_at).toLocaleString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })

        const msgContent = `📅 Publish Date Scheduled\nTask: ${task.title}\nClient: ${clientName}\nScheduled for: ${publishDateStr}`

        await Promise.allSettled(
          mediaBuyerIds.map((mbId: string) =>
            notifyAdmin.from('messages').insert({
              sender_id:   user.id,
              receiver_id: mbId,
              content:     msgContent,
            })
          )
        )

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
                body:  `${task.title} — ${clientName}\n${publishDateStr}`,
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

  return NextResponse.json(task, { status: 201 })
}
