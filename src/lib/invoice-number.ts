import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the next sequential invoice number (INV-00001, INV-00002, …)
 * via PostgreSQL sequence — atomic, no race condition.
 * Falls back to MAX scan if migration 009 hasn't been applied yet.
 */
export async function nextInvoiceNumber(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number')
  if (!error && data) return data as string

  // Fallback: scan all INV-* invoices for highest number
  const { data: rows } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', 'INV-%')
  let max = 0
  for (const row of rows ?? []) {
    const m = String(row.invoice_number ?? '').match(/(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `INV-${String(max + 1).padStart(5, '0')}`
}
