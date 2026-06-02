export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Returns ALL active packages + per-item usage for the currently logged-in client
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) return NextResponse.json([])

  const clientId = profile.client_id

  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*, items:package_items(*)')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!packages?.length) return NextResponse.json([])

  // Compute usage for each package independently
  const enriched = await Promise.all(
    packages.map(async (pkg: any) => {
      let periodStart: string
      if (pkg.renewal_type === 'monthly') {
        const now = new Date()
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      } else {
        periodStart = new Date(pkg.start_date).toISOString()
      }

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

      return { ...pkg, items: itemsWithUsage, total_done: totalDone }
    })
  )

  return NextResponse.json(enriched)
}
