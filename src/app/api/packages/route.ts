export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// ─── GET /api/packages?clientId=X ────────────────────────────────────────────
// Returns all packages for a client with computed usage per item
export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data: callerProfile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()
  if (callerProfile?.role === 'client' && clientId !== callerProfile.client_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*, items:package_items(*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute usage for each package's items
  const enriched = await Promise.all(
    (packages ?? []).map(async (pkg: any) => {
      // Determine the period start for usage counting
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
        .map((item: any) => ({
          ...item,
          used: usageMap[item.task_type] ?? 0,
        }))

      return { ...pkg, items: itemsWithUsage, total_done: totalDone }
    })
  )

  return NextResponse.json(enriched)
}

// ─── POST /api/packages ───────────────────────────────────────────────────────
// Create a new package with its items
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { items, ...packageData } = body

  const { data: pkg, error: pkgErr } = await supabase
    .from('client_packages')
    .insert({
      client_id:    packageData.client_id,
      name:         packageData.name ?? 'Custom Package',
      price:        Number(packageData.price ?? 0),
      renewal_type: packageData.renewal_type ?? 'monthly',
      start_date:   packageData.start_date ?? new Date().toISOString().split('T')[0],
      end_date:     packageData.end_date || null,
      is_active:    packageData.is_active ?? true,
      notes:        packageData.notes || null,
    })
    .select()
    .single()

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  if (Array.isArray(items) && items.length > 0) {
    const rows = items.map((item: any, idx: number) => ({
      package_id:     pkg.id,
      label:          item.label,
      task_type:      item.task_type,
      total_quantity: Number(item.total_quantity ?? 0),
      sort_order:     idx,
    }))
    const { error: itemErr } = await supabase.from('package_items').insert(rows)
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  return NextResponse.json(pkg, { status: 201 })
}
