export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  reel_video: { label: 'Reel Videos',  icon: '🎬' },
  design:     { label: 'Design Posts', icon: '🎨' },
  ai_video:   { label: 'AI Videos',    icon: '🤖' },
  post:       { label: 'Social Posts', icon: '📱' },
  custom:     { label: 'Custom Tasks', icon: '✨' },
}

function pct(done: number, total: number): number {
  if (total === 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inv, error } = await supabase
    .from('invoices')
    .select('*, client:clients(id, name, email, phone, country)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role, client_id, display_name').eq('id', user.id).single()
  if (profile?.role === 'client' && inv.client_id !== profile.client_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const client = inv.client as { id: string; name?: string; email?: string; phone?: string; country?: string } | null

  // ── Fetch package + done tasks ──────────────────────────────────────────
  const { data: pkgRow } = await supabase
    .from('client_packages')
    .select('id, name, items:package_items(task_type, total_quantity, label)')
    .eq('client_id', inv.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const packageTotals: Record<string, number> = {}
  const packageLabels: Record<string, string> = {}
  if (pkgRow?.items) {
    for (const item of pkgRow.items as { task_type: string; total_quantity: number; label: string }[]) {
      packageTotals[item.task_type] = (packageTotals[item.task_type] ?? 0) + item.total_quantity
      if (!packageLabels[item.task_type]) packageLabels[item.task_type] = item.label
    }
  }
  const totalInPackage = Object.values(packageTotals).reduce((s, v) => s + v, 0)
  const hasPackage = totalInPackage > 0

  const { data: doneTasks } = await supabase
    .from('tasks')
    .select('id, task_type')
    .eq('client_id', inv.client_id)
    .eq('status', 'done')
    .is('deleted_at', null)

  const doneByType: Record<string, number> = {}
  for (const t of doneTasks ?? []) {
    const k = t.task_type ?? 'custom'
    doneByType[k] = (doneByType[k] ?? 0) + 1
  }
  const totalDone = Object.values(doneByType).reduce((s, v) => s + v, 0)

  const allTypes = new Set([...Object.keys(packageTotals), ...Object.keys(doneByType)])
  const breakdown = Array.from(allTypes)
    .filter(type => (doneByType[type] ?? 0) > 0 || (packageTotals[type] ?? 0) > 0)
    .map(type => ({
      type,
      label: packageLabels[type] ?? TYPE_CONFIG[type]?.label ?? type,
      icon:  TYPE_CONFIG[type]?.icon ?? '📋',
      done:  doneByType[type] ?? 0,
      total: packageTotals[type] ?? 0,
    }))
    .sort((a, b) => b.done - a.done)

  const overallPct = pct(totalDone, totalInPackage)
  const senderName = profile?.display_name ?? 'Mahmoud Atef'

  // ── Format helpers ──────────────────────────────────────────────────────
  const items: { description: string; quantity: number; unit_price: number; total: number }[] = inv.items ?? []
  const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'

  function fmt(n: number) {
    const sym: Record<string, string> = { EGP: 'EGP ', EUR: '€', GBP: '£', AED: 'AED ', USD: '$' }
    const s = sym[inv.currency ?? 'USD'] ?? '$'
    return `${s}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const statusColor: Record<string, string> = {
    paid: '#16a34a', sent: '#7c3aed', draft: '#94a3b8', overdue: '#dc2626',
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── Delivery summary HTML ───────────────────────────────────────────────
  const deliverySectionHtml = breakdown.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span>&#128230; Delivery Summary</span>
        ${pkgRow?.name ? `<span class="pkg-badge">${pkgRow.name}</span>` : ''}
      </div>
      ${hasPackage ? `
      <div class="progress-block">
        <div class="progress-info">
          <span>${totalDone} of ${totalInPackage} deliverables completed</span>
          <span class="progress-pct">${overallPct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${overallPct}%"></div>
        </div>
      </div>` : ''}
      <table>
        <thead>
          <tr>
            <th>Content Type</th>
            <th style="text-align:center">Delivered</th>
            ${hasPackage ? '<th style="text-align:center">Target</th>' : ''}
            ${hasPackage ? '<th style="text-align:center">Progress</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${breakdown.map((b, i) => {
            const p = pct(b.done, b.total)
            const doneColor = b.done >= b.total && b.total > 0 ? '#16a34a' : b.done > 0 ? '#7c3aed' : '#94a3b8'
            const pillBg    = p >= 100 ? '#dcfce7' : p >= 50 ? '#ede9fe' : '#fff7ed'
            const pillColor = p >= 100 ? '#16a34a' : p >= 50 ? '#7c3aed' : '#d97706'
            return `
            <tr${i % 2 === 0 ? '' : ' class="alt"'}>
              <td>${b.icon} ${b.label}</td>
              <td style="text-align:center;font-weight:700;color:${doneColor};font-size:16px">${b.done}</td>
              ${hasPackage ? `<td style="text-align:center;color:#94a3b8">${b.total}</td>` : ''}
              ${hasPackage ? `<td style="text-align:center"><span style="background:${pillBg};color:${pillColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px">${p}%</span></td>` : ''}
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#1e293b; background:#fff; }
    .page { padding:48px; max-width:800px; margin:0 auto; }

    /* Header */
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
    .brand-name { font-size:28px; font-weight:900; color:#4c1d95; letter-spacing:1px; text-transform:uppercase; }
    .brand-sub  { font-size:11px; color:#94a3b8; letter-spacing:2px; text-transform:uppercase; margin-top:4px; }
    .inv-meta   { text-align:right; }
    .inv-number { font-size:22px; font-weight:800; color:#0f172a; font-family:monospace; }
    .status-pill {
      display:inline-block; margin-top:6px; padding:4px 14px;
      border-radius:999px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
      background:${statusColor[inv.status] ?? '#94a3b8'}22;
      color:${statusColor[inv.status] ?? '#94a3b8'};
      border:1px solid ${statusColor[inv.status] ?? '#94a3b8'}55;
    }

    /* Divider */
    .divider { border:none; border-top:1px solid #e2e8f0; margin:28px 0; }
    .divider-thick { border:none; border-top:3px solid #7c3aed; margin:28px 0; }

    /* Parties */
    .parties { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-bottom:36px; }
    .party-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#7c3aed; margin-bottom:8px; }
    .party-name  { font-size:17px; font-weight:800; color:#0f172a; margin-bottom:4px; }
    .party-detail { font-size:12px; color:#64748b; line-height:1.7; }

    /* Line items */
    table { width:100%; border-collapse:collapse; margin-bottom:24px; }
    thead tr { background:#f8f5ff; }
    th { padding:11px 14px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#7c3aed; border-bottom:2px solid #7c3aed; }
    th:last-child, td:last-child { text-align:right; }
    td { padding:12px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#334155; }
    tr.alt td { background:#faf9ff; }

    /* Totals */
    .totals { display:flex; justify-content:flex-end; margin-bottom:36px; }
    .totals-inner { width:300px; }
    .totals-inner td { padding:7px 14px; border:none; font-size:13px; }
    .totals-inner .total-row td { font-size:17px; font-weight:800; color:#4c1d95; border-top:2px solid #7c3aed; padding-top:14px; }

    /* Delivery section */
    .section { background:#f8f5ff; border:1px solid #ddd6fe; border-radius:12px; padding:24px; margin-bottom:32px; }
    .section-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; font-size:15px; font-weight:800; color:#4c1d95; }
    .pkg-badge { font-size:11px; background:#7c3aed; color:#fff; padding:4px 12px; border-radius:999px; font-weight:600; }

    /* Progress bar */
    .progress-block { margin-bottom:16px; }
    .progress-info  { display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px; color:#374151; font-weight:600; }
    .progress-pct   { font-size:20px; font-weight:900; color:#7c3aed; }
    .progress-track { background:#e2e8f0; border-radius:999px; height:12px; overflow:hidden; }
    .progress-fill  { background:linear-gradient(90deg,#7c3aed,#a855f7); height:100%; border-radius:999px; }

    /* Notes */
    .notes { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin-bottom:32px; }
    .notes-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; margin-bottom:6px; }
    .notes p { font-size:13px; color:#475569; line-height:1.6; }

    /* Footer / signature */
    .footer { margin-top:40px; display:flex; justify-content:space-between; align-items:flex-end; border-top:2px solid #7c3aed; padding-top:24px; }
    .sig-name { font-size:17px; font-weight:800; color:#0f172a; }
    .sig-brand { font-size:11px; font-weight:700; color:#7c3aed; letter-spacing:2px; text-transform:uppercase; margin-top:3px; }
    .footer-note { font-size:11px; color:#94a3b8; text-align:right; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding:24px; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Header ─────────────────────────────────────────────────────── -->
  <div class="header">
    <div>
      <div class="brand-name">${BRAND}</div>
      <div class="brand-sub">Digital Marketing Agency</div>
    </div>
    <div class="inv-meta">
      <div class="inv-number">Invoice #${inv.invoice_number}</div>
      <div class="status-pill">${inv.status.toUpperCase()}</div>
    </div>
  </div>

  <hr class="divider-thick"/>

  <!-- ── Parties ────────────────────────────────────────────────────── -->
  <div class="parties">
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${client?.name ?? 'Client'}</div>
      <div class="party-detail">
        ${client?.email ? `${client.email}<br/>` : ''}
        ${client?.phone ? `${client.phone}<br/>` : ''}
        ${client?.country ?? ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="party-label">From</div>
      <div class="party-name">${BRAND}</div>
      <div class="party-detail">
        ${senderName}<br/>
        ${inv.issued_date ? `Issued: ${fmtDate(inv.issued_date)}<br/>` : ''}
        ${inv.due_date ? `<strong style="color:#dc2626">Due: ${fmtDate(inv.due_date)}</strong>` : ''}
      </div>
    </div>
  </div>

  <!-- ── Line Items ─────────────────────────────────────────────────── -->
  <table>
    <thead>
      <tr>
        <th style="width:50%">Description</th>
        <th style="text-align:center">Qty</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, i) => `
        <tr${i % 2 === 1 ? ' class="alt"' : ''}>
          <td>${item.description}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${fmt(item.unit_price)}</td>
          <td style="text-align:right;font-weight:600">${fmt(item.total ?? item.quantity * item.unit_price)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- ── Totals ─────────────────────────────────────────────────────── -->
  <div class="totals">
    <table class="totals-inner">
      <tr><td>Subtotal</td><td style="text-align:right">${fmt(inv.subtotal)}</td></tr>
      ${inv.tax ? `<tr><td>Tax (${inv.tax}%)</td><td style="text-align:right">${fmt((inv.total ?? inv.subtotal) - inv.subtotal)}</td></tr>` : ''}
      <tr class="total-row"><td>Total</td><td style="text-align:right">${fmt(inv.total)}</td></tr>
    </table>
  </div>

  ${deliverySectionHtml}

  ${inv.notes ? `
  <div class="notes">
    <div class="notes-label">Notes</div>
    <p>${inv.notes}</p>
  </div>` : ''}

  <!-- ── Footer / Signature ─────────────────────────────────────────── -->
  <div class="footer">
    <div>
      <div class="sig-name">${senderName}</div>
      <div class="sig-brand">${BRAND}</div>
    </div>
    <div class="footer-note">
      &copy; ${new Date().getFullYear()} ${BRAND} &middot; All rights reserved<br/>
      Please retain this document for your records.
    </div>
  </div>

</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
