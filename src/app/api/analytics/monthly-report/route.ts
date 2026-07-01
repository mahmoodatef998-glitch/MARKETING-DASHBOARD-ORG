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

  // ── Accrual-basis: all invoices issued in this month ────────────────────────
  const [
    { data: monthInvoicesRaw },
    { data: expensesRaw },
    { data: settingsRow },
    { data: designTasks },
    { data: activeClients },
  ] = await Promise.all([
    admin
      .from('invoices')
      .select('id, invoice_number, total, received_amount, status, issued_date, client:clients(name)')
      .gte('issued_date', from)
      .lte('issued_date', to)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .order('issued_date', { ascending: false }),
    admin.from('expenses').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }),
    admin.from('financial_settings').select('*').eq('id', 1).single(),
    admin.from('tasks').select('id').eq('task_type', 'design').eq('status', 'done')
      .gte('updated_at', from).lte('updated_at', to + 'T23:59:59Z').is('deleted_at', null),
    admin.from('clients').select('id').eq('status', 'active').is('deleted_at', null),
  ])

  // Fetch installment payments for this month's invoices to get accurate collected amount
  type InvRow = { id: string; invoice_number: string; total: number; received_amount?: number; status: string; issued_date: string; client: { name: string } | { name: string }[] | null }
  const monthInvoices = (monthInvoicesRaw ?? []) as InvRow[]
  const monthInvoiceIds = monthInvoices.map(inv => inv.id)

  let installmentPayments: { invoice_id: string; amount: number }[] = []
  if (monthInvoiceIds.length > 0) {
    const { data: payments } = await admin
      .from('invoice_payments')
      .select('invoice_id, amount')
      .in('invoice_id', monthInvoiceIds)
      .eq('status', 'paid')
    installmentPayments = payments ?? []
  }

  // Map total installments received per invoice
  const installmentByInv: Record<string, number> = {}
  const hasInstallments = new Set(installmentPayments.map(p => p.invoice_id))
  for (const p of installmentPayments) {
    installmentByInv[p.invoice_id] = (installmentByInv[p.invoice_id] ?? 0) + p.amount
  }

  // Revenue (accrual) = total of all invoices issued this month
  const totalRevenue = monthInvoices.reduce((s, inv) => s + inv.total, 0)

  // Collected = how much of that revenue has been received so far
  const totalCollected = monthInvoices.reduce((s, inv) => {
    if (hasInstallments.has(inv.id)) return s + (installmentByInv[inv.id] ?? 0)
    if (inv.status === 'paid') return s + (inv.received_amount ?? inv.total)
    return s + (inv.received_amount ?? 0)
  }, 0)

  // Outstanding from this month's invoices only
  const monthOutstanding = totalRevenue - totalCollected
  const overdueCount = monthInvoices.filter(inv => inv.status === 'overdue').length

  // Invoice list with collected amount per invoice
  const invoicesList = monthInvoices.map(inv => {
    const clientName = (Array.isArray(inv.client) ? inv.client[0]?.name : inv.client?.name) ?? '—'
    const collected = hasInstallments.has(inv.id)
      ? (installmentByInv[inv.id] ?? 0)
      : inv.status === 'paid' ? (inv.received_amount ?? inv.total) : (inv.received_amount ?? 0)
    return {
      invoice_number: inv.invoice_number,
      client: clientName,
      total: inv.total,
      collected,
      status: inv.status,
      issued_date: inv.issued_date,
    }
  })

  // Expenses
  type ExpRow = { id: string; title: string; amount: number; date: string; category?: string; notes?: string; recurring: boolean }
  const expList = (expensesRaw ?? []) as ExpRow[]
  const totalExpenses = expList.reduce((s, e) => s + e.amount, 0)
  const expByCat: Record<string, number> = {}
  for (const e of expList) {
    const cat = e.category ?? 'other'
    expByCat[cat] = (expByCat[cat] ?? 0) + e.amount
  }

  // P&L
  const s              = settingsRow
  const costPerDesign  = Number(s?.cost_per_design ?? 15)
  const mediaBuyerRate = Number(s?.media_buyer_rate_per_client ?? 150)
  const designCost     = (designTasks ?? []).length * costPerDesign
  const mediaBuyerCost = (activeClients ?? []).length * mediaBuyerRate
  const totalCosts     = designCost + mediaBuyerCost + totalExpenses
  // Net profit uses accrual revenue (total invoiced), not just collected
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
    // Accrual revenue = total invoiced this month
    revenue:   totalRevenue,
    collected: totalCollected,
    outstanding: { total: monthOutstanding, overdueCount },
    expenses: totalExpenses,
    netProfit,
    expensesByCategory: expByCat,
    invoicesList,
    expensesList: expList,
    pnl: {
      revenue:             totalRevenue,
      collected:           totalCollected,
      designCost,
      mediaBuyerCost,
      operationalExpenses: totalExpenses,
      totalCosts,
      netProfit,
      designTaskCount:     (designTasks ?? []).length,
      activeClientCount:   (activeClients ?? []).length,
      partnerDistribution: partnerDist,
    },
  })
}
