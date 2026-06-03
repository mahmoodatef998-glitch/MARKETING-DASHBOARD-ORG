export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// ─── PUT /api/packages/[id] ───────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json()
  const { items, ...packageData } = body

  const { data: pkg, error: pkgErr } = await supabase
    .from('client_packages')
    .update({
      name:         packageData.name,
      price:        Number(packageData.price ?? 0),
      renewal_type: packageData.renewal_type,
      start_date:   packageData.start_date,
      end_date:     packageData.end_date || null,
      is_active:    packageData.is_active ?? true,
      notes:        packageData.notes || null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  // Replace all items
  if (Array.isArray(items)) {
    await supabase.from('package_items').delete().eq('package_id', id)
    if (items.length > 0) {
      const rows = items.map((item: any, idx: number) => ({
        package_id:     id,
        label:          item.label,
        task_type:      item.task_type,
        total_quantity: Number(item.total_quantity ?? 0),
        sort_order:     idx,
      }))
      const { error: itemErr } = await supabase.from('package_items').insert(rows)
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
    }
  }

  return NextResponse.json(pkg)
}

// ─── DELETE /api/packages/[id] ────────────────────────────────────────────────
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const { error } = await supabase.from('client_packages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
