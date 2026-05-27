import type { Invoice } from '@/types'

// Opens a print-ready window so the user can save the invoice as PDF
export function printInvoicePDF(invoice: Invoice): void {
  const html = generateInvoiceHTML(invoice)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

// Generates a print-optimised HTML invoice
export function generateInvoiceHTML(invoice: Invoice): string {
  const itemRows = invoice.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #334155;">${item.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:right;">$${item.unit_price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:right;">$${item.total.toFixed(2)}</td>
    </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
    @media print {
      body { background: #fff; color: #1e293b; padding: 0; }
      .container { background: #fff; color: #1e293b; box-shadow: none; border: 1px solid #e2e8f0; }
      .brand { color: #4f46e5 !important; }
      .label { color: #64748b !important; }
      .value { color: #1e293b !important; }
      thead tr { background: #f1f5f9 !important; }
      th { color: #64748b !important; }
      td { color: #1e293b !important; border-color: #e2e8f0 !important; }
      .footer { color: #94a3b8 !important; border-color: #e2e8f0 !important; }
      .total-row { color: #475569 !important; }
      .total-row.grand { color: #1e293b !important; border-color: #e2e8f0 !important; }
    }
    .container { max-width: 800px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
    .brand { font-size: 28px; font-weight: 800; color: #6366f1; letter-spacing: -1px; }
    .invoice-meta { text-align: right; }
    .invoice-meta h2 { font-size: 22px; color: #94a3b8; text-transform: uppercase; letter-spacing: 4px; }
    .invoice-meta .number { font-size: 18px; color: #e2e8f0; margin-top: 4px; }
    .section { margin-bottom: 32px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 4px; }
    .value { font-size: 15px; color: #e2e8f0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    thead tr { background: #334155; }
    th { padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
    th:last-child, th:nth-child(3), th:nth-child(2) { text-align: right; }
    th:nth-child(2) { text-align: center; }
    .totals { margin-top: 24px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .total-row { display: flex; gap: 48px; font-size: 14px; color: #94a3b8; }
    .total-row.grand { font-size: 20px; font-weight: 700; color: #e2e8f0; border-top: 1px solid #334155; padding-top: 12px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;
      background: ${invoice.status === 'paid' ? '#14532d' : invoice.status === 'overdue' ? '#7f1d1d' : '#1e3a5f'};
      color: ${invoice.status === 'paid' ? '#4ade80' : invoice.status === 'overdue' ? '#f87171' : '#60a5fa'}; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #334155; text-align: center; color: #475569; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Agency OS</div>
      <div class="invoice-meta">
        <h2>Invoice</h2>
        <div class="number">#${invoice.invoice_number}</div>
        <div style="margin-top:8px;"><span class="status-badge">${invoice.status.toUpperCase()}</span></div>
      </div>
    </div>

    <div class="grid-2 section">
      <div>
        <div class="label">Bill To</div>
        <div class="value">${invoice.client?.name ?? 'Client'}</div>
        <div class="value" style="color:#94a3b8;">${invoice.client?.email ?? ''}</div>
        <div class="value" style="color:#94a3b8;">${invoice.client?.country ?? ''}</div>
      </div>
      <div style="text-align:right;">
        <div class="label">Issue Date</div>
        <div class="value">${new Date(invoice.issued_date).toLocaleDateString()}</div>
        <div class="label" style="margin-top:12px;">Due Date</div>
        <div class="value">${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}</div>
      </div>
    </div>

    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>$${invoice.subtotal.toFixed(2)}</span></div>
        ${invoice.tax ? `<div class="total-row"><span>Tax (${invoice.tax}%)</span><span>$${((invoice.subtotal * invoice.tax) / 100).toFixed(2)}</span></div>` : ''}
        <div class="total-row grand"><span>Total Due</span><span>$${invoice.total.toFixed(2)}</span></div>
      </div>
    </div>

    ${invoice.notes ? `<div class="section"><div class="label">Notes</div><div class="value" style="color:#94a3b8;">${invoice.notes}</div></div>` : ''}
    <div class="footer">Thank you for your business · Agency OS · Generated ${new Date().toLocaleDateString()}</div>
  </div>
</body>
</html>`
}
