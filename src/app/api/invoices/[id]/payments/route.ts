export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'
import { nextInvoiceDate, toDateStr, type CycleType } from '@/lib/invoice-automation'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// GET /api/invoices/[id]/payments — list all payments for an invoice
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', id)
    .order('received_at', { ascending: true })

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/invoices/[id]/payments — record a new payment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })

  // Fetch invoice
  const adminDb = createAdminClient()
  const { data: inv } = await adminDb
    .from('invoices')
    .select('*, client:clients(id, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Insert payment record
  const { data: payment, error: payErr } = await adminDb
    .from('invoice_payments')
    .insert({
      invoice_id:     id,
      amount,
      payment_method: body.payment_method || null,
      reference:      body.reference || null,
      notes:          body.notes || null,
      received_at:    body.received_at || new Date().toISOString(),
    })
    .select()
    .single()

  if (payErr) return NextResponse.json({ error: dbError(payErr) }, { status: 500 })

  // Recalculate total received across all payments
  const { data: allPayments } = await adminDb
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', id)

  const totalReceived = (allPayments ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)
  const fullyPaid = totalReceived >= inv.total

  // Update invoice received_amount and status
  const { data: updatedInv, error: invErr } = await adminDb
    .from('invoices')
    .update({
      received_amount: totalReceived,
      received_at:     new Date().toISOString(),
      status:          fullyPaid ? 'paid' : inv.status,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: dbError(invErr) }, { status: 500 })

  // Advance billing plan if fully paid
  let nextInvoiceDateResult: string | null = null
  if (fullyPaid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = inv.client as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (client?.billing_plans as any[])?.find((p: any) => p.is_active)
    if (plan && plan.cycle_type !== 'manual') {
      const next = nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)
      await adminDb.from('billing_plans').update({ next_invoice_date: toDateStr(next) }).eq('id', plan.id)
      nextInvoiceDateResult = toDateStr(next)
    }
  }

  return NextResponse.json({ payment, invoice: updatedInv, nextInvoiceDate: nextInvoiceDateResult }, { status: 201 })
}
