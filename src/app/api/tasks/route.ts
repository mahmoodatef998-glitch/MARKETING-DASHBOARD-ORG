export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionTask } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { parseBody, TaskCreateSchema } from '@/lib/validation'
import { DEMO_TASKS } from '@/lib/demo-data'
import type { Task, TaskType } from '@/types'

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
  const { searchParams } = new URL(req.url)
  let query = supabase
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id,display_name,role), client:clients(id,name,email)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const status = searchParams.get('status')
  const clientId = searchParams.get('client_id')
  const assignedTo = searchParams.get('assigned_to')
  if (status) query = query.eq('status', status)
  if (clientId) query = query.eq('client_id', clientId)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)
  const { data, error } = await query
  if (error) {
    console.error('[tasks GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
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
  const supabase = await createServerClient()
  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = parseBody(TaskCreateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const task: Task = {
    id: generateId(),
    title:       body.title,
    description: body.description as string | undefined,
    status:      body.status    ?? 'todo',
    priority:    body.priority  ?? 'medium',
    task_type:   body.task_type  as TaskType | undefined,
    due_date:    body.due_date   as string   | undefined,
    assigned_to: body.assigned_to as string  | undefined,
    client_id:   body.client_id   as string  | undefined,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert(task)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { const notionId = await createNotionTask(task); await supabase.from('tasks').update({ notion_id: notionId }).eq('id', task.id) } catch (e) {
    console.error('[tasks POST] Notion sync failed:', e)
  }

  // Notify the assigned team member about the new task
  if (task.assigned_to) {
    try {
      const { createAdminClient } = await import('@/lib/supabase-server')
      const { sendEmail }         = await import('@/lib/gmail')
      const admin = createAdminClient()
      const { data: authUser } = await admin.auth.admin.getUserById(task.assigned_to)
      const memberEmail = authUser?.user?.email
      if (memberEmail) {
        const { data: clientRec } = await admin.from('clients').select('name').eq('id', task.client_id ?? '').maybeSingle()
        await sendEmail({
          to:      memberEmail,
          subject: `📋 New task assigned: "${task.title}"`,
          body: [
            `A new task has been assigned to you:`,
            ``,
            `  Title:    ${task.title}`,
            task.description ? `  Details:  ${task.description}` : null,
            `  Priority: ${task.priority}`,
            task.due_date ? `  Due:      ${task.due_date}` : null,
            clientRec?.name ? `  Client:   ${clientRec.name}` : null,
            ``,
            `Log in to your portal to get started.`,
          ].filter(Boolean).join('\n'),
        })
      }
    } catch (e: any) {
      console.error('[tasks POST] assign notify failed:', e.message)
    }
  }

  return NextResponse.json(task, { status: 201 })
}
