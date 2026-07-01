'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Banknote, Wrench, Megaphone, Building2, Users, MoreHorizontal, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CAT_META: Record<string, { label: string; color: string }> = {
  salary:     { label: 'Salary',     color: 'text-violet-400 bg-violet-500/15 border-violet-500/25' },
  tools:      { label: 'Tools',      color: 'text-blue-400 bg-blue-500/15 border-blue-500/25' },
  ads:        { label: 'Ads',        color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' },
  office:     { label: 'Office',     color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25' },
  freelancer: { label: 'Freelancer', color: 'text-pink-400 bg-pink-500/15 border-pink-500/25' },
  other:      { label: 'Other',      color: 'text-slate-400 bg-slate-500/15 border-slate-500/25' },
}

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-green-500/10 text-green-400 border-green-500/20',
  sent:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  overdue: 'bg-red-500/10 text-red-400 border-red-500/20',
}

function catMeta(cat?: string) {
  return CAT_META[cat ?? 'other'] ?? CAT_META.other
}

interface InvoiceRow {
  invoice_number: string
  client: string
  total: number
  collected: number
  status: string
  issued_date: string
}

interface MonthlyData {
  period: { year: number; month: number; from: string; to: string; label: string }
  revenue: number
  collected: number
  outstanding: { total: number; overdueCount: number }
  expenses: number
  netProfit: number
  expensesByCategory: Record<string, number>
  invoicesList: InvoiceRow[]
  expensesList: { id: string; title: string; amount: number; date: string; category?: string; notes?: string; recurring: boolean }[]
  pnl: {
    revenue: number
    collected: number
    designCost: number
    mediaBuyerCost: number
    operationalExpenses: number
    totalCosts: number
    netProfit: number
    designTaskCount: number
    activeClientCount: number
    partnerDistribution: { name: string; share: number; amount: number }[]
  }
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 space-y-3 bg-slate-900 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-slate-800/80">{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function MonthlyReportPage() {
  const router = useRouter()
  const now    = new Date()

  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [data,    setData]    = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || p.role !== 'admin') router.replace('/dashboard')
    })
  }, [router])

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`/api/analytics/monthly-report?year=${y}&month=${m}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(year, month) }, [year, month, load])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    if (isCurrentMonth) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Monthly Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">دخل وتكاليف كل شهر — بناءً على تاريخ الإصدار</p>
        </div>

        {/* Month picker */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-2xl px-2 py-1.5">
          <button onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-200 min-w-[130px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-52">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Revenue (Accrual)"
              value={formatCurrency(data.revenue)}
              sub={`${data.invoicesList.length} invoices issued`}
              color="border-indigo-500/20"
              icon={<TrendingUp className="h-4 w-4 text-indigo-400" />}
            />
            <KpiCard
              label="Collected"
              value={formatCurrency(data.collected)}
              sub={data.revenue > 0 ? `${Math.round((data.collected / data.revenue) * 100)}% received` : undefined}
              color="border-green-500/20"
              icon={<DollarSign className="h-4 w-4 text-green-400" />}
            />
            <KpiCard
              label="Net Profit"
              value={formatCurrency(data.netProfit)}
              sub={data.revenue > 0 ? `Margin: ${Math.round((data.netProfit / data.revenue) * 100)}%` : undefined}
              color={data.netProfit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}
              icon={<DollarSign className={`h-4 w-4 ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />}
            />
            <KpiCard
              label="Uncollected"
              value={formatCurrency(data.outstanding.total)}
              sub={data.outstanding.overdueCount > 0 ? `${data.outstanding.overdueCount} overdue` : 'From this month\'s invoices'}
              color={data.outstanding.overdueCount > 0 ? 'border-amber-500/20' : 'border-slate-700'}
              icon={<AlertTriangle className={`h-4 w-4 ${data.outstanding.overdueCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />}
            />
          </div>

          {/* P&L Breakdown */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              P&L — {data.period.label}
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Revenue (accrual)</span>
                <span className="text-green-400 font-semibold">{formatCurrency(data.pnl.revenue)}</span>
              </div>
              {data.pnl.collected < data.pnl.revenue && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span className="pl-3">↳ collected so far</span>
                  <span className="text-emerald-400">{formatCurrency(data.pnl.collected)}</span>
                </div>
              )}

              <div className="border-l-2 border-red-500/30 ml-2 pl-3 space-y-1.5">
                {data.pnl.designCost > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Design costs ({data.pnl.designTaskCount} designs × AED {data.pnl.designTaskCount > 0 ? Math.round(data.pnl.designCost / data.pnl.designTaskCount) : 0})</span>
                    <span className="text-red-400">− {formatCurrency(data.pnl.designCost)}</span>
                  </div>
                )}
                {data.pnl.mediaBuyerCost > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Media buyer ({data.pnl.activeClientCount} clients × AED {data.pnl.activeClientCount > 0 ? Math.round(data.pnl.mediaBuyerCost / data.pnl.activeClientCount) : 0})</span>
                    <span className="text-red-400">− {formatCurrency(data.pnl.mediaBuyerCost)}</span>
                  </div>
                )}
                {data.pnl.operationalExpenses > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Operational expenses</span>
                    <span className="text-red-400">− {formatCurrency(data.pnl.operationalExpenses)}</span>
                  </div>
                )}
                {data.pnl.totalCosts === 0 && (
                  <p className="text-xs text-slate-600">No costs recorded this month</p>
                )}
              </div>

              <div className={`flex justify-between text-sm font-bold border-t border-slate-700 pt-2 ${data.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <span>Net Profit</span>
                <span>{formatCurrency(data.netProfit)}</span>
              </div>
            </div>

            {/* Partner distribution */}
            {data.netProfit > 0 && (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider">توزيع الأرباح</p>
                {data.pnl.partnerDistribution.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{p.name}</span>
                      <span className="text-slate-500">{p.share}%</span>
                    </div>
                    <span className="text-emerald-400 font-semibold text-sm w-28 text-right">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Expense categories */}
            {Object.keys(data.expensesByCategory).length > 0 && (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Expenses by Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(data.expensesByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, amt]) => {
                      const meta = catMeta(cat)
                      return (
                        <div key={cat} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${meta.color}`}>
                          <span className="font-semibold truncate">{meta.label}</span>
                          <span className="ml-auto shrink-0 font-bold">{formatCurrency(amt)}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Invoices issued this month */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-300">Invoices Issued</h2>
              <span className="ml-auto text-xs text-slate-500">{data.invoicesList.length} invoices · {formatCurrency(data.revenue)} total</span>
            </div>

            {data.invoicesList.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-600 border border-dashed border-slate-800 rounded-xl">
                No invoices issued in {data.period.label}
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.invoicesList.map((inv, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
                    <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{inv.client}</p>
                      <p className="text-xs text-slate-500">{inv.invoice_number} · {inv.issued_date}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.sent}`}>
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                    <div className="text-right shrink-0 min-w-[80px]">
                      <p className="text-sm font-bold text-slate-100">{formatCurrency(inv.total)}</p>
                      {inv.collected < inv.total && inv.collected > 0 && (
                        <p className="text-xs text-emerald-400">{formatCurrency(inv.collected)} paid</p>
                      )}
                      {inv.collected === 0 && inv.status !== 'paid' && (
                        <p className="text-xs text-slate-500">unpaid</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-slate-300">Expenses</h2>
              <span className="ml-auto text-xs text-slate-500">{data.expensesList.length} items · {formatCurrency(data.expenses)} total</span>
            </div>

            {data.expensesList.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-600 border border-dashed border-slate-800 rounded-xl">
                No expenses recorded in {data.period.label}
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.expensesList.map(exp => {
                  const meta = catMeta(exp.category)
                  return (
                    <div key={exp.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${meta.color}`}>
                        <ExpIcon cat={exp.category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{exp.title}</p>
                        <p className="text-xs text-slate-500">{exp.date}{exp.recurring ? ' · Recurring' : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-red-400">{formatCurrency(exp.amount)}</p>
                        <p className="text-xs text-slate-600">{meta.label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {!loading && !data && (
        <div className="flex items-center justify-center h-52 text-slate-500 text-sm">
          Failed to load report. Please try again.
        </div>
      )}
    </div>
  )
}

function ExpIcon({ cat }: { cat?: string }) {
  const icons: Record<string, React.ReactNode> = {
    salary:     <Users className="h-3.5 w-3.5" />,
    tools:      <Wrench className="h-3.5 w-3.5" />,
    ads:        <Megaphone className="h-3.5 w-3.5" />,
    office:     <Building2 className="h-3.5 w-3.5" />,
    freelancer: <Users className="h-3.5 w-3.5" />,
    other:      <MoreHorizontal className="h-3.5 w-3.5" />,
  }
  return <>{icons[cat ?? 'other'] ?? icons.other}</>
}
