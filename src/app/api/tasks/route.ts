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
  let query = supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id,display_name,role), client:clients(id,name,email)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Clients only see their own tasks — enforced server-side regardless of query params
  if (profile?.role === 'client') {
    if (!profile.client_id) return NextResponse.json([])
    query = query.eq('client_id', profile.client_id)
  } else {
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const assignedTo = searchParams.get('assigned_to')
    if (status) query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
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
    delivery_url:        (b.delivery_url        as string | undefined) ?? undefined,
    reference_image_url: (b.reference_image_url as string | undefined) ?? undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert(task)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  try { const notionId = await createNotionTask(task); await supabase.from('tasks').update({ notion_id: notionId }).eq('id', task.id) } catch {}
  if (task.assigned_to) {
    void sendSlack(`📋 *New task assigned*: "${task.title}" (${task.priority} priority${task.due_date ? `, due ${task.due_date}` : ''})`)

    // Email notification to the assigned team member
    void (async () => {
      try {
        const admin = createAdminClient()
        const { data: authUser } = await admin.auth.admin.getUserById(task.assigned_to!)
        const memberEmail = authUser?.user?.email
        if (!memberEmail) return

        const { data: profile } = await admin.from('profiles').select('display_name').eq('id', task.assigned_to!).single()
        const memberName = profile?.display_name ?? memberEmail

        const { data: client } = task.client_id
          ? await admin.from('clients').select('name').eq('id', task.client_id).single()
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
        await admin.from('automation_logs').insert({
          type:            'task_assigned',
          recipient_email: memberEmail,
          subject,
          status:          'sent',
          task_id:         task.id,
          created_at:      new Date().toISOString(),
        })
      } catch (err) {
        console.error('[tasks] assignment email failed:', err)
      }
    })()
  }
  return NextResponse.json(task, { status: 201 })
}
