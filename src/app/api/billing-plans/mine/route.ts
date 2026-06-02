export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Returns the active billing plan for the currently logged-in client
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null)

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) return NextResponse.json(null)

  const { data: plans } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('client_id', profile.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  return NextResponse.json(plans?.[0] ?? null)
}
