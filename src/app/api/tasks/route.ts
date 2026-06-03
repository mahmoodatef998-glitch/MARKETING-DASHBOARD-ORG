export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionTask } from '@/lib/notion'
import { generateId } from '@/lib/utils'
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = await createServerClient()
  const body = await req.json()
  const task: Task = {
    id: generateId(), title: body.title, description: body.description ?? null,
    status: body.status ?? 'todo', priority: body.priority ?? 'medium',
    task_type: body.task_type || null,
    due_date: body.due_date || null,
    assigned_to: body.assigned_to || null,
    client_id: body.client_id || null,
    delivery_url: body.delivery_url || null,
    reference_image_url: body.reference_image_url || null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert(task)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { const notionId = await createNotionTask(task); await supabase.from('tasks').update({ notion_id: notionId }).eq('id', task.id) } catch {}
  return NextResponse.json(task, { status: 201 })
}
