export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  reel_video: { label: 'Reel Videos',   icon: '🎬' },
  design:     { label: 'Design Posts',  icon: '🎨' },
  ai_video:   { label: 'AI Videos',     icon: '🤖' },
  post:       { label: 'Social Posts',  icon: '📱' },
  custom:     { label: 'Custom Tasks',  icon: '✨' },
}

function pct(done: number, total: number): number {
  if (total === 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function currSym(currency: string): string {
  const map: Record<string, string> = { EGP: 'EGP ', EUR: '€', GBP: '£', AED: 'AED ', USD: '$' }
  return map[currency] ?? currency + ' '
}

interface BreakdownItem {
  type: string
  label: string
  icon: string
  done: number
  total: number
}

function buildProfessionalInvoiceHtml(opts: {
  clientName: string
  invoiceNumber: string
  issuedDate: string
  dueDate: string
  cycleLabel: string
  currencySymbol: string
  amount: number
  packageName: string | null
  breakdown: BreakdownItem[]
  totalDone: number
  totalInPackage: number
  hasPackage: boolean
  senderName: string
}): string {
  const {
    clientName, invoiceNumber, issuedDate, dueDate, cycleLabel,
    currencySymbol, amount, packageName, breakdown, totalDone,
    totalInPackage, hasPackage, senderName,
  } = opts

  const overallPct = pct(totalDone, totalInPackage)

  // ── Progress section ──────────────────────────────────────────────────────
  const breakdownRows = breakdown.map((b, i) => {
    const p = pct(b.done, b.total)
    const bg = i % 2 === 0 ? '#ffffff' : '#faf9ff'
    const doneColor = b.done >= b.total && b.total > 0 ? '#16a34a' : b.done > 0 ? '#7c3aed' : '#94a3b8'
    const pillBg    = p >= 100 ? '#dcfce7' : p >= 50 ? '#ede9fe' : '#fff7ed'
    const pillColor = p >= 100 ? '#16a34a' : p >= 50 ? '#7c3aed' : '#d97706'

    return `
      <tr style="background:${bg};border-bottom:1px solid #f1f0fb;">
        <td style="padding:12px 14px;font-size:13px;color:#374151;font-weight:500;">${b.icon}&nbsp;${b.label}</td>
        <td style="padding:12px 14px;text-align:center;font-size:15px;font-weight:700;color:${doneColor};">${b.done}</td>
        ${hasPackage ? `<td style="padding:12px 14px;text-align:center;font-size:13px;color:#94a3b8;">${b.total}</td>` : ''}
        ${hasPackage ? `<td style="padding:12px 14px;text-align:center;"><span style="background:${pillBg};color:${pillColor};font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;">${p}%</span></td>` : ''}
      </tr>`
  }).join('')

  const progressSection = hasPackage
    ? `
    <div style="background:linear-gradient(135deg,#faf8ff,#f5f3ff);border:1px solid #ddd6fe;border-radius:12px;padding:24px;margin-bottom:28px;">

      <!-- Section title -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="color:#4c1d95;font-size:15px;font-weight:700;">&#128230; Package Delivery Progress</td>
          ${packageName ? `<td style="text-align:right;"><span style="font-size:12px;color:#7c3aed;background:#ede9fe;padding:4px 12px;border-radius:999px;font-weight:600;">${packageName}</span></td>` : ''}
        </tr>
      </table>

      <!-- Progress stats -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
        <tr>
          <td style="font-size:13px;color:#374151;font-weight:600;">${totalDone} of ${totalInPackage} deliverables completed</td>
          <td style="text-align:right;font-size:20px;font-weight:900;color:#7c3aed;">${overallPct}%</td>
        </tr>
      </table>

      <!-- Progress bar (table-based for email compat) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;border-radius:8px;overflow:hidden;height:12px;margin-bottom:20px;">
        <tr>
          <td style="background:linear-gradient(90deg,#7c3aed,#a855f7);width:${overallPct}%;height:12px;border-radius:8px;font-size:0;">&nbsp;</td>
          ${overallPct < 100 ? `<td style="width:${100 - overallPct}%;height:12px;font-size:0;">&nbsp;</td>` : ''}
        </tr>
      </table>

      <!-- Breakdown table -->
      ${breakdown.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#ede9fe;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #ddd6fe;">Content Type</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #ddd6fe;">Delivered</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #ddd6fe;">Target</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #ddd6fe;">Progress</th>
          </tr>
        </thead>
        <tbody>${breakdownRows}</tbody>
      </table>` : ''}
    </div>`
    : (breakdown.length > 0 ? `
    <div style="margin-bottom:28px;">
      <h3 style="margin:0 0 12px;color:#1e1b4b;font-size:15px;font-weight:700;border-bottom:2px solid #7c3aed;padding-bottom:8px;">&#9989; Completed Work This Period</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${breakdown.map((b, i) => `
        <tr style="background:${i % 2 === 0 ? '#f5f3ff' : '#ffffff'};">
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">${b.icon}&nbsp;${b.label}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#7c3aed;font-size:14px;font-weight:700;text-align:center;width:70px;">${b.done}</td>
        </tr>`).join('')}
      </table>
    </div>` : '')

  // ── Full HTML ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f0f7;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f0f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- ── HEADER ───────────────────────────────────────────────────── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f0d2e 0%,#1e1b4b 40%,#4c1d95 80%,#6d28d9 100%);padding:40px 40px 32px;border-radius:16px 16px 0 0;text-align:center;">
            <div style="font-size:34px;font-weight:900;color:#ffffff;letter-spacing:3px;text-transform:uppercase;line-height:1;">${BRAND}</div>
            <div style="font-size:10px;color:#c4b5fd;margin-top:10px;letter-spacing:4px;text-transform:uppercase;">Digital Marketing Agency</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
              <tr>
                <td style="height:1px;background:linear-gradient(90deg,transparent,rgba(167,139,250,0.5),transparent);font-size:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── INVOICE BADGE ────────────────────────────────────────────── -->
        <tr>
          <td style="background:#7c3aed;padding:14px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Invoice</td>
                <td style="text-align:right;color:#ddd6fe;font-size:14px;font-weight:600;font-family:monospace;"># ${invoiceNumber}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── BODY ─────────────────────────────────────────────────────── -->
        <tr>
          <td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;">

            <!-- Greeting -->
            <p style="margin:0 0 12px;color:#0f172a;font-size:17px;font-weight:600;">Dear ${clientName},</p>
            <p style="margin:0 0 32px;color:#64748b;font-size:14px;line-height:1.8;">
              We hope this message finds you well. Please find your invoice details below for the
              <strong style="color:#4c1d95;">${cycleLabel}</strong> billing period.
              At <strong style="color:#4c1d95;">${BRAND}</strong>, we are committed to delivering
              outstanding results and appreciate your continued partnership.
            </p>

            <!-- ── Invoice Details ───────────────────────────────────────── -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:32px;">
              <tr style="background:#f5f3ff;">
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;width:42%;">Invoice Number</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#1e1b4b;font-size:14px;font-weight:700;font-family:monospace;">${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Billing Cycle</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">${cycleLabel}</td>
              </tr>
              <tr style="background:#f5f3ff;">
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Service</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">Digital Marketing &amp; Content Creation</td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Issue Date</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#374151;font-size:13px;">${issuedDate}</td>
              </tr>
              <tr style="background:#f5f3ff;">
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Due Date</td>
                <td style="padding:13px 16px;border:1px solid #e2e8f0;color:#dc2626;font-size:13px;font-weight:700;">${dueDate}</td>
              </tr>
              <tr style="background:#1e1b4b;">
                <td style="padding:20px 16px;border:1px solid #4c1d95;color:#ddd6fe;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Amount Due</td>
                <td style="padding:20px 16px;border:1px solid #4c1d95;color:#ffffff;font-size:26px;font-weight:900;">${currencySymbol}${amount.toLocaleString()}</td>
              </tr>
            </table>

            ${progressSection}

            <!-- ── CTA ───────────────────────────────────────────────────── -->
            <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:18px 22px;border-radius:0 10px 10px 0;margin-bottom:32px;">
              <p style="margin:0 0 6px;color:#4c1d95;font-size:14px;font-weight:700;">How to Pay</p>
              <p style="margin:0;color:#374151;font-size:13px;line-height:1.7;">
                To settle this invoice, please <strong>reply to this email</strong> or contact your account manager directly.
                We accept all major payment methods and are happy to accommodate your preference.
              </p>
            </div>

            <!-- ── Signature ─────────────────────────────────────────────── -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #f1f0f7;padding-top:24px;margin-top:0;">
              <tr>
                <td>
                  <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;">Best regards,</p>
                  <p style="margin:0 0 3px;color:#0f172a;font-size:17px;font-weight:800;">${senderName}</p>
                  <p style="margin:0 0 3px;color:#7c3aed;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${BRAND}</p>
                  <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">&#128231; Reply to this email for any questions or inquiries</p>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#4c1d95,#7c3aed);display:inline-flex;align-items:center;justify-content:center;">
                    <span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-1px;">${BRAND.charAt(0).toUpperCase()}</span>
                  </div>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── FOOTER ───────────────────────────────────────────────────── -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">&#169; ${new Date().getFullYear()} ${BRAND} &middot; All rights reserved</p>
            <p style="margin:5px 0 0;color:#d1d5db;font-size:11px;">This invoice was generated automatically. Please retain a copy for your records.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()

  // ── Auth: admin only ────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const senderName: string = profile?.display_name ?? 'Mahmoud Atef'

  // ── Fetch invoice + client ───────────────────────────────────────────────
  const { data: inv } = await supabase
    .from('invoices')
    .select('*, client:clients(id, name, email, phone, country)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const client = inv.client as { id: string; name: string; email: string; phone?: string; country?: string } | null
  if (!client?.email) return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })

  // ── Fetch active client package ─────────────────────────────────────────
  const { data: pkgRow } = await supabase
    .from('client_packages')
    .select('id, name, items:package_items(task_type, total_quantity, label)')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasPackage = !!pkgRow

  // Build a map of type → total_quantity from the package
  const packageTotals: Record<string, number> = {}
  const packageLabels: Record<string, string> = {}
  if (pkgRow?.items) {
    for (const item of pkgRow.items as { task_type: string; total_quantity: number; label: string }[]) {
      packageTotals[item.task_type] = (packageTotals[item.task_type] ?? 0) + item.total_quantity
      if (!packageLabels[item.task_type]) packageLabels[item.task_type] = item.label
    }
  }

  const totalInPackage = Object.values(packageTotals).reduce((s, v) => s + v, 0)

  // ── Fetch done tasks for this client ────────────────────────────────────
  const { data: doneTasks } = await supabase
    .from('tasks')
    .select('id, task_type')
    .eq('client_id', client.id)
    .eq('status', 'done')
    .is('deleted_at', null)

  // Group done tasks by type
  const doneByType: Record<string, number> = {}
  for (const t of doneTasks ?? []) {
    const k = t.task_type ?? 'custom'
    doneByType[k] = (doneByType[k] ?? 0) + 1
  }

  const totalDone = Object.values(doneByType).reduce((s, v) => s + v, 0)

  // Build breakdown array (union of package types + done types)
  const allTypes = new Set([...Object.keys(packageTotals), ...Object.keys(doneByType)])
  const breakdown: BreakdownItem[] = Array.from(allTypes)
    .filter(type => (doneByType[type] ?? 0) > 0 || (packageTotals[type] ?? 0) > 0)
    .map(type => ({
      type,
      label: packageLabels[type] ?? TYPE_CONFIG[type]?.label ?? type,
      icon:  TYPE_CONFIG[type]?.icon ?? '📋',
      done:  doneByType[type] ?? 0,
      total: packageTotals[type] ?? 0,
    }))
    .sort((a, b) => b.done - a.done)

  // ── Build email ─────────────────────────────────────────────────────────
  const cycleLabel = (() => {
    const labels: Record<string, string> = {
      monthly: 'Monthly', biweekly: 'Every 2 Weeks',
      every_10_days: 'Every 10 Days', custom_days: 'Custom Period', manual: 'Manual',
    }
    return inv.notes?.match(/Every (\d+) Days/)?.[0] ?? labels[inv.billing_cycle ?? ''] ?? 'Service'
  })()

  const currencySymbol = currSym(inv.currency ?? 'AED')
  const issuedDate = fmtDate(inv.issued_date)
  const dueDate    = inv.due_date ? fmtDate(inv.due_date) : '—'

  const emailHtml = buildProfessionalInvoiceHtml({
    clientName: client.name,
    invoiceNumber: inv.invoice_number,
    issuedDate,
    dueDate,
    cycleLabel,
    currencySymbol,
    amount: inv.total,
    packageName: pkgRow?.name ?? null,
    breakdown,
    totalDone,
    totalInPackage,
    hasPackage,
    senderName,
  })

  const emailText = [
    `Dear ${client.name},`,
    '',
    `Please find your invoice ${inv.invoice_number} for the ${cycleLabel} billing period.`,
    '',
    `Amount Due: ${currencySymbol}${inv.total.toLocaleString()}`,
    `Due Date:   ${dueDate}`,
    '',
    ...(breakdown.length > 0 ? [
      hasPackage
        ? `Delivery Progress: ${totalDone} of ${totalInPackage} tasks completed (${pct(totalDone, totalInPackage)}%)`
        : `Completed Tasks: ${totalDone}`,
      ...breakdown.map(b => `  ${b.icon} ${b.label}: ${b.done}${hasPackage ? ` / ${b.total}` : ''}`),
    ] : []),
    '',
    'To settle this invoice, please reply to this email.',
    '',
    `Best regards,`,
    senderName,
    BRAND,
  ].join('\n')

  const subject = `Invoice ${inv.invoice_number} — ${currencySymbol}${inv.total.toLocaleString()} due ${dueDate} | ${BRAND}`

  try {
    await sendEmail({
      to: client.email,
      subject,
      body: emailText,
      html: emailHtml,
      skipSignature: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Email send failed'
    console.error('[invoices/send]', msg)

    await supabase.from('automation_logs').insert({
      type: 'payment_reminder',
      recipient_email: client.email,
      subject: `Invoice ${inv.invoice_number}`,
      status: 'failed',
      error: msg,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── Update status to 'sent' if draft ────────────────────────────────────
  if (inv.status === 'draft') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  // ── Log success ─────────────────────────────────────────────────────────
  await supabase.from('automation_logs').insert({
    type: 'payment_reminder',
    recipient_email: client.email,
    subject: `Invoice ${inv.invoice_number}`,
    status: 'sent',
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
