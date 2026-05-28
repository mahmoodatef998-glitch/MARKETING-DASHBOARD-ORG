export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

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
    .select('*, client:clients(name, email, phone, country)')
    .eq('id', id)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const items: { description: string; quantity: number; unit_price: number; total: number }[] = inv.items ?? []
  const fmt = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const statusColor: Record<string, string> = {
    paid: '#4ade80', sent: '#60a5fa', draft: '#94a3b8', overdue: '#f87171',
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:14px; color:#1e293b; background:#fff; padding:48px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:48px; }
    .logo { font-size:22px; font-weight:800; color:#4f46e5; }
    .logo span { color:#0f172a; }
    .invoice-meta { text-align:right; }
    .invoice-number { font-size:20px; font-weight:700; color:#0f172a; }
    .status-badge { display:inline-block; padding:3px 12px; border-radius:999px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; margin-top:6px; background:${statusColor[inv.status] ?? '#94a3b8'}22; color:${statusColor[inv.status] ?? '#94a3b8'}; border:1px solid ${statusColor[inv.status] ?? '#94a3b8'}55; }
    .divider { border:none; border-top:1px solid #e2e8f0; margin:24px 0; }
    .parties { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-bottom:36px; }
    .party-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; margin-bottom:8px; }
    .party-name { font-size:16px; font-weight:700; color:#0f172a; margin-bottom:4px; }
    .party-detail { font-size:13px; color:#64748b; line-height:1.6; }
    .dates { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:36px; }
    .date-item label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; display:block; margin-bottom:4px; }
    .date-item span { font-size:13px; font-weight:600; color:#0f172a; }
    table { width:100%; border-collapse:collapse; margin-bottom:24px; }
    thead tr { background:#f8fafc; }
    th { padding:10px 14px; text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; border-bottom:2px solid #e2e8f0; }
    th:last-child, td:last-child { text-align:right; }
    td { padding:12px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#334155; }
    tbody tr:hover { background:#f8fafc; }
    .totals { display:flex; justify-content:flex-end; margin-bottom:36px; }
    .totals-table { width:280px; }
    .totals-table td { padding:6px 14px; border:none; font-size:13px; }
    .totals-table .total-row td { font-size:15px; font-weight:700; color:#0f172a; border-top:2px solid #e2e8f0; padding-top:12px; }
    .notes { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; }
    .notes-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; margin-bottom:6px; }
    .notes p { font-size:13px; color:#475569; line-height:1.6; }
    .footer { margin-top:48px; text-align:center; font-size:11px; color:#94a3b8; }
    @media print { body { padding:24px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Agency<span>OS</span></div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Professional Agency Management</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-number">Invoice #${inv.invoice_number}</div>
      <div class="status-badge">${inv.status}</div>
    </div>
  </div>

  <hr class="divider"/>

  <div class="parties">
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${inv.client?.name ?? 'Client'}</div>
      <div class="party-detail">
        ${inv.client?.email ? `${inv.client.email}<br/>` : ''}
        ${inv.client?.phone ? `${inv.client.phone}<br/>` : ''}
        ${inv.client?.country ?? ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="party-label">Invoice Details</div>
      <div class="party-detail" style="line-height:2">
        <strong>Issued:</strong> ${new Date(inv.issued_date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}<br/>
        ${inv.due_date ? `<strong>Due:</strong> ${new Date(inv.due_date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}` : ''}
      </div>
    </div>
  </div>

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
      ${items.map(item => `
        <tr>
          <td>${item.description}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td>${fmt(item.unit_price)}</td>
          <td>${fmt(item.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <table class="totals-table">
      <tr><td>Subtotal</td><td style="text-align:right">${fmt(inv.subtotal)}</td></tr>
      ${inv.tax ? `<tr><td>Tax (${inv.tax}%)</td><td style="text-align:right">${fmt(inv.total - inv.subtotal)}</td></tr>` : ''}
      <tr class="total-row"><td>Total</td><td style="text-align:right">${fmt(inv.total)}</td></tr>
    </table>
  </div>

  ${inv.notes ? `
  <div class="notes">
    <div class="notes-label">Notes</div>
    <p>${inv.notes}</p>
  </div>` : ''}

  <div class="footer">Thank you for your business • Agency OS</div>

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
