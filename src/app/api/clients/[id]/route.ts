export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionClient, deleteNotionPage } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { parseBody, ClientUpdateSchema } from '@/lib/validation'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { billing_plan, ...clientBody } = raw
  const parsed = parseBody(ClientUpdateSchema, clientBody)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const updated = { ...parsed.data, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('clients')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
    try { await updateNotionClient(data.notion_id, updated as Record<string, unknown>) } catch (e) {
      console.error('[clients PUT] Notion sync failed:', e)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data } = await supabase.from('clients').select('notion_id').eq('id', id).single()
  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
