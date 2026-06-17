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

// POST /api/invoices/[id]/schedule — attach a payment schedule to an existing invoice
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const installments: { installment_no: number; amount: number; due_date: string }[] = body.installments ?? []

  if (!installments.length) return NextResponse.json({ error: 'No installments provided' }, { status: 400 })

  const adminDb = createAdminClient()

  // Verify invoice exists and is not already paid
  const { data: inv } = await adminDb
    .from('invoices')
    .select('id, status, total')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (inv.status === 'paid') return NextResponse.json({ error: 'Cannot add schedule to a fully paid invoice' }, { status: 400 })

  // Delete any existing pending installments first to avoid duplicates
  await adminDb
    .from('invoice_payments')
    .delete()
    .eq('invoice_id', id)
    .eq('status', 'pending')

  const rows = installments.map(inst => ({
    invoice_id:     id,
    installment_no: Number(inst.installment_no),
    amount:         Number(inst.amount),
    due_date:       inst.due_date,
    status:         'pending',
    received_at:    null,
    created_at:     new Date().toISOString(),
  }))

  const { error } = await adminDb.from('invoice_payments').insert(rows)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  return NextResponse.json({ ok: true, count: rows.length }, { status: 201 })
}
