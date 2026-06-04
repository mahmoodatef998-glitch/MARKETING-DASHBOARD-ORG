export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/billing-plans/mine — returns the active billing plan for the authenticated client
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) return NextResponse.json(null)

  const { data: plan, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('client_id', profile.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(plan ?? null)
}
