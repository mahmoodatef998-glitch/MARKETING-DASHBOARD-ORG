'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Download, Calendar, TrendingUp, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'

function groupByMonth(invoices: Invoice[]) {
  const groups: Record<string, Invoice[]> = {}
  for (const inv of invoices) {
    const date = new Date(inv.received_at ?? inv.updated_at ?? inv.created_at)
    const key = date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    if (!groups[key]) groups[key] = []
    groups[key].push(inv)
  }
  // Sort keys descending by date
  return Object.entries(groups).sort(([a], [b]) => {
    return new Date(b + ' 1').getTime() - new Date(a + ' 1').getTime()
  })
}

export default function BillingPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Check auth/role
        const profileRes = await fetch('/api/profile')
        if (!profileRes.ok) { router.push('/dashboard'); return }
        const profile = await profileRes.json() as { role?: string }
        if (profile?.role !== 'admin') { router.push('/dashboard'); return }

        const res = await fetch('/api/invoices')
        if (!res.ok) { setLoading(false); return }
        const data = await res.json() as Invoice[]
        const paid = Array.isArray(data) ? data.filter((inv) => inv.status === 'paid') : []
        setInvoices(paid)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [router])

  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.received_amount ?? inv.total), 0)
  const grouped = groupByMonth(invoices)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <FileText className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Invoice History</h1>
          <p className="text-sm text-slate-400 mt-0.5">All received payments</p>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Calendar className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Invoices Paid</p>
                <p className="text-xl font-bold text-slate-100">{invoices.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <TrendingUp className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Revenue</p>
                <p className="text-xl font-bold text-slate-100">{formatCurrency(totalRevenue)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No paid invoices yet.</p>
            <p className="text-slate-500 text-xs mt-1">Paid invoices will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([month, monthInvoices]) => {
            const monthTotal = monthInvoices.reduce(
              (sum, inv) => sum + (inv.received_amount ?? inv.total),
              0
            )
            return (
              <div key={month}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-300">{month}</h2>
                    <span className="text-xs text-slate-500">
                      {monthInvoices.length} invoice{monthInvoices.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-green-400">
                    {formatCurrency(monthTotal)}
                  </span>
                </div>

                {/* Invoice cards */}
                <div className="space-y-2">
                  {monthInvoices.map((inv) => (
                    <Card key={inv.id} className="hover:border-slate-600 transition-colors">
                      <CardContent className="py-4 flex items-center gap-4">
                        {/* Invoice number */}
                        <div className="shrink-0 min-w-[120px]">
                          <span className="font-mono text-sm text-violet-400 font-semibold">
                            {inv.invoice_number}
                          </span>
                        </div>

                        {/* Client + date */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">
                            {inv.client?.name ?? 'Unknown client'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDate(inv.received_at ?? inv.updated_at)}
                          </p>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-100">
                            {formatCurrency(inv.received_amount ?? inv.total)}
                          </p>
                        </div>

                        {/* Status badge */}
                        <div className="shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
                            paid
                          </span>
                        </div>

                        {/* PDF download */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 hover:text-violet-400"
                          onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
