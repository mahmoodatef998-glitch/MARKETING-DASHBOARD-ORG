export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionClient, deleteNotionPage } from '@/lib/notion'
import { generateId, dbError } from '@/lib/utils'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json()
  const { billing_plan, ...clientBody } = body
  const updated = { ...clientBody, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('clients')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  // Upsert billing plan
  if (billing_plan !== undefined) {
    const { data: existing } = await supabase
      .from('billing_plans')
      .select('id')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!billing_plan?.cycle_type) {
      // User cleared the billing plan — deactivate existing
      if (existing) {
        await supabase.from('billing_plans').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', existing.id)
      }
    } else if (existing) {
      await supabase.from('billing_plans').update({
        cycle_type:        billing_plan.cycle_type,
        amount:            Number(billing_plan.amount),
        currency:          billing_plan.currency ?? 'USD',
        custom_days:       billing_plan.cycle_type === 'custom_days' ? Number(billing_plan.custom_days) : null,
        next_invoice_date: billing_plan.next_invoice_date,
        is_active:         true,
        updated_at:        new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('billing_plans').insert({
        id:                generateId(),
        client_id:         id,
        cycle_type:        billing_plan.cycle_type,
        amount:            Number(billing_plan.amount),
        currency:          billing_plan.currency ?? 'USD',
        custom_days:       billing_plan.cycle_type === 'custom_days' ? Number(billing_plan.custom_days) : null,
        next_invoice_date: billing_plan.next_invoice_date,
        is_active:         true,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      })
    }
  }

  if (data?.notion_id) {
    try { await updateNotionClient(data.notion_id, updated) } catch {}
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const { data } = await supabase.from('clients').select('notion_id').eq('id', id).single()
  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
