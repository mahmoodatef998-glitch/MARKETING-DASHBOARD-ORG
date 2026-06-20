export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown', { limit: 60, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('meetings')
    .select('*, client:clients(id, name)')
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown', { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.scheduled_at) {
    return NextResponse.json({ error: 'title and scheduled_at required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('meetings')
    .insert({
      title:        body.title.trim(),
      client_id:    body.client_id   || null,
      client_name:  body.client_name?.trim() || null,
      scheduled_at: body.scheduled_at,
      notes:        body.notes?.trim() || null,
      status:       'pending',
    })
    .select('*, client:clients(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
