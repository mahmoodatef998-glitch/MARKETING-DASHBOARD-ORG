export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/packages/renew { packageId }
// Creates a new package cloned from the existing one (new start_date = today),
// deactivates the old package.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { packageId } = body ?? {}
  if (!packageId) return NextResponse.json({ error: 'packageId required' }, { status: 400 })

  // Fetch the existing package + items
  const { data: pkg, error: fetchErr } = await supabase
    .from('client_packages')
    .select('*, items:package_items(*)')
    .eq('id', packageId)
    .single()

  if (fetchErr || !pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]

  // Create new package with today as start_date
  const { data: newPkg, error: createErr } = await supabase
    .from('client_packages')
    .insert({
      client_id:    pkg.client_id,
      name:         pkg.name,
      price:        pkg.price,
      renewal_type: pkg.renewal_type,
      start_date:   today,
      end_date:     null,
      is_active:    true,
      notes:        pkg.notes ?? null,
    })
    .select()
    .single()

  if (createErr || !newPkg) return NextResponse.json({ error: createErr?.message ?? 'Failed to create package' }, { status: 500 })

  // Copy items to new package
  if (Array.isArray(pkg.items) && pkg.items.length > 0) {
    const rows = pkg.items.map((item: any) => ({
      package_id:     newPkg.id,
      label:          item.label,
      task_type:      item.task_type,
      total_quantity: item.total_quantity,
      sort_order:     item.sort_order ?? 0,
    }))
    const { error: itemErr } = await supabase.from('package_items').insert(rows)
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  // Deactivate old package
  await supabase
    .from('client_packages')
    .update({ is_active: false })
    .eq('id', packageId)

  return NextResponse.json(newPkg, { status: 201 })
}
