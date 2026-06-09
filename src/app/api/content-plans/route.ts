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

// GET /api/content-plans?client_id=&month=2025-07
export async function GET(req: NextRequest) {
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')
  const month    = searchParams.get('month') // e.g. "2025-07"

  const admin = createAdminClient()
  let query = admin
    .from('content_plans')
    .select(`
      *,
      client:clients(id, name),
      items:content_plan_items(
        id, content_type, title, publish_date, internal_due_date,
        sla_days, sequence_number, platforms, status, task_id, notes
      )
    `)
    .order('month', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)
  if (month)    query = query.gte('month', `${month}-01`).lte('month', `${month}-31`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/content-plans — create a new monthly plan
export async function POST(req: NextRequest) {
  const auth = await requirePlanAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.client_id || !body?.month) {
    return NextResponse.json({ error: 'client_id and month are required' }, { status: 400 })
  }

  // Normalise month to first-of-month date string
  const monthDate = `${body.month}-01`

  const admin = createAdminClient()

  // Get client name for auto-title
  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', body.client_id)
    .is('deleted_at', null)
    .single()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const monthLabel = new Date(monthDate).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = body.title?.trim() || `${client.name} – ${monthLabel}`

  const { data, error } = await admin
    .from('content_plans')
    .insert({
      client_id:  body.client_id,
      month:      monthDate,
      title,
      status:     'draft',
      notes:      body.notes?.trim() || null,
      created_by: auth.user.id,
    })
    .select('*, client:clients(id, name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A plan already exists for this client and month' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ...data, items: [] }, { status: 201 })
}
