import { generateId, generateInvoiceNumber } from './utils'
import { sendEmail } from './gmail'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CycleType = 'monthly' | 'biweekly' | 'every_10_days' | 'custom_days' | 'manual'

/** Calculate the next invoice date based on cycle */
export function nextInvoiceDate(from: Date, cycle: CycleType, customDays?: number): Date {
  const d = new Date(from)
  switch (cycle) {
    case 'monthly':      d.setMonth(d.getMonth() + 1); break
    case 'biweekly':     d.setDate(d.getDate() + 14);  break
    case 'every_10_days':d.setDate(d.getDate() + 10);  break
    case 'custom_days':  d.setDate(d.getDate() + (customDays ?? 30)); break
    case 'manual':       d.setFullYear(d.getFullYear() + 100); break // never auto
  }
  return d
}

export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Due date = invoice date + 7 days */
function dueDate(from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() + 7)
  return toDateStr(d)
}

interface GenerateInvoiceOpts {
  supabase: SupabaseClient
  clientId: string
  clientEmail: string
  clientName: string
  amount: number
  currency: string
  billingPlanId: string
  cycleType: CycleType
  customDays?: number
}

/**
 * Creates an invoice row, sends it via Gmail, and returns the invoice.
 * Does NOT update next_invoice_date — caller is responsible.
 */
export async function generateAndSendInvoice(opts: GenerateInvoiceOpts) {
  const {
    supabase, clientId, clientEmail, clientName,
    amount, currency, billingPlanId, cycleType, customDays,
  } = opts

  const now = new Date()
  const invoiceNumber = generateInvoiceNumber()
  const due = dueDate(now)

  const invoice = {
    id:             generateId(),
    invoice_number: invoiceNumber,
    client_id:      clientId,
    items: [{
      id:          generateId(),
      description: 'Agency Services',
      quantity:    1,
      unit_price:  amount,
      total:       amount,
    }],
    subtotal:    amount,
    tax:         0,
    total:       amount,
    currency,
    status:      'sent',
    due_date:    due,
    issued_date: now.toISOString(),
    notes:       `Auto-generated invoice (${cycleType.replace(/_/g, ' ')})`,
    created_at:  now.toISOString(),
    updated_at:  now.toISOString(),
  }

  const { error: insertErr } = await supabase.from('invoices').insert(invoice)
  if (insertErr) throw new Error(`Invoice insert failed: ${insertErr.message}`)

  // Send email
  const currencySymbol = currency === 'EGP' ? 'EGP ' : currency === 'EUR' ? '€' : '$'
  const emailSubject = `Invoice ${invoiceNumber} — ${currencySymbol}${amount.toLocaleString()} due ${new Date(due).toLocaleDateString()}`
  const emailBody = [
    `Dear ${clientName},`,
    '',
    `Please find your invoice details below:`,
    '',
    `  Invoice #:  ${invoiceNumber}`,
    `  Amount:     ${currencySymbol}${amount.toLocaleString()}`,
    `  Due Date:   ${new Date(due).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    '',
    'To settle this invoice or for any questions, please reply to this email.',
    '',
    'Thank you for your business.',
    '',
    '— Agency OS',
  ].join('\n')

  let emailStatus: 'sent' | 'failed' = 'sent'
  let emailError: string | undefined

  try {
    await sendEmail({ to: clientEmail, subject: emailSubject, body: emailBody })
  } catch (err: unknown) {
    emailStatus = 'failed'
    emailError  = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[invoice-automation] sendEmail failed:', emailError)
  }

  // Log the automation (always, even on email failure)
  await supabase.from('automation_logs').insert({
    type:            'payment_reminder',
    recipient_email: clientEmail,
    subject:         `Invoice ${invoiceNumber}`,
    status:          emailStatus,
    ...(emailError ? { error: emailError } : {}),
    created_at:      now.toISOString(),
  })

  // Advance next_invoice_date
  const next = nextInvoiceDate(now, cycleType, customDays)
  await supabase
    .from('billing_plans')
    .update({ next_invoice_date: toDateStr(next), updated_at: now.toISOString() })
    .eq('id', billingPlanId)

  return invoice
}
