export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/packages/mine — returns packages for the authenticated client
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
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

  // Compute usage per item — count all done tasks since the package start_date.
  // Using start_date (not first-of-month) ensures tasks completed on any day
  // of the package period are counted correctly.
  const enriched = await Promise.all(
    (packages ?? []).map(async (pkg: any) => {
      const periodStart = new Date(pkg.start_date).toISOString()

      const { data: usageCounts } = await supabase
        .from('tasks')
        .select('task_type')
        .eq('client_id', clientId)
        .eq('status', 'done')
        .is('deleted_at', null)
        .gte('updated_at', periodStart)
        .not('task_type', 'is', null)

      const usageMap: Record<string, number> = {}
      for (const row of usageCounts ?? []) {
        if (row.task_type) usageMap[row.task_type] = (usageMap[row.task_type] ?? 0) + 1
      }

      const { count: totalDone } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'done')
        .is('deleted_at', null)
        .gte('updated_at', periodStart)

      const itemsWithUsage = (pkg.items ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((item: any) => ({ ...item, used: usageMap[item.task_type] ?? 0 }))

      return { ...pkg, items: itemsWithUsage, total_done: totalDone ?? 0 }
    })
  )

  return NextResponse.json(enriched)
}
