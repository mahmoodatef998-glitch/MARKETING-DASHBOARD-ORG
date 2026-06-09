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

// PATCH /api/content-plans/[id]/items/[itemId]
// Admin can update platforms, notes, publish_date (recalculates due date)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {}

  if (body.platforms !== undefined)  updates.platforms = body.platforms
  if (body.notes     !== undefined)  updates.notes     = body.notes?.trim() || null
  if (body.status    !== undefined)  updates.status    = body.status

  // If publish_date changes, recalculate internal_due_date
  if (body.publish_date) {
    const { data: item } = await admin
      .from('content_plan_items')
      .select('sla_days, task_id')
      .eq('id', itemId)
      .single()

    if (item) {
      const newPublish = new Date(body.publish_date)
      const newDue     = new Date(newPublish)
      newDue.setDate(newDue.getDate() - (item.sla_days ?? 3))

      updates.publish_date      = newPublish.toISOString()
      updates.internal_due_date = newDue.toISOString()

      // Sync task dates
      if (item.task_id) {
        await admin
          .from('tasks')
          .update({
            due_date:             newDue.toISOString().split('T')[0],
            scheduled_publish_at: newPublish.toISOString(),
            updated_at:           new Date().toISOString(),
          })
          .eq('id', item.task_id)
      }
    }
  }

  const { data, error } = await admin
    .from('content_plan_items')
    .update(updates)
    .eq('id', itemId)
    .select(`
      *,
      task:tasks(id, title, status, priority, assigned_to, due_date,
        assignee:profiles!assigned_to(id, display_name))
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/content-plans/[id]/items/[itemId]
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Fetch item to get linked task
  const { data: item } = await admin
    .from('content_plan_items')
    .select('task_id, status')
    .eq('id', itemId)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  // Break circular FK first: null out plan_item_id on the task, then soft-delete it.
  // (tasks.plan_item_id → content_plan_items.id would block the DELETE below otherwise)
  if (item.task_id) {
    await admin
      .from('tasks')
      .update({ plan_item_id: null, deleted_at: new Date().toISOString() })
      .eq('id', item.task_id)
  }

  const { error } = await admin
    .from('content_plan_items')
    .delete()
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
