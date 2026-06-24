export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { sendPushNotification, type PushSubscription } from '@/lib/webpush'

// POST /api/tasks/[id]/approve — client approves a task (moves to done + saves rating)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { rating, rating_note } = body

  // Verify the task belongs to this client
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  const { data: task, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, client_id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Allow admin, media_buyer, or the task's own client
  const canApprove = profile?.role === 'admin' || profile?.role === 'media_buyer' || task.client_id === profile?.client_id
  if (!canApprove) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (task.status === 'done') {
    return NextResponse.json({ error: 'Task already approved' }, { status: 409 })
  }

  const isElevatedRole = profile?.role === 'admin' || profile?.role === 'media_buyer'
  const updates: Record<string, unknown> = {
    status:             'done',
    approval_status:    isElevatedRole ? 'admin_approved' : 'client_approved',
    client_approved_at: new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }
  if (rating)      updates.client_rating      = Number(rating)
  if (rating_note) updates.client_rating_note = String(rating_note)

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send push notification to all admins when client approves (not admin/media_buyer self-approve)
  if (!isElevatedRole && updates.approval_status === 'client_approved') {
    try {
      const admin = createAdminClient()
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('user_id',
          (await admin.from('profiles').select('id').eq('role', 'admin')).data?.map(p => p.id) ?? []
        )

      const taskTitle = (data as { title?: string })?.title ?? 'A task'
      await Promise.allSettled(
        (subs ?? []).map(s =>
          sendPushNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as PushSubscription,
            {
              title: '✅ Task Awaiting Your Approval',
              body:  taskTitle,
              url:   '/approvals',
              icon:  '/icon-192.png',
            }
          )
        )
      )
    } catch (err) {
      console.error('[push] failed to send approval notification:', err)
    }
  }

  return NextResponse.json(data)
}
