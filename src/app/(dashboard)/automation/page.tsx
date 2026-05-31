'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Zap, Mail, CheckCircle, XCircle, RefreshCw, Clock, Send, FileText, Bell, AlarmClock, CheckSquare } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { AutomationLog, AutomationLogType } from '@/types'

const LOG_LABELS: Record<AutomationLogType, string> = {
  payment_reminder:  'Payment Reminder',
  task_reminder:     'Overdue Task',
  task_reminder_48h: '48h Task Reminder',
  task_reminder_24h: '24h Task Reminder',
  task_confirmation: 'Deadline Confirmation',
  task_completed:    'Task Completed → Client',
}

const LOG_ICONS: Record<AutomationLogType, React.ElementType> = {
  payment_reminder:  FileText,
  task_reminder:     Bell,
  task_reminder_48h: AlarmClock,
  task_reminder_24h: AlarmClock,
  task_confirmation: Send,
  task_completed:    CheckSquare,
}

export default function AutomationPage() {
  const { toast } = useToast()
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  async function loadLogs() {
    const res = await fetch('/api/automation/logs')
    const data = await res.json()
    setLogs(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { void loadLogs() }, [])

  async function runNow() {
    setRunning(true)
    try {
      // No Authorization header needed — server validates admin session via cookie
      const res = await fetch('/api/cron/daily')
      const data = await res.json()
      if (res.ok) {
        toast(`Automation ran: ${data.processed} emails processed`, 'success')
        loadLogs()
      } else {
        toast(data.error ?? 'Automation failed', 'error')
      }
    } catch {
      toast('Failed to run automation', 'error')
    }
    setRunning(false)
  }

  const sentCount    = logs.filter((l) => l.status === 'sent').length
  const failedCount  = logs.filter((l) => l.status === 'failed').length
  const paymentLogs  = logs.filter((l) => l.type === 'payment_reminder')

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-400/10">
                <Mail className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Emails Sent</p>
                <p className="text-2xl font-bold text-slate-100">{sentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-yellow-400/10">
                <FileText className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Payment Reminders</p>
                <p className="text-2xl font-bold text-slate-100">{paymentLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-400/10">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Failed</p>
                <p className="text-2xl font-bold text-slate-100">{failedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automation Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-yellow-400" /> Automation Rules
          </CardTitle>
          <CardDescription>Runs daily at 9:00 AM UTC via Vercel Cron</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              icon: FileText,
              color: 'text-yellow-400',
              bg: 'bg-yellow-400/10',
              title: 'Payment Reminder',
              desc: 'Auto-emails clients when invoice is past due. Updates invoice to "overdue".',
              timing: 'Daily 9AM',
            },
            {
              icon: AlarmClock,
              color: 'text-indigo-400',
              bg: 'bg-indigo-400/10',
              title: '48h Task Reminder',
              desc: 'Emails the assigned team member with full task & client details 2 days before the due date.',
              timing: '48h before',
            },
            {
              icon: AlarmClock,
              color: 'text-orange-400',
              bg: 'bg-orange-400/10',
              title: '24h Task Reminder',
              desc: 'Sends an urgent reminder to the team member 1 day before the deadline.',
              timing: '24h before',
            },
            {
              icon: Send,
              color: 'text-blue-400',
              bg: 'bg-blue-400/10',
              title: 'Deadline Confirmation',
              desc: 'On the due date: asks the team member to confirm completion and update the task status to Done.',
              timing: 'Due date',
            },
            {
              icon: CheckSquare,
              color: 'text-green-400',
              bg: 'bg-green-400/10',
              title: 'Task Completed → Client',
              desc: 'When a team member marks a task as Done, the linked client instantly receives a completion notification.',
              timing: 'On status change',
            },
            {
              icon: Bell,
              color: 'text-red-400',
              bg: 'bg-red-400/10',
              title: 'Overdue Task Alert',
              desc: 'Auto-emails assigned team member when task is past due and not completed. Updates task to "overdue".',
              timing: 'Daily 9AM',
            },
          ].map((rule) => (
            <div key={rule.title} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className={`p-2 rounded-lg ${rule.bg} shrink-0`}>
                <rule.icon className={`h-4 w-4 ${rule.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-100">{rule.title}</h3>
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Active</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{rule.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                <Clock className="h-3.5 w-3.5" /> {rule.timing}
              </div>
            </div>
          ))}

          <div className="pt-2">
            <Button onClick={runNow} disabled={running} variant="outline" size="sm">
              {running ? <><RefreshCw className="h-4 w-4 animate-spin" /> Running…</> : <><RefreshCw className="h-4 w-4" /> Run Now (Manual)</>}
            </Button>
            <p className="text-xs text-slate-500 mt-2">
              Manual run is available to admin users. In production this also runs automatically via Vercel Cron at 9:00 AM UTC.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" /> Activity Log
            </span>
            <Button variant="ghost" size="sm" onClick={loadLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded bg-slate-800/50 animate-pulse" />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No automation logs yet. Logs appear after the cron job runs.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const Icon = LOG_ICONS[log.type] ?? Mail
                return (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-slate-800 last:border-0">
                    <div className="shrink-0 mt-0.5 flex items-center gap-1">
                      {log.status === 'sent'
                        ? <CheckCircle className="h-4 w-4 text-green-400" />
                        : <XCircle    className="h-4 w-4 text-red-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium">{log.subject}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Icon className="h-3 w-3 shrink-0" />
                        {LOG_LABELS[log.type] ?? log.type} → {log.recipient_email}
                      </p>
                      {log.error && <p className="text-xs text-red-400 mt-0.5">Error: {log.error}</p>}
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{formatDate(log.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
