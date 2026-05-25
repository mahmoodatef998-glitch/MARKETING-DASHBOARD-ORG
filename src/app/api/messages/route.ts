export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use admin client so RLS can't silently block message reads
  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const partnerId = searchParams.get('partner')

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
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { receiver_id, content } = await req.json()
  if (!receiver_id || !content?.trim()) {
    return NextResponse.json({ error: 'receiver_id and content are required' }, { status: 400 })
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
