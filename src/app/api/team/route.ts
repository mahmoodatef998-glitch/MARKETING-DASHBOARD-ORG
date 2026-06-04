export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

const TEAM_ROLES = ['video_maker', 'designer', 'ai_video', 'media_buyer']

// GET — returns team member profiles (sourced from profiles table, NOT legacy team_members)
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Get team member profiles
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, role, display_name, created_at')
    .in('role', TEAM_ROLES)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get auth user emails for each profile
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  for (const u of authUsers) emailMap[u.id] = u.email ?? ''

  // Return in TeamMember-compatible shape so the team page doesn't need changes
  const members = (profiles ?? []).map(p => ({
    id:         p.id,
    name:       p.display_name ?? emailMap[p.id] ?? 'Unknown',
    email:      emailMap[p.id] ?? '',
    role:       p.role,
    status:     'active' as const,
    created_at: p.created_at,
    updated_at: p.created_at,
  }))

  return NextResponse.json(members, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
  })
}
