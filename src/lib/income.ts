import type { SupabaseClient } from '@supabase/supabase-js'
import type { IncomeItem } from '@/types'

export function inDateRange(dateStr: string, from: string, to: string) {
  return dateStr >= from && dateStr <= to + 'T23:59:59Z'
}

export type RevenueItem = { amount: number; received_at: string }

/** Cash-basis revenue: invoice payments + direct paid invoices + manual entries */
export async function fetchRevenueItems(adminDb: SupabaseClient): Promise<RevenueItem[]> {
  const [
    { data: allPaymentsRaw },
    { data: paidInvoicesData },
    { data: allNonDeletedInvIds },
    { data: manualEntries },
  ] = await Promise.all([
    adminDb.from('invoice_payments').select('amount, received_at, invoice_id').eq('status', 'paid').not('received_at', 'is', null),
    adminDb.from('invoices').select('id, total, received_amount, received_at, updated_at').eq('status', 'paid').is('deleted_at', null),
    adminDb.from('invoices').select('id').is('deleted_at', null),
    adminDb.from('income_entries').select('amount, date'),
  ])

  const nonDeletedInvSet = new Set((allNonDeletedInvIds ?? []).map(i => i.id))
  const allPayments = (allPaymentsRaw ?? []).filter((p: { invoice_id: string }) => nonDeletedInvSet.has(p.invoice_id))
  const invoiceIdsWithPayments = new Set(allPayments.map((p: { invoice_id: string }) => p.invoice_id))

  type PaidInvRow = { id: string; total: number; received_amount?: number; received_at?: string; updated_at: string }
  const directPaidItems = ((paidInvoicesData ?? []) as PaidInvRow[])
    .filter(inv => !invoiceIdsWithPayments.has(inv.id))
    .map(inv => ({
      amount:      inv.received_amount ?? inv.total,
      received_at: inv.received_at ?? inv.updated_at,
    }))

  const manualItems = ((manualEntries ?? []) as Array<{ amount: number; date: string }>).map(e => ({
    amount:      Number(e.amount),
    received_at: e.date,
  }))

  return [
    ...(allPayments as Array<{ amount: number; received_at: string }>).map(p => ({ amount: p.amount, received_at: p.received_at })),
    ...directPaidItems,
    ...manualItems,
  ]
}

/** Full income ledger for the income page */
export async function fetchIncomeLedger(adminDb: SupabaseClient, from?: string | null, to?: string | null): Promise<IncomeItem[]> {
  const [
    { data: paymentsRaw },
    { data: paidInvoicesData },
    { data: nonDeletedIds },
    { data: manualRaw },
  ] = await Promise.all([
    adminDb
      .from('invoice_payments')
      .select('id, amount, received_at, payment_method, reference, invoice_id, invoice:invoices(id, invoice_number, client:clients(name))')
      .eq('status', 'paid')
      .not('received_at', 'is', null)
      .order('received_at', { ascending: false }),
    adminDb
      .from('invoices')
      .select('id, invoice_number, total, received_amount, received_at, updated_at, client:clients(name)')
      .eq('status', 'paid')
      .is('deleted_at', null),
    adminDb.from('invoices').select('id').is('deleted_at', null),
    adminDb
      .from('income_entries')
      .select('id, title, amount, category, date, notes, client_id, client:clients(name)')
      .order('date', { ascending: false }),
  ])

  const nonDeleted = new Set((nonDeletedIds ?? []).map(i => i.id))
  const invoiceIdsWithPayments = new Set(
    (paymentsRaw ?? [])
      .filter((p: { invoice_id: string }) => nonDeleted.has(p.invoice_id))
      .map((p: { invoice_id: string }) => p.invoice_id)
  )

  const items: IncomeItem[] = []

  type PaymentRow = {
    id: string; amount: number; received_at: string; payment_method?: string; reference?: string
    invoice_id: string
    invoice: { id: string; invoice_number: string; client: { name: string } | { name: string }[] | null } | { id: string; invoice_number: string; client: { name: string } | { name: string }[] | null }[] | null
  }
  for (const p of (paymentsRaw ?? []) as unknown as PaymentRow[]) {
    if (!nonDeleted.has(p.invoice_id)) continue
    const inv = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice
    const clientObj = inv?.client ? (Array.isArray(inv.client) ? inv.client[0] : inv.client) : null
    items.push({
      id:              `pay-${p.id}`,
      source:          'invoice',
      title:           inv?.invoice_number ? `Payment · ${inv.invoice_number}` : 'Invoice payment',
      amount:          p.amount,
      date:            p.received_at.split('T')[0],
      client_name:     clientObj?.name,
      invoice_id:      inv?.id ?? p.invoice_id,
      invoice_number:  inv?.invoice_number,
      payment_method:  p.payment_method,
      reference:       p.reference,
      editable:        false,
    })
  }

  type PaidInv = {
    id: string; invoice_number: string; total: number; received_amount?: number
    received_at?: string; updated_at: string
    client: { name: string } | { name: string }[] | null
  }
  for (const inv of (paidInvoicesData ?? []) as unknown as PaidInv[]) {
    if (invoiceIdsWithPayments.has(inv.id)) continue
    const clientObj = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const receivedAt = inv.received_at ?? inv.updated_at
    items.push({
      id:             `inv-${inv.id}`,
      source:         'invoice',
      title:          inv.invoice_number,
      amount:         inv.received_amount ?? inv.total,
      date:           receivedAt.split('T')[0],
      client_name:    clientObj?.name,
      invoice_id:     inv.id,
      invoice_number: inv.invoice_number,
      editable:       false,
    })
  }

  type ManualRow = {
    id: string; title: string; amount: number; category?: string; date: string; notes?: string
    client_id?: string
    client: { name: string } | { name: string }[] | null
  }
  for (const e of (manualRaw ?? []) as unknown as ManualRow[]) {
    const clientObj = Array.isArray(e.client) ? e.client[0] : e.client
    items.push({
      id:          e.id,
      source:      'manual',
      title:       e.title,
      amount:      Number(e.amount),
      date:        e.date,
      category:    e.category,
      notes:       e.notes,
      client_name: clientObj?.name,
      client_id:   e.client_id,
      editable:    true,
    })
  }

  let filtered = items
  if (from) filtered = filtered.filter(i => i.date >= from)
  if (to)   filtered = filtered.filter(i => i.date <= to)

  return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount)
}
