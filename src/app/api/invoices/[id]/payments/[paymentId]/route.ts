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

// PATCH — mark a pending installment as received
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const { id, paymentId } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })

  const adminDb = createAdminClient()

  const { error: payErr } = await adminDb
    .from('invoice_payments')
    .update({
      amount,
      payment_method: body.payment_method || null,
      reference:      body.reference || null,
      notes:          body.notes || null,
      received_at:    body.received_at ? new Date(body.received_at).toISOString() : new Date().toISOString(),
      status:         'paid',
    })
    .eq('id', paymentId)
    .eq('invoice_id', id)

  if (payErr) return NextResponse.json({ error: dbError(payErr) }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv } = await adminDb
    .from('invoices')
    .select('*, client:clients(id, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const { data: paidRows } = await adminDb
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', id)
    .eq('status', 'paid')

  const totalReceived = (paidRows ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)
  const fullyPaid = totalReceived >= inv.total

  const { data: updatedInv, error: invErr } = await adminDb
    .from('invoices')
    .update({
      received_amount: totalReceived,
      received_at:     new Date().toISOString(),
      status:          fullyPaid ? 'paid' : (inv.status === 'draft' ? 'sent' : inv.status),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: dbError(invErr) }, { status: 500 })

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

  return NextResponse.json({ invoice: updatedInv, nextInvoiceDate: nextInvoiceDateResult })
}
