'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Loader2, User, FileText, CreditCard, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'

interface AuditLog {
  id: string
  user_email?: string
  action: string
  table_name: string
  record_id?: string
  new_value?: Record<string, unknown>
  ip_address?: string
  created_at: string
}

const TABLE_ICON: Record<string, React.ReactNode> = {
  invoices:         <FileText className="h-3.5 w-3.5" />,
  clients:          <Users className="h-3.5 w-3.5" />,
  invoice_payments: <CreditCard className="h-3.5 w-3.5" />,
}

const ACTION_COLOR: Record<string, string> = {
  mark_paid:     'text-green-400 bg-green-500/10',
  send:          'text-blue-400 bg-blue-500/10',
  approve:       'text-violet-400 bg-violet-500/10',
  reject:        'text-red-400 bg-red-500/10',
  create:        'text-cyan-400 bg-cyan-500/10',
  update:        'text-yellow-400 bg-yellow-500/10',
  delete:        'text-red-400 bg-red-500/10',
  mark_received: 'text-green-400 bg-green-500/10',
  mark_overdue:  'text-orange-400 bg-orange-500/10',
}

export default function AuditLogPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const profileRes = await fetch('/api/profile')
      if (!profileRes.ok) { router.push('/dashboard'); return }
      const profile = await profileRes.json() as { role?: string }
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      const res = await fetch('/api/audit-logs')
      if (res.ok) {
        const data = await res.json() as AuditLog[]
        setLogs(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }
    void load()
  }, [router])

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Shield className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">All system actions tracked</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No audit entries yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <Card key={log.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="py-3 flex flex-wrap items-center gap-3">
                {/* Action badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${ACTION_COLOR[log.action] ?? 'text-slate-400 bg-slate-500/10'}`}>
                  {log.action.replace(/_/g, ' ')}
                </span>

                {/* Table */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                  {TABLE_ICON[log.table_name] ?? <FileText className="h-3.5 w-3.5" />}
                  <span>{log.table_name}</span>
                  {log.record_id && (
                    <span className="font-mono text-slate-500">#{log.record_id.slice(0, 8)}</span>
                  )}
                </div>

                {/* User */}
                <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                  <User className="h-3 w-3" />
                  <span>{log.user_email ?? 'system'}</span>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Time */}
                <span className="text-xs text-slate-600">{formatDate(log.created_at)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
