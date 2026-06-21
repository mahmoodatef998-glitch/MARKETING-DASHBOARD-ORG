export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // First login — use admin client to bypass RLS (no INSERT policy on profiles)
    const admin = createAdminClient()
    const displayName = (user.user_metadata?.full_name as string)
      ?? user.email?.split('@')[0]
      ?? user.email
      ?? 'Team Member'
    const { data: newProfile, error } = await admin
      .from('profiles')
      .insert({
        id:           user.id,
        role:         'video_maker',
        display_name: displayName,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .select()
      .single()
    if (error) console.error('[profile] auto-create failed:', error.message)
    return NextResponse.json({ ...(newProfile ?? { id: user.id, role: 'video_maker', display_name: displayName }), email: user.email })
  }

  return NextResponse.json({ ...profile, email: user.email })
}
