export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionTask } from '@/lib/notion'
import { generateId, dbError } from '@/lib/utils'
import { TaskCreateSchema, parseBody } from '@/lib/validation'
import { DEMO_TASKS } from '@/lib/demo-data'
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
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
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
  return NextResponse.json(task, { status: 201 })
}
