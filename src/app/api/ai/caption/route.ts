export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateCaption } from '@/lib/gemini'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = rateLimit(ip, { limit: 20, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const taskId = body?.task_id as string | undefined

  let taskTitle   = body?.task_title   as string | undefined
  let taskType    = body?.task_type    as string | undefined
  let description = body?.description  as string | undefined
  let clientName  = body?.client_name  as string | undefined

  // If task_id provided, enrich from DB
  if (taskId) {
    const { data: task } = await supabase
      .from('tasks')
      .select('title, task_type, description, client:clients(name)')
      .eq('id', taskId)
      .is('deleted_at', null)
      .single()
    if (task) {
      taskTitle   = task.title
      taskType    = task.task_type ?? undefined
      description = task.description ?? undefined
      clientName  = (task.client as { name?: string } | null)?.name ?? undefined
    }
  }

  if (!taskTitle) return NextResponse.json({ error: 'task_title or task_id required' }, { status: 400 })

  const caption = await generateCaption({ taskTitle, taskType, description, clientName })
  return NextResponse.json({ caption })
}
