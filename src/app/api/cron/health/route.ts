export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Last 10 cron health entries
  const { data: runs } = await admin
    .from('automation_logs')
    .select('status, subject, created_at')
    .eq('type', 'cron_health')
    .order('created_at', { ascending: false })
    .limit(10)

  const last = runs?.[0] ?? null
  const lastSuccessRun = runs?.find(r => r.status === 'success') ?? null
  const hoursAgo = lastSuccessRun
    ? Math.round((Date.now() - new Date(lastSuccessRun.created_at).getTime()) / 3_600_000)
    : null

  // Healthy = last successful run was within the past 25 hours
  const healthy = hoursAgo !== null && hoursAgo < 25

  return NextResponse.json({
    healthy,
    lastRun:       last?.created_at ?? null,
    lastStatus:    last?.status     ?? 'never',
    lastSuccess:   lastSuccessRun?.created_at ?? null,
    hoursAgoLastSuccess: hoursAgo,
    recentRuns:    runs ?? [],
    message:       healthy
      ? `Cron ran ${hoursAgo}h ago — all good`
      : hoursAgo === null
        ? 'Cron has never run successfully'
        : `⚠️ Last successful run was ${hoursAgo}h ago — may be stuck`,
  })
}
