'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Users, CheckSquare, FileText, TrendingUp, AlertCircle, Clock } from 'lucide-react'
import type { Client, Task, Invoice } from '@/types'

interface Stats {
  totalClients: number
  activeClients: number
  totalTasks: number
  overdueTasks: number
  paidInvoices: number
  pendingRevenue: number
  totalRevenue: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentClients, setRecentClients] = useState<Client[]>([])
  const [recentTasks, setRecentTasks] = useState<Task[]>([])

  useEffect(() => {
    async function load() {
      const [cr, tr, ir] = await Promise.all([
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/invoices').then((r) => r.json()),
      ])

      const clients: Client[] = Array.isArray(cr) ? cr : []
      const tasks: Task[] = Array.isArray(tr) ? tr : []
      const invoices: Invoice[] = Array.isArray(ir) ? ir : []

      setRecentClients(clients.slice(0, 5))
      setRecentTasks(tasks.slice(0, 5))

      setStats({
        totalClients: clients.length,
        activeClients: clients.filter((c) => c.status === 'active').length,
        totalTasks: tasks.length,
        overdueTasks: tasks.filter((t) => t.status === 'overdue').length,
        paidInvoices: invoices.filter((i) => i.status === 'paid').length,
        pendingRevenue: invoices
          .filter((i) => i.status === 'sent' || i.status === 'overdue')
          .reduce((s, i) => s + i.total, 0),
        totalRevenue: invoices
          .filter((i) => i.status === 'paid')
          .reduce((s, i) => s + i.total, 0),
      })
    }
    load()
  }, [])

  const statCards = [
    {
      title: 'Total Clients',
      value: stats?.totalClients ?? '—',
      sub: `${stats?.activeClients ?? 0} active`,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      title: 'Tasks',
      value: stats?.totalTasks ?? '—',
      sub: `${stats?.overdueTasks ?? 0} overdue`,
      icon: CheckSquare,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      title: 'Pending Revenue',
      value: stats ? formatCurrency(stats.pendingRevenue) : '—',
      sub: 'Sent & overdue invoices',
      icon: AlertCircle,
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
    },
    {
      title: 'Total Revenue',
      value: stats ? formatCurrency(stats.totalRevenue) : '—',
      sub: `${stats?.paidInvoices ?? 0} paid invoices`,
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.title}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400">{s.title}</p>
                  <p className="text-2xl font-bold text-slate-100 mt-1">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
                </div>
                <div className={`p-2.5 rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-blue-400" /> Recent Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentClients.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No clients yet</p>
            )}
            {recentClients.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${c.status === 'active' ? 'bg-green-500/20 text-green-400' :
                    c.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-slate-700 text-slate-400'}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-purple-400" /> Recent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTasks.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No tasks yet</p>
            )}
            {recentTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-200">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : 'No due date'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${t.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    t.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                    t.status === 'in_progress' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-blue-500/20 text-blue-400'}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
