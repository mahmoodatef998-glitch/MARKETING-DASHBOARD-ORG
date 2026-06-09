export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requireAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) return null
  return { user, role: profile!.role }
}

// GET /api/publish-events
// Query params: month (YYYY-MM), client_id, platform, status, content_type
export async function GET(req: NextRequest) {
  const auth = await requireAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const month        = searchParams.get('month')        // e.g. "2026-07"
  const clientId     = searchParams.get('client_id')
  const platform     = searchParams.get('platform')
  const status       = searchParams.get('status')
  const contentType  = searchParams.get('content_type')

  const admin = createAdminClient()

  let query = admin
    .from('publish_events')
    .select(`
      id,
      platform,
      scheduled_at,
      status,
      published_at,
      platform_post_id,
      error_message,
      item:content_plan_items(
        id,
        title,
        content_type,
        sla_days,
        internal_due_date,
        plan:content_plans(
          id,
          title,
          month,
          client:clients(id, name)
        ),
        task:tasks(id, title, status, approval_status, delivery_url)
      )
    `)
    .order('scheduled_at', { ascending: true })

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const from = new Date(y, m - 1, 1).toISOString()
    const to   = new Date(y, m, 1).toISOString()
    query = query.gte('scheduled_at', from).lt('scheduled_at', to)
  }

  if (platform) query = query.eq('platform', platform)
  if (status)   query = query.eq('status', status)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Post-filter by client_id and content_type (nested join filters not supported inline)
  let result = data ?? []
  if (clientId) {
    result = result.filter((e: Record<string, unknown>) => {
      const item = e.item as Record<string, unknown> | null
      const plan = item?.plan as Record<string, unknown> | null
      const client = plan?.client as Record<string, unknown> | null
      return client?.id === clientId
    })
  }
  if (contentType) {
    result = result.filter((e: Record<string, unknown>) => {
      const item = e.item as Record<string, unknown> | null
      return item?.content_type === contentType
    })
  }

  return NextResponse.json(result)
}
