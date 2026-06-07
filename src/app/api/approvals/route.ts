export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const { searchParams } = new URL(req.url)
  const approvalStatusParam = searchParams.get('approval_status')

  const admin = createAdminClient()
  let query = admin
    .from('tasks')
    .select('*, assignee:profiles!assigned_to(id, display_name, role), client:clients(id, name, email)')
    .eq('status', 'done')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (profile?.role === 'client') {
    if (!profile.client_id) return NextResponse.json([])
    query = query.eq('client_id', profile.client_id)
    // Clients always see pending + client_approved (no admin_approved)
    if (approvalStatusParam && approvalStatusParam !== 'admin_approved') {
      query = query.eq('approval_status', approvalStatusParam)
    } else {
      query = query.in('approval_status', ['pending', 'client_approved'])
    }
  } else {
    // Admin
    if (approvalStatusParam) {
      query = query.eq('approval_status', approvalStatusParam)
    } else {
      query = query.in('approval_status', ['pending', 'client_approved'])
    }
  }

  const { data, error } = await query
  if (error) {
    console.error('[approvals GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  let body: { task_id?: string; action?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { task_id, action, note } = body
  if (!task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch the task to verify access
  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('id, client_id, task_type, assigned_to, approval_status')
    .eq('id', task_id)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const isAdmin = profile?.role === 'admin'
  const isClient = profile?.role === 'client'

  // Clients must only touch tasks belonging to their own client
  if (isClient) {
    if (!profile?.client_id || task.client_id !== profile.client_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (!isAdmin && !isClient) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (action === 'client_approve') {
    if (!isClient) return NextResponse.json({ error: 'Only clients can client_approve' }, { status: 403 })

    const { error: updateError } = await admin
      .from('tasks')
      .update({
        approval_status: 'client_approved',
        client_approved_at: new Date().toISOString(),
      })
      .eq('id', task_id)

    if (updateError) {
      console.error('[approvals PATCH client_approve]', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'admin_approve') {
    if (!isAdmin) return NextResponse.json({ error: 'Only admins can admin_approve' }, { status: 403 })

    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('tasks')
      .update({
        approval_status: 'admin_approved',
        admin_approved_at: now,
        approved_by: user.id,
      })
      .eq('id', task_id)

    if (updateError) {
      console.error('[approvals PATCH admin_approve]', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If design task with an assignee, credit earnings
    if (task.task_type === 'design' && task.assigned_to) {
      const { error: earningsError } = await admin
        .from('earnings')
        .upsert(
          {
            user_id: task.assigned_to,
            task_id: task.id,
            amount: 15,
            currency: 'AED',
            created_at: now,
          },
          { onConflict: 'task_id' }
        )

      if (earningsError) {
        console.error('[approvals PATCH earnings upsert]', earningsError.message)
        // Non-fatal: approval already recorded, log but don't fail the request
      }
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'revision_requested') {
    // Both client and admin can request revisions
    const { error: updateError } = await admin
      .from('tasks')
      .update({
        status: 'review',
        approval_status: 'pending',
        revision_notes: note ?? null,
      })
      .eq('id', task_id)

    if (updateError) {
      console.error('[approvals PATCH revision_requested]', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
