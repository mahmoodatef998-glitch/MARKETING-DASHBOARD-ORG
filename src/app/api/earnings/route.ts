export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const { searchParams } = new URL(req.url)
  const admin = createAdminClient()

  let query = admin
    .from('earnings')
    .select('*, task:tasks(id, title, task_type, client:clients(name)), user:profiles(display_name, role)')
    .order('created_at', { ascending: false })

  if (profile?.role === 'admin') {
    const userIdParam = searchParams.get('user_id')
    if (userIdParam) {
      query = query.eq('user_id', userIdParam)
    }
    // No filter → return all earnings
  } else {
    // Non-admin: only their own earnings
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query
  if (error) {
    console.error('[earnings GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
