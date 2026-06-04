export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityId   = searchParams.get('entity_id')
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  let query = supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId)   query = query.eq('entity_id',   entityId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add 1 minute cache
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
