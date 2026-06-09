export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'

// SLA days per content type
const SLA: Record<string, number> = {
  design:   2,
  reel:     3,
  ai_video: 4,
}

// task_type mapping from plan content_type
const TASK_TYPE: Record<string, string> = {
  reel:     'reel_video',
  design:   'design',
  ai_video: 'ai_video',
}

// Month label for title generation (e.g. "July2025")
function monthLabel(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long' }) + date.getFullYear()
}

// Clean client name for title (remove spaces/special chars)
function slugName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '')
}

// Content type display for title
const TYPE_LABEL: Record<string, string> = {
  reel:     'Reel',
  design:   'Design',
  ai_video: 'AI',
}

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

// GET /api/content-plans/[id]/items
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_plan_items')
    .select(`
      *,
      task:tasks(
        id, title, status, priority, assigned_to, due_date,
        assignee:profiles!assigned_to(id, display_name)
      )
    `)
    .eq('plan_id', id)
    .order('content_type')
    .order('sequence_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/content-plans/[id]/items — add item + auto-generate task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.content_type || !body?.publish_date) {
    return NextResponse.json({ error: 'content_type and publish_date are required' }, { status: 400 })
  }

  const contentType = body.content_type as string
  if (!['reel', 'design', 'ai_video'].includes(contentType)) {
    return NextResponse.json({ error: 'content_type must be reel, design, or ai_video' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch plan + client info
  const { data: plan, error: planErr } = await admin
    .from('content_plans')
    .select('*, client:clients(id, name)')
    .eq('id', planId)
    .single()

  if (planErr || !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const clientName = (plan.client as { name: string }).name
  const clientId   = plan.client_id

  // Calculate sequence number (count existing items of same type in this plan + 1)
  const { count } = await admin
    .from('content_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('content_type', contentType)

  const seqNum = (count ?? 0) + 1
  const seqStr = String(seqNum).padStart(2, '0')

  // Calculate dates
  const publishDate = new Date(body.publish_date)
  const sladays     = SLA[contentType]
  const dueDate     = new Date(publishDate)
  dueDate.setDate(dueDate.getDate() - sladays)

  // Generate standardized title: ClientName_Type_01_July2025
  const title = `${slugName(clientName)}_${TYPE_LABEL[contentType]}_${seqStr}_${monthLabel(publishDate)}`

  // ── Step 1: Create the plan item ─────────────────────────────────────────
  const { data: item, error: itemErr } = await admin
    .from('content_plan_items')
    .insert({
      plan_id:           planId,
      client_id:         clientId,
      content_type:      contentType,
      title,
      publish_date:      publishDate.toISOString(),
      internal_due_date: dueDate.toISOString(),
      sla_days:          sladays,
      sequence_number:   seqNum,
      platforms:         body.platforms ?? [],
      notes:             body.notes?.trim() || null,
      status:            'pending_production',
    })
    .select()
    .single()

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

  // ── Step 2: Auto-generate the production task ─────────────────────────────
  const taskId = generateId()
  const taskType = TASK_TYPE[contentType]

  const taskDescription = [
    `Monthly plan content — ${TYPE_LABEL[contentType]} #${seqStr} for ${clientName}`,
    `Plan: ${plan.title ?? 'Monthly Plan'}`,
    `Publish Date: ${publishDate.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`,
    `SLA: ${sladays} days before publish`,
    body.notes ? `Notes: ${body.notes.trim()}` : null,
  ].filter(Boolean).join('\n')

  const { error: taskErr } = await admin
    .from('tasks')
    .insert({
      id:                   taskId,
      title,
      description:          taskDescription,
      status:               'todo',
      priority:             'medium',
      task_type:            taskType,
      client_id:            clientId,
      due_date:             dueDate.toISOString().split('T')[0],
      scheduled_publish_at: publishDate.toISOString(),
      assigned_to:          null,
      plan_item_id:         item.id,
      created_at:           new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    })

  if (taskErr) {
    // Rollback: delete the plan item if task creation fails
    await admin.from('content_plan_items').delete().eq('id', item.id)
    return NextResponse.json({ error: `Task creation failed: ${taskErr.message}` }, { status: 500 })
  }

  // ── Step 3: Link task back to plan item ───────────────────────────────────
  await admin
    .from('content_plan_items')
    .update({ task_id: taskId })
    .eq('id', item.id)

  // ── Step 4: Activate plan if still draft ─────────────────────────────────
  if (plan.status === 'draft') {
    await admin
      .from('content_plans')
      .update({ status: 'active' })
      .eq('id', planId)
  }

  // Return full item with linked task
  const { data: fullItem } = await admin
    .from('content_plan_items')
    .select(`
      *,
      task:tasks(
        id, title, status, priority, assigned_to, due_date,
        assignee:profiles!assigned_to(id, display_name)
      )
    `)
    .eq('id', item.id)
    .single()

  return NextResponse.json(fullItem, { status: 201 })
}
