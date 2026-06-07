export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Use admin client so RLS can't silently block message reads
  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const partnerId = searchParams.get('partner')

  if (partnerId && !UUID_RE.test(partnerId)) {
    return NextResponse.json({ error: 'Invalid partner ID' }, { status: 400 })
  }

  let query = admin
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })

  if (partnerId) {
    query = query.or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
    )
  } else {
    query = query.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const { ok } = rateLimit(ip, { limit: 30, window: 60_000 })
  if (!ok) return NextResponse.json({ error: 'Too many messages' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const UUID_POST_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const { receiver_id, content } = await req.json()
  if (!receiver_id || !content?.trim()) {
    return NextResponse.json({ error: 'receiver_id and content are required' }, { status: 400 })
  }
  if (!UUID_POST_RE.test(receiver_id)) {
    return NextResponse.json({ error: 'Invalid receiver_id' }, { status: 400 })
  }

  // Use admin client to bypass RLS on insert
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('messages')
    .insert({ sender_id: user.id, receiver_id, content: content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
