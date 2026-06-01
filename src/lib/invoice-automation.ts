import { generateId } from './utils'
import { nextInvoiceNumber } from './invoice-number'
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

interface CompletedTask {
  title: string
  task_type?: string | null
  due_date?: string | null
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
  completedTasks?: CompletedTask[]
}

/**
 * Creates an invoice row, sends it via Gmail, and returns the invoice.
 * Does NOT update next_invoice_date — caller is responsible.
 */
const CYCLE_LABELS: Record<CycleType, string> = {
  monthly:       'Monthly',
  biweekly:      'Every 2 Weeks',
  every_10_days: 'Every 10 Days',
  custom_days:   'Custom Period',
  manual:        'Manual',
}

const TASK_TYPE_LABELS: Record<string, string> = {
  reel_video: 'Reel Video',
  design:     'Design',
  ai_video:   'AI Video',
  post:       'Social Post',
  custom:     'Custom',
}

function buildInvoiceHtml(opts: {
  clientName: string
  invoiceNumber: string
  currencySymbol: string
  amount: number
  dueDate: string
  cycleLabel: string
  completedTasks: CompletedTask[]
}): string {
  const { clientName, invoiceNumber, currencySymbol, amount, dueDate, cycleLabel, completedTasks } = opts

  const tasksSection = completedTasks.length > 0
    ? `
      <div style="margin:24px 0 0;">
        <h3 style="margin:0 0 12px;color:#1e1b4b;font-size:15px;border-bottom:2px solid #7c3aed;padding-bottom:8px;">
          ✅ Completed Work This Period
        </h3>
        <table style="width:100%;border-collapse:collapse;">
          ${completedTasks.map((t, i) => `
          <tr style="background:${i % 2 === 0 ? '#f5f3ff' : '#ffffff'};">
            <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">
              ${t.title}
            </td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#7c3aed;font-size:12px;white-space:nowrap;width:120px;">
              ${t.task_type ? TASK_TYPE_LABELS[t.task_type] ?? t.task_type : '—'}
            </td>
          </tr>`).join('')}
        </table>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f0f7;font-family:Arial,Helvetica,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f0f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:1px;">
              Pixel Marketing Agency
            </div>
            <div style="font-size:13px;color:#c4b5fd;margin-top:6px;letter-spacing:2px;text-transform:uppercase;">
              Professional Marketing Solutions
            </div>
          </td>
        </tr>

        <!-- Invoice Badge -->
        <tr>
          <td style="background:#7c3aed;padding:16px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:18px;font-weight:700;">INVOICE</td>
                <td align="right" style="color:#ddd6fe;font-size:14px;"># ${invoiceNumber}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;border-radius:0 0 12px 12px;">

            <p style="margin:0 0 20px;color:#374151;font-size:15px;">Dear <strong>${clientName}</strong>,</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
              Please find your invoice details below for the <strong>${cycleLabel}</strong> billing cycle.
              We appreciate your continued trust in Pixel Marketing Agency.
            </p>

            <!-- Invoice Details Table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#f5f3ff;">
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:13px;width:40%;">Invoice Number</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#1e1b4b;font-size:13px;font-weight:600;">${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:13px;">Billing Cycle</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">${cycleLabel}</td>
              </tr>
              <tr style="background:#f5f3ff;">
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:13px;">Service</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">Marketing & Content Creation</td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:13px;">Due Date</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#dc2626;font-size:13px;font-weight:600;">${dueDate}</td>
              </tr>
              <tr style="background:#4c1d95;">
                <td style="padding:16px;border:1px solid #7c3aed;color:#ddd6fe;font-size:14px;font-weight:700;">Total Amount</td>
                <td style="padding:16px;border:1px solid #7c3aed;color:#ffffff;font-size:20px;font-weight:900;">${currencySymbol}${amount.toLocaleString()}</td>
              </tr>
            </table>

            ${tasksSection}

            <!-- CTA -->
            <div style="margin:28px 0;background:#f5f3ff;border-left:4px solid #7c3aed;padding:16px 20px;border-radius:0 8px 8px 0;">
              <p style="margin:0;color:#4c1d95;font-size:13px;line-height:1.6;">
                To settle this invoice or for any questions, please <strong>reply to this email</strong>.
                We are happy to assist you.
              </p>
            </div>

            <p style="margin:0 0 4px;color:#374151;font-size:14px;">Thank you for your business.</p>
            <p style="margin:0;color:#7c3aed;font-size:14px;font-weight:700;">— Pixel Marketing Agency</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} Pixel Marketing Agency · All rights reserved
            </p>
            <p style="margin:4px 0 0;color:#d1d5db;font-size:11px;">
              For inquiries, reply to this email
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`
}

export async function generateAndSendInvoice(opts: GenerateInvoiceOpts) {
  const {
    supabase, clientId, clientEmail, clientName,
    amount, currency, billingPlanId, cycleType, customDays,
    completedTasks = [],
  } = opts

  const now = new Date()

  // Idempotency: skip if an invoice was already created for this client today
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const { data: existingToday } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('client_id', clientId)
    .gte('created_at', todayStart.toISOString())
    .maybeSingle()

  if (existingToday) {
    console.log(`[invoice-automation] Skipping duplicate: invoice ${existingToday.invoice_number} already exists for client ${clientId} today`)
    return existingToday as { id: string; invoice_number: string }
  }

  const invoiceNumber = await nextInvoiceNumber(supabase)
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
  const currencySymbol = currency === 'EGP' ? 'EGP ' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'
  const dueDateFormatted = new Date(due).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const cycleLabel = cycleType === 'custom_days' && customDays
    ? `Every ${customDays} Days`
    : CYCLE_LABELS[cycleType]

  const emailSubject = `Invoice ${invoiceNumber} — ${currencySymbol}${amount.toLocaleString()} due ${dueDateFormatted} | Pixel Marketing Agency`

  const emailBody = [
    `Dear ${clientName},`,
    '',
    `Please find your invoice details for the ${cycleLabel} billing cycle:`,
    '',
    `  Invoice #:     ${invoiceNumber}`,
    `  Billing Cycle: ${cycleLabel}`,
    `  Amount:        ${currencySymbol}${amount.toLocaleString()}`,
    `  Due Date:      ${dueDateFormatted}`,
    ...(completedTasks.length > 0 ? [
      '',
      'Completed Work This Period:',
      ...completedTasks.map((t, i) => `  ${i + 1}. ${t.title}${t.task_type ? ` (${TASK_TYPE_LABELS[t.task_type] ?? t.task_type})` : ''}`),
    ] : []),
    '',
    'To settle this invoice or for any questions, please reply to this email.',
    '',
    'Thank you for your business.',
    '',
    '— Pixel Marketing Agency',
  ].join('\n')

  const emailHtml = buildInvoiceHtml({
    clientName,
    invoiceNumber,
    currencySymbol,
    amount,
    dueDate: dueDateFormatted,
    cycleLabel,
    completedTasks,
  })

  let emailStatus: 'sent' | 'failed' = 'sent'
  let emailError: string | undefined

  try {
    await sendEmail({ to: clientEmail, subject: emailSubject, body: emailBody, html: emailHtml })
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
