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

  // ── Revenue from invoice_payments ────────────────────────────────────────────
  const { data: allPayments } = await adminDb
    .from('invoice_payments')
    .select('amount, received_at')

  const sumPayments = (from: string, to: string) =>
    (allPayments ?? [])
      .filter(p => p.received_at >= from && p.received_at <= to + 'T23:59:59Z')
      .reduce((s: number, p: { amount: number }) => s + p.amount, 0)

  const revenueThisMonth = sumPayments(thisMonth.from, thisMonth.to)
  const revenueLastMonth = sumPayments(lastMonth.from, lastMonth.to)
  const revenueYtd = (allPayments ?? [])
    .filter(p => p.received_at.startsWith(String(now.getFullYear())))
    .reduce((s: number, p: { amount: number }) => s + p.amount, 0)

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

  // ── MRR from active billing plans ───────────────────────────────────────────
  const { data: activePlans } = await adminDb
    .from('billing_plans')
    .select('amount, cycle_type, custom_days, currency')
    .eq('is_active', true)

  const mrr = (activePlans ?? []).reduce((s: number, p: { amount: number; cycle_type: string; custom_days?: number }) => {
    const monthly = p.cycle_type === 'monthly' ? p.amount
      : p.cycle_type === 'biweekly' ? p.amount * 2.17
      : p.cycle_type === 'every_10_days' ? p.amount * 3
      : p.cycle_type === 'custom_days' && p.custom_days ? p.amount * (30 / p.custom_days)
      : 0
    return s + monthly
  }, 0)

  // ── Collection rate ──────────────────────────────────────────────────────────
  const { data: allInvoices } = await adminDb
    .from('invoices')
    .select('status, total')
    .is('deleted_at', null)
    .neq('status', 'draft')

  const totalInvoiced = (allInvoices ?? []).reduce((s: number, i: { total: number }) => s + i.total, 0)
  const totalPaidInv  = (allInvoices ?? [])
    .filter((i: { status: string }) => i.status === 'paid')
    .reduce((s: number, i: { total: number }) => s + i.total, 0)
  const collectionRate = totalInvoiced > 0 ? Math.round((totalPaidInv / totalInvoiced) * 100) : 0

  // ── Top clients by revenue ───────────────────────────────────────────────────
  const { data: paidInvoices } = await adminDb
    .from('invoices')
    .select('total, received_amount, client:clients(name)')
    .eq('status', 'paid')
    .is('deleted_at', null)

  const clientRevMap: Record<string, number> = {}
  type PaidInvoiceRow = { total: number; received_amount?: number; client: { name: string } | { name: string }[] | null }
  for (const inv of (paidInvoices ?? []) as unknown as PaidInvoiceRow[]) {
    const clientName = Array.isArray(inv.client) ? inv.client[0]?.name : inv.client?.name
    const name = clientName ?? 'Unknown'
    clientRevMap[name] = (clientRevMap[name] ?? 0) + (inv.received_amount ?? inv.total)
  }
  const topClients = Object.entries(clientRevMap)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // ── 6-month cash flow ────────────────────────────────────────────────────────
  const cashFlow = Array.from({ length: 6 }, (_, i) => {
    const m = monthRange(i - 5)
    const rev = sumPayments(m.from, m.to)
    const exp = sumExpenses(m.from, m.to)
    return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp }
  })

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
  })
}
