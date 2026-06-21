export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requirePlanAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) return null
  return { user, role: profile!.role }
}

// PATCH /api/content-plans/[id] — update plan status or notes
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const allowed = ['status', 'notes', 'title']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_plans')
    .update(updates)
    .eq('id', id)
    .select('*, client:clients(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/content-plans/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Soft-delete all tasks linked through this plan's items before deleting the plan
  const { data: items } = await admin
    .from('content_plan_items')
    .select('task_id')
    .eq('plan_id', id)
    .not('task_id', 'is', null)

  const taskIds = (items ?? []).map((i: { task_id: string | null }) => i.task_id).filter(Boolean) as string[]

  if (taskIds.length > 0) {
    await admin
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), plan_item_id: null })
      .in('id', taskIds)
  }

  // Delete the plan — items and publish_events cascade automatically
  const { error } = await admin.from('content_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
