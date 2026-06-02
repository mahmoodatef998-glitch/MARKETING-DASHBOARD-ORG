export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Returns the active package + usage for the currently logged-in client
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve client_id from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) return NextResponse.json(null)

  const clientId = profile.client_id

  // Get active packages with items
  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*, items:package_items(*)')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!packages?.length) return NextResponse.json(null)

  // Compute usage for the active package
  const pkg = packages[0]

  let periodStart: string
  if (pkg.renewal_type === 'monthly') {
    const now = new Date()
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  } else {
    periodStart = new Date(pkg.start_date).toISOString()
  }

  // Count ALL done tasks in this period (with or without task_type)
  const { data: usageCounts } = await supabase
    .from('tasks')
    .select('task_type')
    .eq('client_id', clientId)
    .eq('status', 'done')
    .gte('updated_at', periodStart)

  const usageMap: Record<string, number> = {}
  let totalDone = 0
  for (const row of usageCounts ?? []) {
    totalDone++
    if (row.task_type) usageMap[row.task_type] = (usageMap[row.task_type] ?? 0) + 1
  }

  const itemsWithUsage = (pkg.items ?? [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((item: any) => ({ ...item, used: usageMap[item.task_type] ?? 0 }))

  return NextResponse.json({ ...pkg, items: itemsWithUsage, total_done: totalDone })
}
