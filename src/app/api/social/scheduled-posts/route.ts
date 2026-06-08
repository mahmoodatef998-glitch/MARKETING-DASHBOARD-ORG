export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requireSocialAccess(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'media_buyer') return null
  return user
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireSocialAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const taskId   = new URL(req.url).searchParams.get('taskId')
  const clientId = new URL(req.url).searchParams.get('client_id')
  const admin    = createAdminClient()

  let query = admin
    .from('scheduled_posts')
    .select('*, task:tasks(id,title,delivery_url)')
    .order('scheduled_at', { ascending: false })

  if (taskId)   query = query.eq('task_id', taskId)
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireSocialAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.platform || !body?.scheduled_at) {
    return NextResponse.json({ error: 'platform and scheduled_at required' }, { status: 400 })
  }

  if (!body.task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify task has a delivery_url
  const { data: task } = await admin
    .from('tasks')
    .select('delivery_url, client_id')
    .eq('id', body.task_id)
    .is('deleted_at', null)
    .single()
  if (!task?.delivery_url) {
    return NextResponse.json({ error: 'Task has no delivery_url — upload the file first.' }, { status: 422 })
  }

  const clientId: string | null = body.client_id ?? task.client_id ?? null
  const platforms: string[] = Array.isArray(body.platform) ? body.platform : [body.platform]
  const contentType: string = ['post', 'reel', 'story'].includes(body.content_type) ? body.content_type : 'post'

  const campaignId: string | null = body.campaign_id ?? null

  const rows = platforms.map(p => ({
    task_id:      body.task_id,
    client_id:    clientId,
    campaign_id:  campaignId,
    platform:     p,
    scheduled_at: body.scheduled_at,
    caption:      body.caption ?? null,
    content_type: contentType,
    status:       'pending',
  }))

  let { data, error } = await admin.from('scheduled_posts').insert(rows).select()

  // Graceful fallback if content_type or campaign_id columns haven't been migrated yet
  if (error?.code === '42703') {
    const rowsCompat = rows.map(({ content_type: _ct, campaign_id: _cid, ...r }) => r)
    const res2 = await admin.from('scheduled_posts').insert(rowsCompat).select()
    data  = res2.data
    error = res2.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync back to task if linked
  if (body.task_id) {
    await admin.from('tasks').update({
      scheduled_publish_at: body.scheduled_at,
      publish_caption:      body.caption ?? null,
    }).eq('id', body.task_id)
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireSocialAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', id)
  return NextResponse.json({ success: true })
}
