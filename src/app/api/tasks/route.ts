export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionTask } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { DEMO_TASKS } from '@/lib/demo-data'
import { rateLimit } from '@/lib/rate-limit'
import { parseBody, TaskCreateSchema } from '@/lib/validation'
import type { Task } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 120, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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
  const { searchParams } = new URL(req.url)

  const status    = searchParams.get('status')
  const clientId  = searchParams.get('client_id')
  const assignedTo = searchParams.get('assigned_to')
  const page      = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit     = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))
  const from      = (page - 1) * limit
  const to        = from + limit - 1

  let query = supabase
    .from('tasks')
    .select('*, assignee:profiles(id,display_name,role), client:clients(id,name,email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status)     query = query.eq('status', status)
  if (clientId)   query = query.eq('client_id', clientId)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)

  const { data, error, count } = await query
  if (error) {
    console.error('[tasks GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }

  const supabase = await createServerClient()
  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = parseBody(TaskCreateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const task: Task = {
    id: generateId(), title: body.title,
    ...(body.description  ? { description:  body.description  } : {}),
    ...(body.task_type    ? { task_type:    body.task_type    } : {}),
    ...(body.due_date     ? { due_date:     body.due_date     } : {}),
    ...(body.assigned_to  ? { assigned_to:  body.assigned_to  } : {}),
    ...(body.client_id    ? { client_id:    body.client_id    } : {}),
    ...(body.delivery_url ? { delivery_url: body.delivery_url } : {}),
    status: body.status ?? 'todo', priority: body.priority ?? 'medium',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('tasks').insert(task)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const notionId = await createNotionTask(task)
    await supabase.from('tasks').update({ notion_id: notionId }).eq('id', task.id)
  } catch {}

  return NextResponse.json(task, { status: 201 })
}
