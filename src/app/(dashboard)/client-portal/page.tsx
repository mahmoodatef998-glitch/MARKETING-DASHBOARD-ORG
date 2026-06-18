'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, FileText, CheckSquare, Package, Loader2, Download, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, Task } from '@/types'

interface ClientProfile {
  display_name?: string
  role?: string
  client_id?: string
  client?: { id: string; name: string; email: string }
}

interface PackageInfo {
  id: string
  name: string
  price: number
  renewal_type: string
  is_active: boolean
}

export default function ClientPortalPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [pkg, setPkg] = useState<PackageInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const profileRes = await fetch('/api/profile')
      if (!profileRes.ok) { router.push('/login'); return }
      const p = await profileRes.json() as ClientProfile
      if (p?.role === 'admin') { router.push('/dashboard'); return }
      if (p?.role !== 'client') { router.push('/dashboard'); return }
      setProfile(p)

      const [invRes, taskRes] = await Promise.all([
        fetch('/api/invoices'),
        fetch('/api/tasks'),
      ])

      if (invRes.ok) {
        const data = await invRes.json() as Invoice[]
        setInvoices(Array.isArray(data) ? data : [])
      }
      if (taskRes.ok) {
        const data = await taskRes.json() as Task[]
        setTasks(Array.isArray(data) ? data : [])
      }

      // Fetch package
      if (p.client_id) {
        const pkgRes = await fetch(`/api/clients/${p.client_id}/packages`)
        if (pkgRes.ok) {
          const pkgs = await pkgRes.json() as PackageInfo[]
          const active = Array.isArray(pkgs) ? pkgs.find(pk => pk.is_active) ?? null : null
          setPkg(active)
        }
      }

      setLoading(false)
    }
    void load()
  }, [router])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  const paidInvoices    = invoices.filter(i => i.status === 'paid')
  const pendingInvoices = invoices.filter(i => i.status === 'sent')
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const doneTasks       = tasks.filter(t => t.status === 'done')
  const activeTasks     = tasks.filter(t => !['done', 'overdue'].includes(t.status))
  const overdueTasks    = tasks.filter(t => t.status === 'overdue')

  const totalPaid = paidInvoices.reduce((s, i) => s + (i.received_amount ?? i.total), 0)
  const totalOwed = [...pendingInvoices, ...overdueInvoices].reduce((s, i) => s + (i.total - (i.received_amount ?? 0)), 0)

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <User className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            Welcome, {profile?.client?.name ?? profile?.display_name ?? 'Client'}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Your account overview</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-400 mb-1">Paid Invoices</p>
            <p className="text-xl font-bold text-green-400">{paidInvoices.length}</p>
            <p className="text-xs text-slate-500">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className={overdueInvoices.length > 0 ? 'border-red-500/30' : ''}>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-400 mb-1">Outstanding</p>
            <p className={`text-xl font-bold ${overdueInvoices.length > 0 ? 'text-red-400' : 'text-slate-100'}`}>
              {pendingInvoices.length + overdueInvoices.length}
            </p>
            <p className="text-xs text-slate-500">{formatCurrency(totalOwed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-400 mb-1">Tasks Done</p>
            <p className="text-xl font-bold text-violet-400">{doneTasks.length}</p>
            <p className="text-xs text-slate-500">{activeTasks.length} in progress</p>
          </CardContent>
        </Card>
        <Card className={overdueTasks.length > 0 ? 'border-orange-500/30' : ''}>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-400 mb-1">Overdue Tasks</p>
            <p className={`text-xl font-bold ${overdueTasks.length > 0 ? 'text-orange-400' : 'text-slate-100'}`}>
              {overdueTasks.length}
            </p>
            <p className="text-xs text-slate-500">requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Package info */}
      {pkg && (
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Package className="h-4 w-4 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-100">{pkg.name}</p>
              <p className="text-xs text-slate-400">{pkg.renewal_type} · {formatCurrency(pkg.price)}</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              Active
            </span>
          </CardContent>
        </Card>
      )}

      {/* Overdue alert */}
      {overdueInvoices.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">
                {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-400">
                Total: {formatCurrency(overdueInvoices.reduce((s, i) => s + (i.total - (i.received_amount ?? 0)), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent invoices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            Recent Invoices
          </h2>
          <button onClick={() => router.push('/billing')} className="text-xs text-violet-400 hover:text-violet-300">
            View all →
          </button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.slice(0, 5).map(inv => (
              <Card key={inv.id} className="hover:border-slate-600 transition-colors">
                <CardContent className="py-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-violet-400 font-semibold shrink-0">{inv.invoice_number}</span>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(inv.issued_date ?? inv.created_at)}</span>
                  <div className="flex-1" />
                  <span className="text-sm font-bold text-slate-100 shrink-0">{formatCurrency(inv.received_amount ?? inv.total)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    inv.status === 'paid'    ? 'bg-green-500/10 text-green-400' :
                    inv.status === 'overdue' ? 'bg-red-500/10 text-red-400' :
                                               'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {inv.status}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>
                    <Download className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Task progress */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3">
          <CheckSquare className="h-4 w-4 text-slate-500" />
          Task Progress
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No tasks yet.</p>
        ) : (
          <Card>
            <CardContent className="py-4 space-y-3">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>{doneTasks.length} completed</span>
                  <span>{tasks.length} total</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
              {/* Status breakdown */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-green-400">{doneTasks.length} done</span>
                <span className="text-blue-400">{activeTasks.length} in progress</span>
                {overdueTasks.length > 0 && <span className="text-red-400">{overdueTasks.length} overdue</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
