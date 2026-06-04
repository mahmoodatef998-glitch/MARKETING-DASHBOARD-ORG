export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const taskId = new URL(req.url).searchParams.get('taskId')
  const admin  = createAdminClient()

  let query = admin
    .from('scheduled_posts')
    .select('*, task:tasks(id,title,delivery_url)')
    .order('scheduled_at', { ascending: true })

  if (taskId) query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.task_id || !body?.platform || !body?.scheduled_at) {
    return NextResponse.json({ error: 'task_id, platform, scheduled_at required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify task has a delivery_url
  const { data: task } = await admin.from('tasks').select('delivery_url').eq('id', body.task_id).single()
  if (!task?.delivery_url) {
    return NextResponse.json({ error: 'Task has no delivery_url — upload the file first.' }, { status: 422 })
  }

  const platforms: string[] = Array.isArray(body.platform) ? body.platform : [body.platform]
  const rows = platforms.map(p => ({
    task_id:      body.task_id,
    platform:     p,
    scheduled_at: body.scheduled_at,
    caption:      body.caption ?? null,
    status:       'pending',
  }))

  const { data, error } = await admin
    .from('scheduled_posts')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also update task scheduled_publish_at and caption
  await admin.from('tasks').update({
    scheduled_publish_at: body.scheduled_at,
    publish_caption:      body.caption ?? null,
  }).eq('id', body.task_id)

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', id)
  return NextResponse.json({ success: true })
}
