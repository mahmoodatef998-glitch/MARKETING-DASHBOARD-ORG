export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { fetchRevenueItems, inDateRange } from '@/lib/income'

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
  const yearPrefix = String(now.getFullYear())

  // ── Parallel data fetch ─────────────────────────────────────────────────────
  const [
    { data: allExpenses },
    { data: allPayouts },
    { data: allEarnings },
    { data: openInvoices },
    { data: allInvoices },
    { data: paidInvoices },
    { data: settings },
    { data: designTasks },
    { data: activeClients },
  ] = await Promise.all([
    adminDb.from('expenses').select('*'),
    adminDb.from('team_payouts').select('amount, paid_at'),
    adminDb.from('earnings').select('amount'),
    adminDb.from('invoices').select('*, client:clients(name)').in('status', ['sent', 'overdue']).is('deleted_at', null),
    adminDb.from('invoices').select('status, total').is('deleted_at', null).neq('status', 'draft'),
    adminDb.from('invoices').select('total, received_amount, client_id, client:clients(id, name)').eq('status', 'paid').is('deleted_at', null),
    adminDb.from('financial_settings').select('*').eq('id', 1).single(),
    adminDb.from('tasks').select('id, client_id').eq('task_type', 'design').eq('status', 'done')
      .gte('updated_at', thisMonth.from).lte('updated_at', thisMonth.to + 'T23:59:59Z').is('deleted_at', null),
    adminDb.from('clients').select('id').eq('status', 'active').is('deleted_at', null),
  ])

  // ── Revenue (cash): invoices + manual income ────────────────────────────────
  const allRevenueItems = await fetchRevenueItems(adminDb)

  const sumRevenue = (from: string, to: string) =>
    allRevenueItems
      .filter(p => inDateRange(p.received_at, from, to))
      .reduce((s, p) => s + p.amount, 0)

  const revenueThisMonth = sumRevenue(thisMonth.from, thisMonth.to)
  const revenueLastMonth = sumRevenue(lastMonth.from, lastMonth.to)
  const revenueYtd = allRevenueItems
    .filter(p => p.received_at.startsWith(yearPrefix))
    .reduce((s, p) => s + p.amount, 0)
  const revenueAllTime = allRevenueItems.reduce((s, p) => s + p.amount, 0)

  // ── Operational expenses ────────────────────────────────────────────────────
  type ExpRow = { amount: number; date: string; category?: string; title?: string }
  const expensesList = (allExpenses ?? []) as ExpRow[]

  const sumOpEx = (from: string, to: string) =>
    expensesList
      .filter(e => e.date >= from && e.date <= to)
      .reduce((s, e) => s + e.amount, 0)

  const opExThisMonth = sumOpEx(thisMonth.from, thisMonth.to)
  const opExLastMonth = sumOpEx(lastMonth.from, lastMonth.to)
  const opExYtd = expensesList
    .filter(e => e.date.startsWith(yearPrefix))
    .reduce((s, e) => s + e.amount, 0)
  const opExAllTime = expensesList.reduce((s, e) => s + e.amount, 0)

  const expensesByCategory: Record<string, number> = {}
  for (const e of expensesList) {
    if (e.date >= thisMonth.from && e.date <= thisMonth.to) {
      const cat = e.category ?? 'other'
      expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + e.amount
    }
  }

  // ── Team payouts (actual cash paid to team) ─────────────────────────────────
  type PayoutRow = { amount: number; paid_at: string }
  const payoutsList = (allPayouts ?? []) as PayoutRow[]

  const sumPayouts = (from: string, to: string) =>
    payoutsList
      .filter(p => inDateRange(p.paid_at, from, to))
      .reduce((s, p) => s + p.amount, 0)

  const payoutsThisMonth = sumPayouts(thisMonth.from, thisMonth.to)
  const payoutsLastMonth = sumPayouts(lastMonth.from, lastMonth.to)
  const payoutsYtd = payoutsList
    .filter(p => p.paid_at.startsWith(yearPrefix))
    .reduce((s, p) => s + p.amount, 0)
  const payoutsAllTime = payoutsList.reduce((s, p) => s + p.amount, 0)

  // Total cash outflow = operational expenses + team payouts
  const outflowThisMonth = opExThisMonth + payoutsThisMonth
  const outflowLastMonth = opExLastMonth + payoutsLastMonth
  const outflowYtd      = opExYtd + payoutsYtd
  const outflowAllTime   = opExAllTime + payoutsAllTime

  // ── Receivables (ليا) — remaining on open invoices ───────────────────────────
  const outstanding = (openInvoices ?? []).reduce((s: number, i: { total: number; received_amount?: number }) =>
    s + (i.total - (i.received_amount ?? 0)), 0)
  const overdueInvoices = (openInvoices ?? []).filter((i: { status: string }) => i.status === 'overdue')

  // ── Payables (عليا) — team earnings not yet paid out ────────────────────────
  const totalEarned = ((allEarnings ?? []) as Array<{ amount: number }>).reduce((s, e) => s + e.amount, 0)
  const payablesTotal = Math.max(0, totalEarned - payoutsAllTime)

  // ── Cash balance (باقي) = all income − all cash out ─────────────────────────
  const cashBalance = revenueAllTime - outflowAllTime

  // ── MRR — 3-month rolling average of actual paid revenue ────────────────────
  const m3start = monthRange(-2).from
  const last3Revenue = allRevenueItems
    .filter(p => p.received_at >= m3start)
    .reduce((s, p) => s + p.amount, 0)
  const mrr = last3Revenue / 3

  // ── Collection rate ──────────────────────────────────────────────────────────
  const totalPaidInv = (allInvoices ?? [])
    .filter((i: { status: string }) => i.status === 'paid')
    .reduce((s: number, i: { total: number }) => s + i.total, 0)
  const collectionBase = totalPaidInv + outstanding
  const collectionRate = collectionBase > 0 ? Math.round((totalPaidInv / collectionBase) * 100) : 0

  // ── Top clients by revenue ───────────────────────────────────────────────────
  const clientRevMap: Record<string, { revenue: number; id: string; name?: string }> = {}
  type PaidInvoiceRow = { total: number; received_amount?: number; client_id: string; client: { id: string; name: string } | { id: string; name: string }[] | null }
  for (const inv of (paidInvoices ?? []) as unknown as PaidInvoiceRow[]) {
    const clientObj = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const name = clientObj?.name ?? 'Unknown'
    const id   = clientObj?.id ?? inv.client_id ?? ''
    if (!clientRevMap[id]) clientRevMap[id] = { revenue: 0, id }
    clientRevMap[id].revenue += (inv.received_amount ?? inv.total)
    clientRevMap[id].name = name
  }
  const topClients = Object.values(clientRevMap)
    .map(c => ({ id: c.id, name: c.name ?? 'Unknown', revenue: c.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // ── 6-month cash flow (revenue vs full outflow) ──────────────────────────────
  const cashFlow = Array.from({ length: 6 }, (_, i) => {
    const m = monthRange(i - 5)
    const rev = sumRevenue(m.from, m.to)
    const exp = sumOpEx(m.from, m.to) + sumPayouts(m.from, m.to)
    return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp }
  })

  // ── Imputed P&L costs (design + media buyer rates) ───────────────────────────
  const costPerDesign = Number(settings?.cost_per_design ?? 15)
  const mediaBuyerRate = Number(settings?.media_buyer_rate_per_client ?? 150)
  const designCostThisMonth = (designTasks ?? []).length * costPerDesign
  const mediaBuyerCostThisMonth = (activeClients ?? []).length * mediaBuyerRate

  // P&L costs = imputed design + media buyer + operational expenses.
  // Team payouts are real cash (shown in summary/outflow) but NOT added here —
  // designCost already estimates designer cost; adding payouts would double-count.
  const totalCostsThisMonth = designCostThisMonth + mediaBuyerCostThisMonth + opExThisMonth
  const netProfitThisMonth = revenueThisMonth - totalCostsThisMonth

  // Cash profit (income − actual cash out, no imputed costs)
  const cashProfitThisMonth = revenueThisMonth - outflowThisMonth
  const cashProfitLastMonth = revenueLastMonth - outflowLastMonth

  const partnerDistribution = [
    { name: settings?.partner1_name ?? 'Partner 1', share: Number(settings?.partner1_share ?? 50), amount: netProfitThisMonth * (Number(settings?.partner1_share ?? 50) / 100) },
    { name: settings?.partner2_name ?? 'Partner 2', share: Number(settings?.partner2_share ?? 30), amount: netProfitThisMonth * (Number(settings?.partner2_share ?? 30) / 100) },
    { name: settings?.partner3_name ?? 'Partner 3', share: Number(settings?.partner3_share ?? 20), amount: netProfitThisMonth * (Number(settings?.partner3_share ?? 20) / 100) },
  ]

  return NextResponse.json({
    // This-month / period KPIs
    revenue: {
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      ytd:       revenueYtd,
      allTime:   revenueAllTime,
      growth:    revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0,
    },
    // expenses = full cash outflow (op-ex + team payouts) so KPI matches "كل اللي انصرف"
    expenses: {
      thisMonth: outflowThisMonth,
      lastMonth: outflowLastMonth,
      ytd:       outflowYtd,
      allTime:   outflowAllTime,
      operational: opExThisMonth,
      teamPayouts: payoutsThisMonth,
      byCategory: {
        ...expensesByCategory,
        ...(payoutsThisMonth > 0 ? { team_payouts: payoutsThisMonth } : {}),
      },
    },
    // Cash profit (no imputed costs) — kept for charts / AI
    profit: {
      thisMonth: cashProfitThisMonth,
      lastMonth: cashProfitLastMonth,
      margin:    revenueThisMonth > 0 ? Math.round((cashProfitThisMonth / revenueThisMonth) * 100) : 0,
    },
    // Full accounting snapshot
    summary: {
      totalIncome:    revenueAllTime,   // كل اللي دخل
      totalOutflow:   outflowAllTime,   // كل اللي انصرف (op-ex + payouts)
      cashBalance,                      // الباقي
      receivables:    outstanding,      // ليا
      payables:       payablesTotal,    // عليا
      thisMonthIncome:  revenueThisMonth,
      thisMonthOutflow: outflowThisMonth,
      thisMonthBalance: cashProfitThisMonth,
    },
    outstanding: {
      total:        outstanding,
      count:        (openInvoices ?? []).length,
      overdueTotal: overdueInvoices.reduce((s: number, i: { total: number; received_amount?: number }) => s + (i.total - (i.received_amount ?? 0)), 0),
      overdueCount: overdueInvoices.length,
    },
    payables: {
      total:  payablesTotal,
      earned: totalEarned,
      paid:   payoutsAllTime,
    },
    mrr:            Math.round(mrr),
    arr:            Math.round(mrr * 12),
    collectionRate,
    cashFlow,
    topClients,
    overdueInvoices: overdueInvoices.map((i: { id: string; invoice_number: string; total: number; due_date?: string; client: { name: string } | { name: string }[] | null }) => ({
      id:             i.id,
      invoice_number: i.invoice_number,
      client:         (Array.isArray(i.client) ? i.client[0]?.name : i.client?.name) ?? 'Unknown',
      total:          i.total,
      due_date:       i.due_date ?? '',
    })),
    recentExpenses: expensesList
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    pnl: {
      revenue:             revenueThisMonth,
      designCost:          designCostThisMonth,
      mediaBuyerCost:      mediaBuyerCostThisMonth,
      operationalExpenses: opExThisMonth,
      teamPayouts:         payoutsThisMonth,
      totalCosts:          totalCostsThisMonth,
      netProfit:           netProfitThisMonth,
      designTaskCount:     (designTasks ?? []).length,
      activeClientCount:   (activeClients ?? []).length,
      partnerDistribution,
    },
  })
}
