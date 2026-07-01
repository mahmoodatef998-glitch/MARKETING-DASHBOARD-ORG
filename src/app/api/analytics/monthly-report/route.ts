export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const admin = createAdminClient()

  const [
    { data: allPaymentsRaw },
    { data: allPaidInvoices },
    { data: nonDeletedIds },
    { data: expensesRaw },
    { data: openInvoices },
    { data: settingsRow },
    { data: designTasks },
    { data: activeClients },
  ] = await Promise.all([
    admin.from('invoice_payments').select('amount, received_at, invoice_id').eq('status', 'paid')
      .gte('received_at', from).lte('received_at', to + 'T23:59:59Z'),
    admin.from('invoices').select('id, invoice_number, total, received_amount, received_at, client:clients(name)')
      .eq('status', 'paid').is('deleted_at', null),
    admin.from('invoices').select('id').is('deleted_at', null),
    admin.from('expenses').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }),
    admin.from('invoices').select('id, total, received_amount, status').in('status', ['sent', 'overdue']).is('deleted_at', null),
    admin.from('financial_settings').select('*').eq('id', 1).single(),
    admin.from('tasks').select('id').eq('task_type', 'design').eq('status', 'done')
      .gte('updated_at', from).lte('updated_at', to + 'T23:59:59Z').is('deleted_at', null),
    admin.from('clients').select('id').eq('status', 'active').is('deleted_at', null),
  ])

  // Revenue from installment payments in this month
  const nonDeletedSet = new Set((nonDeletedIds ?? []).map((i: { id: string }) => i.id))
  const payments = (allPaymentsRaw ?? []).filter((p: { invoice_id: string }) => nonDeletedSet.has(p.invoice_id))
  const paymentRevenue = (payments as { amount: number }[]).reduce((s, p) => s + p.amount, 0)

  // Revenue from directly-paid invoices (no installment records) in this month
  const paymentInvIds = new Set((payments as { invoice_id: string }[]).map(p => p.invoice_id))
  type PaidInv = { id: string; invoice_number: string; total: number; received_amount?: number; received_at?: string; client: { name: string } | { name: string }[] | null }
  const monthDirectPaid = ((allPaidInvoices ?? []) as unknown as PaidInv[]).filter(inv => {
    if (paymentInvIds.has(inv.id)) return false
    const r = inv.received_at ?? ''
    return r >= from && r <= to + 'T23:59:59Z'
  })
  const directRevenue = monthDirectPaid.reduce((s, inv) => s + (inv.received_amount ?? inv.total), 0)
  const totalRevenue  = paymentRevenue + directRevenue

  // Build paid invoices list
  const invoicesWithInstallments = ((allPaidInvoices ?? []) as unknown as PaidInv[])
    .filter(inv => paymentInvIds.has(inv.id))
  const paidInvoicesList = [
    ...invoicesWithInstallments.map(inv => ({
      invoice_number: inv.invoice_number,
      client: (Array.isArray(inv.client) ? inv.client[0]?.name : inv.client?.name) ?? '—',
      total: inv.total,
      received: (payments as { invoice_id: string; amount: number }[])
        .filter(p => p.invoice_id === inv.id)
        .reduce((s, p) => s + p.amount, 0),
    })),
    ...monthDirectPaid.map(inv => ({
      invoice_number: inv.invoice_number,
      client: (Array.isArray(inv.client) ? inv.client[0]?.name : inv.client?.name) ?? '—',
      total: inv.total,
      received: inv.received_amount ?? inv.total,
    })),
  ]

  // Expenses
  type ExpRow = { id: string; title: string; amount: number; date: string; category?: string; notes?: string; recurring: boolean }
  const expList = (expensesRaw ?? []) as ExpRow[]
  const totalExpenses = expList.reduce((s, e) => s + e.amount, 0)
  const expByCat: Record<string, number> = {}
  for (const e of expList) {
    const cat = e.category ?? 'other'
    expByCat[cat] = (expByCat[cat] ?? 0) + e.amount
  }

  // Outstanding (current snapshot)
  type OpenInv = { total: number; received_amount?: number; status: string }
  const outstanding   = ((openInvoices ?? []) as OpenInv[]).reduce((s, i) => s + (i.total - (i.received_amount ?? 0)), 0)
  const overdueCount  = ((openInvoices ?? []) as OpenInv[]).filter(i => i.status === 'overdue').length

  // P&L
  const s             = settingsRow
  const costPerDesign  = Number(s?.cost_per_design ?? 15)
  const mediaBuyerRate = Number(s?.media_buyer_rate_per_client ?? 150)
  const designCost     = (designTasks ?? []).length * costPerDesign
  const mediaBuyerCost = (activeClients ?? []).length * mediaBuyerRate
  const totalCosts     = designCost + mediaBuyerCost + totalExpenses
  const netProfit      = totalRevenue - totalCosts

  const partnerDist = [
    { name: s?.partner1_name ?? 'Partner 1', share: Number(s?.partner1_share ?? 50) },
    { name: s?.partner2_name ?? 'Partner 2', share: Number(s?.partner2_share ?? 30) },
    { name: s?.partner3_name ?? 'Partner 3', share: Number(s?.partner3_share ?? 20) },
  ].map(p => ({ ...p, amount: netProfit * (p.share / 100) }))

  return NextResponse.json({
    period: {
      year, month, from, to,
      label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    },
    revenue:  totalRevenue,
    expenses: totalExpenses,
    netProfit,
    outstanding: { total: outstanding, overdueCount },
    expensesByCategory: expByCat,
    paidInvoices: paidInvoicesList,
    expensesList: expList,
    pnl: {
      revenue: totalRevenue,
      designCost,
      mediaBuyerCost,
      operationalExpenses: totalExpenses,
      totalCosts,
      netProfit,
      designTaskCount:   (designTasks ?? []).length,
      activeClientCount: (activeClients ?? []).length,
      partnerDistribution: partnerDist,
    },
  })
}
