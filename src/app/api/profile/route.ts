export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

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
    // First time — auto-create profile with default role (non-admin)
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({ id: user.id, role: 'video_maker', display_name: user.email })
      .select()
      .single()
    return NextResponse.json({ ...newProfile, email: user.email })
  }

  return NextResponse.json({ ...profile, email: user.email })
}
