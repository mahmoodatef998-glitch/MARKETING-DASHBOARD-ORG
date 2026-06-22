export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

function monthRange(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
  return { from, to, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) }
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminDb = createAdminClient()
  const now = new Date()
  const thisMonth = monthRange(0)
  const lastMonth = monthRange(-1)

  // ── Revenue queries — parallel ────────────────────────────────────────────────
  const [
    { data: allPaymentsRaw },
    { data: paidInvoicesData },
    { data: allNonDeletedInvIds },
  ] = await Promise.all([
    adminDb.from('invoice_payments').select('amount, received_at, invoice_id').eq('status', 'paid').not('received_at', 'is', null),
    adminDb.from('invoices').select('id, total, received_amount, received_at, updated_at').eq('status', 'paid').is('deleted_at', null),
    // Needed to exclude payments for soft-deleted invoices from revenue calculations
    adminDb.from('invoices').select('id').is('deleted_at', null),
  ])

  const nonDeletedInvSet = new Set((allNonDeletedInvIds ?? []).map(i => i.id))
  // Payments belonging to deleted invoices must not count toward revenue
  const allPayments = (allPaymentsRaw ?? []).filter((p: { invoice_id: string }) => nonDeletedInvSet.has(p.invoice_id))

  // Avoid double-counting invoices that already have invoice_payments records
  type PaymentRow = { amount: number; received_at: string; invoice_id: string }
  const invoiceIdsWithPayments = new Set(
    allPayments.map((p: PaymentRow) => p.invoice_id)
  )

  type PaidInvRow = { id: string; total: number; received_amount?: number; received_at?: string; updated_at: string }
  const directPaidItems = ((paidInvoicesData ?? []) as PaidInvRow[])
    .filter(inv => !invoiceIdsWithPayments.has(inv.id))
    .map(inv => ({
      amount:      inv.received_amount ?? inv.total,
      received_at: inv.received_at ?? inv.updated_at,
    }))

  // Combined — installment payments + directly-paid invoices
  const allRevenueItems = [
    ...(allPayments as PaymentRow[]).map(p => ({ amount: p.amount, received_at: p.received_at })),
    ...directPaidItems,
  ]

  const sumRevenue = (from: string, to: string) =>
    allRevenueItems
      .filter(p => p.received_at >= from && p.received_at <= to + 'T23:59:59Z')
      .reduce((s, p) => s + p.amount, 0)

  const revenueThisMonth = sumRevenue(thisMonth.from, thisMonth.to)
  const revenueLastMonth = sumRevenue(lastMonth.from, lastMonth.to)
  const revenueYtd = allRevenueItems
    .filter(p => p.received_at.startsWith(String(now.getFullYear())))
    .reduce((s, p) => s + p.amount, 0)

  // ── Expenses ────────────────────────────────────────────────────────────────
  const { data: allExpenses } = await adminDb.from('expenses').select('*')

  const sumExpenses = (from: string, to: string) =>
    (allExpenses ?? [])
      .filter((e: { date: string }) => e.date >= from && e.date <= to)
      .reduce((s: number, e: { amount: number }) => s + e.amount, 0)

  const expensesThisMonth = sumExpenses(thisMonth.from, thisMonth.to)
  const expensesLastMonth = sumExpenses(lastMonth.from, lastMonth.to)
  const expensesYtd = (allExpenses ?? [])
    .filter((e: { date: string }) => e.date.startsWith(String(now.getFullYear())))
    .reduce((s: number, e: { amount: number }) => s + e.amount, 0)

  const expensesByCategory: Record<string, number> = {}
  for (const e of (allExpenses ?? []) as Array<{ category?: string; amount: number; date: string }>) {
    if (e.date >= thisMonth.from && e.date <= thisMonth.to) {
      const cat = e.category ?? 'other'
      expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + e.amount
    }
  }

  // ── Outstanding invoices ─────────────────────────────────────────────────────
  const { data: openInvoices } = await adminDb
    .from('invoices')
    .select('*, client:clients(name)')
    .in('status', ['sent', 'overdue'])
    .is('deleted_at', null)

  const outstanding = (openInvoices ?? []).reduce((s: number, i: { total: number; received_amount?: number }) =>
    s + (i.total - (i.received_amount ?? 0)), 0)
  const overdueInvoices = (openInvoices ?? []).filter((i: { status: string }) => i.status === 'overdue')

  // ── MRR — 3-month rolling average of actual paid revenue ────────────────────
  // More reliable than billing_plans amounts which may be misconfigured.
  const m3start = monthRange(-2).from
  const last3Revenue = allRevenueItems
    .filter(p => p.received_at >= m3start)
    .reduce((s, p) => s + p.amount, 0)
  const mrr = last3Revenue / 3

  // ── Collection rate ──────────────────────────────────────────────────────────
  // Uses same outstanding figure shown in the KPI card for consistency.
  // outstanding = sum of (total − received_amount) for all active sent/overdue invoices.
  const { data: allInvoices } = await adminDb
    .from('invoices')
    .select('status, total')
    .is('deleted_at', null)
    .neq('status', 'draft')

  const totalPaidInv = (allInvoices ?? [])
    .filter((i: { status: string }) => i.status === 'paid')
    .reduce((s: number, i: { total: number }) => s + i.total, 0)
  // Denominator = paid invoices + remaining outstanding (not yet collected)
  const collectionBase = totalPaidInv + outstanding
  const collectionRate = collectionBase > 0 ? Math.round((totalPaidInv / collectionBase) * 100) : 0

  // ── Top clients by revenue ───────────────────────────────────────────────────
  const { data: paidInvoices } = await adminDb
    .from('invoices')
    .select('total, received_amount, client_id, client:clients(id, name)')
    .eq('status', 'paid')
    .is('deleted_at', null)

  const clientRevMap: Record<string, { revenue: number; id: string }> = {}
  type PaidInvoiceRow = { total: number; received_amount?: number; client_id: string; client: { id: string; name: string } | { id: string; name: string }[] | null }
  for (const inv of (paidInvoices ?? []) as unknown as PaidInvoiceRow[]) {
    const clientObj = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const name = clientObj?.name ?? 'Unknown'
    const id   = clientObj?.id ?? inv.client_id ?? ''
    if (!clientRevMap[id]) clientRevMap[id] = { revenue: 0, id }
    clientRevMap[id].revenue += (inv.received_amount ?? inv.total)
    // Store name separately — use id as key to avoid merging different clients with same name
    ;(clientRevMap[id] as { revenue: number; id: string; name?: string }).name = name
  }
  const topClients = Object.values(clientRevMap)
    .map(c => ({ id: c.id, name: (c as { revenue: number; id: string; name?: string }).name ?? 'Unknown', revenue: c.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // ── 6-month cash flow ────────────────────────────────────────────────────────
  const cashFlow = Array.from({ length: 6 }, (_, i) => {
    const m = monthRange(i - 5)
    const rev = sumRevenue(m.from, m.to)
    const exp = sumExpenses(m.from, m.to)
    return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp }
  })

  // ── Financial Settings ───────────────────────────────────────────────────────
  const { data: settings } = await adminDb
    .from('financial_settings')
    .select('*')
    .eq('id', 1)
    .single()

  const costPerDesign = Number(settings?.cost_per_design ?? 15)
  const mediaBuyerRate = Number(settings?.media_buyer_rate_per_client ?? 150)

  // ── Design costs (completed design tasks this month) ─────────────────────────
  const { data: designTasks } = await adminDb
    .from('tasks')
    .select('id, client_id')
    .eq('task_type', 'design')
    .eq('status', 'done')
    .gte('updated_at', thisMonth.from)
    .lte('updated_at', thisMonth.to + 'T23:59:59Z')

  const designCostThisMonth = (designTasks ?? []).length * costPerDesign

  // ── Media buyer costs (active clients × rate) ────────────────────────────────
  const { data: activeClients } = await adminDb
    .from('clients')
    .select('id')
    .eq('status', 'active')
    .is('deleted_at', null)

  const mediaBuyerCostThisMonth = (activeClients ?? []).length * mediaBuyerRate

  // ── Auto P&L ─────────────────────────────────────────────────────────────────
  const totalCostsThisMonth = designCostThisMonth + mediaBuyerCostThisMonth + expensesThisMonth
  const netProfitThisMonth = revenueThisMonth - totalCostsThisMonth

  const partnerDistribution = [
    { name: settings?.partner1_name ?? 'Partner 1', share: Number(settings?.partner1_share ?? 50), amount: netProfitThisMonth * (Number(settings?.partner1_share ?? 50) / 100) },
    { name: settings?.partner2_name ?? 'Partner 2', share: Number(settings?.partner2_share ?? 30), amount: netProfitThisMonth * (Number(settings?.partner2_share ?? 30) / 100) },
    { name: settings?.partner3_name ?? 'Partner 3', share: Number(settings?.partner3_share ?? 20), amount: netProfitThisMonth * (Number(settings?.partner3_share ?? 20) / 100) },
  ]

  return NextResponse.json({
    revenue: {
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      ytd:       revenueYtd,
      growth:    revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0,
    },
    expenses: {
      thisMonth: expensesThisMonth,
      lastMonth: expensesLastMonth,
      ytd:       expensesYtd,
      byCategory: expensesByCategory,
    },
    profit: {
      thisMonth: revenueThisMonth - expensesThisMonth,
      lastMonth: revenueLastMonth - expensesLastMonth,
      margin:    revenueThisMonth > 0 ? Math.round(((revenueThisMonth - expensesThisMonth) / revenueThisMonth) * 100) : 0,
    },
    outstanding: {
      total:        outstanding,
      count:        (openInvoices ?? []).length,
      overdueTotal: overdueInvoices.reduce((s: number, i: { total: number; received_amount?: number }) => s + (i.total - (i.received_amount ?? 0)), 0),
      overdueCount: overdueInvoices.length,
    },
    mrr:            Math.round(mrr),
    arr:            Math.round(mrr * 12),
    collectionRate,
    cashFlow,
    topClients,
    overdueInvoices: overdueInvoices.map((i: { invoice_number: string; total: number; due_date?: string; client: { name: string } | { name: string }[] | null }) => ({
      invoice_number: i.invoice_number,
      client:         (Array.isArray(i.client) ? i.client[0]?.name : i.client?.name) ?? 'Unknown',
      total:          i.total,
      due_date:       i.due_date ?? '',
    })),
    recentExpenses: ((allExpenses ?? []) as Array<{ date: string; title: string; amount: number; category?: string }>)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    pnl: {
      revenue:             revenueThisMonth,
      designCost:          designCostThisMonth,
      mediaBuyerCost:      mediaBuyerCostThisMonth,
      operationalExpenses: expensesThisMonth,
      totalCosts:          totalCostsThisMonth,
      netProfit:           netProfitThisMonth,
      designTaskCount:     (designTasks ?? []).length,
      activeClientCount:   (activeClients ?? []).length,
      partnerDistribution,
    },
  })
}
