export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// POST /api/invoices/[id]/renew — create a renewal invoice for the same client
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json().catch(() => ({}))
  const { total, description, tax = 0, payment_schedule } = body

  if (!total || Number(total) <= 0) return NextResponse.json({ error: 'total is required' }, { status: 400 })

  const adminDb = createAdminClient()

  const { data: orig } = await adminDb
    .from('invoices')
    .select('client_id, status, total, items')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!orig) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (orig.status !== 'paid') return NextResponse.json({ error: 'Original invoice must be fully paid before renewal' }, { status: 400 })

  const { count } = await adminDb.from('invoices').select('*', { count: 'exact', head: true })
  const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`

  const desc = description || 'Service Renewal'
  const numTotal = Number(total)
  const numTax = Number(tax)
  const subtotal = numTotal / (1 + numTax / 100)
  const lineItems = [{ description: desc, quantity: 1, unit_price: Math.round(subtotal * 100) / 100, total: numTotal }]

  const lastDue = payment_schedule?.[(payment_schedule?.length ?? 1) - 1]?.due_date ?? null

  const { data: newInv, error: invErr } = await adminDb
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      client_id:      orig.client_id,
      status:         'sent',
      issued_date:    new Date().toISOString().split('T')[0],
      due_date:       lastDue,
      items:          lineItems,
      subtotal:       Math.round(subtotal * 100) / 100,
      tax:            numTax,
      total:          numTotal,
      notes:          desc,
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: dbError(invErr) }, { status: 500 })

  if (payment_schedule && Array.isArray(payment_schedule) && payment_schedule.length > 0 && newInv) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installments = payment_schedule.map((inst: any) => ({
      invoice_id:     newInv.id,
      installment_no: Number(inst.installment_no),
      amount:         Number(inst.amount),
      due_date:       inst.due_date,
      status:         'pending',
      received_at:    null,
      created_at:     new Date().toISOString(),
    }))
    await adminDb.from('invoice_payments').insert(installments)
  }

  return NextResponse.json(newInv, { status: 201 })
}
