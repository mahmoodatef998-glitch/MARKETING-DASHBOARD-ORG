import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the next sequential invoice number (INV-00001, INV-00002, …)
 * by scanning the last 500 invoices for the highest numeric suffix.
 * Race-condition risk is negligible for a single-agency workload.
 */
export async function nextInvoiceNumber(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(500)

  let max = 0
  for (const row of data ?? []) {
    const m = String(row.invoice_number ?? '').match(/(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }

  return `INV-${String(max + 1).padStart(5, '0')}`
}
