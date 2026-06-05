export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('client_id')
  const admin    = createAdminClient()

  let query = admin
    .from('social_connections')
    .select('id, client_id, platform, page_id, ig_user_id, token_expires_at, is_active, extra, created_at')
    .eq('is_active', true)
    .order('platform')

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.platform || !body?.access_token || !body?.client_id) {
    return NextResponse.json({ error: 'client_id, platform and access_token required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('social_connections')
    .upsert({
      client_id:        body.client_id,
      platform:         body.platform,
      page_id:          body.page_id          ?? null,
      ig_user_id:       body.ig_user_id       ?? null,
      access_token:     body.access_token,
      token_expires_at: body.token_expires_at ?? null,
      extra:            body.extra            ?? {},
      is_active:        true,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'client_id,platform' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('social_connections').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ success: true })
}
