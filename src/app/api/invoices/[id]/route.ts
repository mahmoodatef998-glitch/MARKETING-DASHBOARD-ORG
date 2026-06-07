export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionInvoice, deleteNotionPage } from '@/lib/notion'
import { dbError } from '@/lib/utils'
import { nextInvoiceDate, toDateStr, type CycleType } from '@/lib/invoice-automation'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// ── Mark as paid / overdue ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr  = await requireAdmin(supabase)
  if (authErr) return authErr

  const { action } = await req.json().catch(() => ({}))

  if (action === 'mark_paid') {
    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

    const client = inv.client as any
    const plan = (client?.billing_plans as any[])?.find((p: any) => p.is_active)
    if (plan && plan.cycle_type !== 'manual') {
      const next = nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)
      await supabase
        .from('billing_plans')
        .update({ next_invoice_date: toDateStr(next) })
        .eq('id', plan.id)
    }

    return NextResponse.json({
      ...data,
      nextInvoiceDate: plan ? toDateStr(nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)) : null,
    })
  }

  if (action === 'mark_overdue') {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json()

  let updated: Record<string, unknown> = {
    invoice_number: body.invoice_number,
    client_id:      body.client_id,
    status:         body.status,
    due_date:       body.due_date || null,
    issued_date:    body.issued_date,
    notes:          body.notes ?? null,
    updated_at:     new Date().toISOString(),
  }

  if (body.items) {
    const subtotal = (body.items as Array<{quantity: number; unit_price: number}>).reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const tax = body.tax ?? 0
    updated = { ...updated, items: body.items, subtotal, total: subtotal + (subtotal * tax) / 100, tax }
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionInvoice(data.notion_id, updated) } catch {}
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const { data } = await supabase.from('invoices').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
