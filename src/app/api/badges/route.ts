export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ''
  const admin = createAdminClient()
  const now = new Date().toISOString()

  let pendingApprovals = 0
  let upcomingMeetings = 0

  // ── Pending approvals count ───────────────────────────────────────────────
  if (['admin', 'media_buyer'].includes(role)) {
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'done')
      .in('approval_status', ['pending', 'client_approved'])
      .is('deleted_at', null)
    pendingApprovals = count ?? 0
  } else if (['video_maker', 'designer', 'ai_video'].includes(role)) {
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'done')
      .in('approval_status', ['pending', 'client_approved'])
      .eq('assigned_to', user.id)
      .is('deleted_at', null)
    pendingApprovals = count ?? 0
  } else if (role === 'client' && profile?.client_id) {
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'done')
      .in('approval_status', ['pending', 'client_approved'])
      .eq('client_id', profile.client_id)
      .is('deleted_at', null)
    pendingApprovals = count ?? 0
  }

  // ── Upcoming meetings count (admin only) ──────────────────────────────────
  if (role === 'admin') {
    const { count } = await admin
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gt('scheduled_at', now)
      .neq('status', 'cancelled')
    upcomingMeetings = count ?? 0
  }

  return NextResponse.json(
    { pendingApprovals, upcomingMeetings },
    { headers: { 'Cache-Control': 'private, no-cache' } }
  )
}
