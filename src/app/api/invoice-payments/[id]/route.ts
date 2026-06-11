export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'

// DELETE /api/invoice-payments/[id] — remove a payment and recalculate invoice balance
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminDb = createAdminClient()

  // Find payment to get invoice_id
  const { data: payment } = await adminDb
    .from('invoice_payments')
    .select('invoice_id')
    .eq('id', id)
    .single()

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const { error: delErr } = await adminDb.from('invoice_payments').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: dbError(delErr) }, { status: 500 })

  // Recalculate remaining payments
  const { data: remaining } = await adminDb
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', payment.invoice_id)

  const totalReceived = (remaining ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)

  // Fetch invoice total to determine if still paid
  const { data: inv } = await adminDb
    .from('invoices')
    .select('total, status')
    .eq('id', payment.invoice_id)
    .single()

  const newStatus = totalReceived <= 0
    ? 'draft'
    : totalReceived >= (inv?.total ?? 0)
    ? 'paid'
    : inv?.status === 'paid'
    ? 'sent'
    : inv?.status ?? 'sent'

  const { data: updatedInv } = await adminDb
    .from('invoices')
    .update({
      received_amount: totalReceived || null,
      received_at:     totalReceived > 0 ? new Date().toISOString() : null,
      status:          newStatus,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', payment.invoice_id)
    .select()
    .single()

  return NextResponse.json({ success: true, invoice: updatedInv })
}
