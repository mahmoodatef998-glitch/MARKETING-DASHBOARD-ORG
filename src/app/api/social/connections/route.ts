export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('social_connections')
    .select('id, platform, page_id, ig_user_id, token_expires_at, is_active, created_at')
    .order('created_at', { ascending: true })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.platform || !body?.access_token) {
    return NextResponse.json({ error: 'platform and access_token required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('social_connections')
    .upsert({
      platform:         body.platform,
      page_id:          body.page_id          ?? null,
      ig_user_id:       body.ig_user_id       ?? null,
      access_token:     body.access_token,
      token_expires_at: body.token_expires_at ?? null,
      extra:            body.extra            ?? {},
      is_active:        true,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'platform' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('social_connections').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
