export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.cycle_type !== undefined) updates.cycle_type = body.cycle_type
  if (body.amount !== undefined) updates.amount = Number(body.amount)
  if (body.currency !== undefined) updates.currency = body.currency
  if (body.custom_days !== undefined) updates.custom_days = body.cycle_type === 'custom_days' ? Number(body.custom_days) : null
  if (body.next_invoice_date !== undefined) updates.next_invoice_date = body.next_invoice_date
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)

  const { error } = await supabase.from('billing_plans').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await supabase.from('billing_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
