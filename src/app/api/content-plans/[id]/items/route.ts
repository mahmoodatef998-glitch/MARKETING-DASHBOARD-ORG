export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'

const SLA: Record<string, number> = {
  design:   1,
  reel:     3,
  ai_video: 3,
}

const TASK_TYPE: Record<string, string> = {
  reel:     'reel_video',
  design:   'design',
  ai_video: 'ai_video',
}

const TYPE_LABEL: Record<string, string> = {
  reel:     'Reel',
  design:   'Design',
  ai_video: 'AI',
}

const VALID_PLATFORMS = ['instagram', 'facebook', 'tiktok']

function monthLabel(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long' }) + date.getFullYear()
}

function slugName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '')
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
      ),
      publish_events(id, platform, scheduled_at, status)
    `)
    .eq('plan_id', id)
    .order('content_type')
    .order('sequence_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/content-plans/[id]/items
// Body (new): { content_type, assigned_to?, platform_schedules: [{platform, scheduled_at}], notes? }
// Body (legacy): { content_type, publish_date, platforms?, notes? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = await params
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.content_type) {
    return NextResponse.json({ error: 'content_type is required' }, { status: 400 })
  }

  const contentType = body.content_type as string
  if (!['reel', 'design', 'ai_video'].includes(contentType)) {
    return NextResponse.json({ error: 'content_type must be reel, design, or ai_video' }, { status: 400 })
  }

  // ── Resolve publish schedule ───────────────────────────────────────────────
  // New path: platform_schedules array  (per-platform times)
  // Legacy path: publish_date (single timestamp, backward compat)
  type PlatformSchedule = { platform: string; scheduled_at: string }
  let platformSchedules: PlatformSchedule[] = []
  let firstPublishAt: Date

  if (Array.isArray(body.platform_schedules) && body.platform_schedules.length > 0) {
    const invalid = body.platform_schedules.find(
      (s: PlatformSchedule) => !VALID_PLATFORMS.includes(s.platform) || !s.scheduled_at
    )
    if (invalid) {
      return NextResponse.json(
        { error: 'Each platform_schedule must have a valid platform and scheduled_at' },
        { status: 400 }
      )
    }
    platformSchedules = body.platform_schedules
    // earliest scheduled time drives the SLA calc
    firstPublishAt = new Date(
      Math.min(...platformSchedules.map(s => new Date(s.scheduled_at).getTime()))
    )
  } else if (body.publish_date) {
    // legacy single date — wrap as single publish event if platforms provided
    firstPublishAt = new Date(body.publish_date)
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      platformSchedules = body.platforms.map((p: string) => ({
        platform:     p,
        scheduled_at: firstPublishAt.toISOString(),
      }))
    }
  } else {
    return NextResponse.json(
      { error: 'Either platform_schedules or publish_date is required' },
      { status: 400 }
    )
  }

  const sladays = SLA[contentType]
  const dueDate = new Date(firstPublishAt)
  dueDate.setDate(dueDate.getDate() - sladays)

  const admin = createAdminClient()

  // Fetch plan + client
  const { data: plan, error: planErr } = await admin
    .from('content_plans')
    .select('*, client:clients(id, name)')
    .eq('id', planId)
    .single()

  if (planErr || !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const clientName = (plan.client as { name: string }).name
  const clientId   = plan.client_id

  // Sequence number within plan × content_type
  const { count } = await admin
    .from('content_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('content_type', contentType)

  const seqNum = (count ?? 0) + 1
  const seqStr = String(seqNum).padStart(2, '0')
  const title  = `${slugName(clientName)}_${TYPE_LABEL[contentType]}_${seqStr}_${monthLabel(firstPublishAt)}`

  const platformsArray = platformSchedules.map(s => s.platform)

  // ── Step 1: Create the plan item ──────────────────────────────────────────
  const { data: item, error: itemErr } = await admin
    .from('content_plan_items')
    .insert({
      plan_id:           planId,
      client_id:         clientId,
      content_type:      contentType,
      title,
      assigned_to:       body.assigned_to ?? null,
      publish_date:      firstPublishAt.toISOString(),
      first_publish_at:  firstPublishAt.toISOString(),
      internal_due_date: dueDate.toISOString(),
      sla_days:          sladays,
      sequence_number:   seqNum,
      platforms:         platformsArray,
      notes:             body.notes?.trim() || null,
      status:            'pending_production',
    })
    .select()
    .single()

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

  // ── Step 2: Create publish_events (one per platform, status=blocked) ──────
  if (platformSchedules.length > 0) {
    const { error: eventsErr } = await admin
      .from('publish_events')
      .insert(
        platformSchedules.map(s => ({
          item_id:      item.id,
          platform:     s.platform,
          scheduled_at: new Date(s.scheduled_at).toISOString(),
          status:       'blocked',
        }))
      )

    if (eventsErr) {
      await admin.from('content_plan_items').delete().eq('id', item.id)
      return NextResponse.json({ error: `Publish events creation failed: ${eventsErr.message}` }, { status: 500 })
    }
  }

  // ── Step 3: Auto-generate the production task ─────────────────────────────
  const taskId   = generateId()
  const taskType = TASK_TYPE[contentType]

  const platformsDesc = platformSchedules.length > 0
    ? platformSchedules
        .map(s => `  ${s.platform}: ${new Date(s.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`)
        .join('\n')
    : `  ${firstPublishAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`

  const taskDescription = [
    `Monthly plan content — ${TYPE_LABEL[contentType]} #${seqStr} for ${clientName}`,
    `Plan: ${plan.title ?? 'Monthly Plan'}`,
    `Publish Schedule:\n${platformsDesc}`,
    `SLA: ${sladays} day(s) before first publish`,
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
      scheduled_publish_at: firstPublishAt.toISOString(),
      assigned_to:          body.assigned_to ?? null,
      plan_item_id:         item.id,
      publish_platforms:    platformsArray,
      created_at:           new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    })

  if (taskErr) {
    await admin.from('publish_events').delete().eq('item_id', item.id)
    await admin.from('content_plan_items').delete().eq('id', item.id)
    return NextResponse.json({ error: `Task creation failed: ${taskErr.message}` }, { status: 500 })
  }

  // ── Step 4: Link task back to plan item ───────────────────────────────────
  await admin
    .from('content_plan_items')
    .update({ task_id: taskId })
    .eq('id', item.id)

  // ── Step 5: Activate plan if still draft ──────────────────────────────────
  if (plan.status === 'draft') {
    await admin.from('content_plans').update({ status: 'active' }).eq('id', planId)
  }

  // Return full item with linked task + publish_events
  const { data: fullItem } = await admin
    .from('content_plan_items')
    .select(`
      *,
      task:tasks(
        id, title, status, priority, assigned_to, due_date,
        assignee:profiles!assigned_to(id, display_name)
      ),
      publish_events(id, platform, scheduled_at, status)
    `)
    .eq('id', item.id)
    .single()

  return NextResponse.json(fullItem, { status: 201 })
}
