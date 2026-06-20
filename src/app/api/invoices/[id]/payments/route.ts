export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'
import { nextInvoiceDate, toDateStr, buildReceiptHtml, type CycleType } from '@/lib/invoice-automation'
import { sendEmail } from '@/lib/gmail'

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
    .order('installment_no', { ascending: true, nullsFirst: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true, nullsFirst: false })

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
    .select('*, client:clients(id, name, email, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Insert payment record (ad-hoc, always paid immediately)
  const { data: payment, error: payErr } = await adminDb
    .from('invoice_payments')
    .insert({
      invoice_id:     id,
      amount,
      payment_method: body.payment_method || null,
      reference:      body.reference || null,
      notes:          body.notes || null,
      received_at:    body.received_at || new Date().toISOString(),
      status:         'paid',
    })
    .select()
    .single()

  if (payErr) return NextResponse.json({ error: dbError(payErr) }, { status: 500 })

  // Recalculate total received (only paid installments)
  const { data: allPayments } = await adminDb
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', id)
    .eq('status', 'paid')

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

  // Send receipt email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invClient = inv.client as any
  if (invClient?.email) {
    const currSym = inv.currency === 'EGP' ? 'EGP ' : inv.currency === 'EUR' ? '€' : inv.currency === 'GBP' ? '£' : '$'
    const receiptSubject = `Payment Receipt — ${inv.invoice_number} | ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`
    const receiptHtml = buildReceiptHtml({
      clientName:     invClient.name ?? 'Valued Client',
      invoiceNumber:  inv.invoice_number,
      currencySymbol: currSym,
      amountReceived: amount,
      totalPaid:      totalReceived,
      invoiceTotal:   inv.total,
      receivedAt:     new Date().toISOString(),
      isFullyPaid:    fullyPaid,
    })
    const receiptText = [
      `Dear ${invClient.name ?? 'Valued Client'},`,
      '',
      `Payment received for invoice ${inv.invoice_number}.`,
      `Amount received: ${currSym}${amount.toLocaleString()}`,
      `Total paid: ${currSym}${totalReceived.toLocaleString()} of ${currSym}${inv.total.toLocaleString()}`,
      fullyPaid ? 'Status: FULLY PAID' : `Remaining balance: ${currSym}${Math.max(0, inv.total - totalReceived).toLocaleString()}`,
      '',
      `Thank you for your business.`,
      `— ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`,
    ].join('\n')

    let emailStatus: 'sent' | 'failed' = 'sent'
    let emailError: string | undefined
    try {
      await sendEmail({ to: invClient.email, subject: receiptSubject, body: receiptText, html: receiptHtml })
    } catch (err: unknown) {
      emailStatus = 'failed'
      emailError = err instanceof Error ? err.message : 'Unknown error'
      console.error('[payments] receipt email failed:', emailError)
    }

    await adminDb.from('automation_logs').insert({
      type:            'payment_receipt',
      recipient_email: invClient.email,
      subject:         receiptSubject,
      status:          emailStatus,
      ...(emailError ? { error: emailError } : {}),
      created_at:      new Date().toISOString(),
    })
  }

  return NextResponse.json({ payment, invoice: updatedInv, nextInvoiceDate: nextInvoiceDateResult }, { status: 201 })
}
