export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'

async function requireAccess(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) return null
  return user
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')
  const status   = searchParams.get('status')

  const admin = createAdminClient()
  let query = admin
    .from('campaigns')
    .select(`
      *,
      client:clients(id, name),
      creator:profiles!created_by(id, display_name),
      posts:scheduled_posts(id, status, platform)
    `)
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)
  if (status)   query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.client_id || !body?.start_date || !body?.end_date) {
    return NextResponse.json({ error: 'name, client_id, start_date, end_date required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin.from('campaigns').insert({
    id:          generateId(),
    client_id:   body.client_id,
    name:        body.name,
    description: body.description ?? null,
    goal:        body.goal ?? null,
    platforms:   body.platforms ?? [],
    start_date:  body.start_date,
    end_date:    body.end_date,
    budget:      body.budget ? Number(body.budget) : null,
    currency:    body.currency ?? 'USD',
    status:      body.status ?? 'draft',
    created_by:  user.id,
    created_at:  now,
    updated_at:  now,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
