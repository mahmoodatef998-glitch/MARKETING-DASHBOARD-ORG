export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { nextInvoiceDate, toDateStr } from '@/lib/invoice-automation'
import type { CycleType } from '@/lib/invoice-automation'

export async function POST(_req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminDb = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: duePlans } = await adminDb
    .from('billing_plans')
    .select('*, client:clients(id, name, deleted_at)')
    .eq('is_active', true)
    .neq('cycle_type', 'manual')
    .lte('next_invoice_date', today)

  if (!duePlans?.length) return NextResponse.json({ created: 0, invoices: [] })

  const created = []
  for (let i = 0; i < duePlans.length; i++) {
    const plan = duePlans[i]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = plan.client as any
    if (!client || client.deleted_at) continue

    const { data: inv } = await adminDb.from('invoices').insert({
      invoice_number: `INV-AUTO-${Date.now()}-${i}`,
      client_id:      plan.client_id,
      items:          [{ description: 'Service — Auto Invoice', quantity: 1, unit_price: plan.amount, total: plan.amount }],
      subtotal:       plan.amount,
      tax:            0,
      total:          plan.amount,
      status:         'sent',
      issued_date:    today,
      due_date:       today,
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }).select().single()

    if (inv) {
      created.push(inv)
      const next = nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)
      await adminDb.from('billing_plans').update({ next_invoice_date: toDateStr(next) }).eq('id', plan.id)
    }
  }

  return NextResponse.json({ created: created.length, invoices: created })
}
