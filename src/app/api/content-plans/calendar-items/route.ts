export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

// GET /api/content-plans/calendar-items?month=YYYY-MM
// Returns all content plan items with publish_date for the publishing calendar
export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const month = req.nextUrl.searchParams.get('month') // e.g. "2026-07"
  const clientId = req.nextUrl.searchParams.get('client_id')

  const admin = createAdminClient()
  let query = admin
    .from('content_plan_items')
    .select(`
      id,
      title,
      content_type,
      publish_date,
      internal_due_date,
      status,
      platforms,
      notes,
      plan_id,
      client_id,
      task_id,
      plan:content_plans!plan_id(id, title, status),
      client:clients!client_id(id, name)
    `)
    .not('publish_date', 'is', null)
    .order('publish_date', { ascending: true })

  if (month) {
    // Filter to items whose publish_date falls within the month
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const end = `${month}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('publish_date', start).lte('publish_date', end + 'T23:59:59')
  }

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
