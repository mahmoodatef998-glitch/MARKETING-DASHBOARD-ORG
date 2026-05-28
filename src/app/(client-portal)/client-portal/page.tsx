'use client'
import { useEffect, useState } from 'react'
import {
  CheckSquare, Clock, AlertTriangle, Loader2, FileText,
  ExternalLink, CheckCircle2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import PackageProgress from '@/components/clients/PackageProgress'
import TaskDetailModal from '@/components/tasks/TaskDetailModal'
import type { Task, Invoice, ClientPackage } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo:        { label: 'To Do',       color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  review:      { label: 'Awaiting Approval', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  done:        { label: 'Done',         color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  overdue:     { label: 'Overdue',      color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft:   { label: 'Draft',   color: 'bg-slate-500/10 text-slate-400' },
  sent:    { label: 'Sent',    color: 'bg-blue-500/10 text-blue-400' },
  paid:    { label: 'Paid',    color: 'bg-green-500/10 text-green-400' },
  overdue: { label: 'Overdue', color: 'bg-red-500/10 text-red-400' },
}

// ─── Approval Card ────────────────────────────────────────────────────────────
function ApprovalCard({ task, onAction }: { task: Task; onAction: () => void }) {
  const [reviseOpen, setReviseOpen] = useState(false)
  const [notes, setNotes]           = useState('')
  const [loading, setLoading]       = useState<'approve' | 'revise' | null>(null)

  async function approve() {
    setLoading('approve')
    await fetch(`/api/tasks/${task.id}/approve`, { method: 'POST' })
    onAction()
    setLoading(null)
  }

  async function revise() {
    if (!notes.trim()) return
    setLoading('revise')
    await fetch(`/api/tasks/${task.id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    onAction()
    setLoading(null)
  }

  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">
              ⏳ Awaiting Your Approval
            </span>
            {task.task_type && (
              <span className="text-xs text-slate-500 capitalize">{task.task_type.replace('_', ' ')}</span>
            )}
          </div>
          <h3 className="font-semibold text-white text-sm">{task.title}</h3>
          {task.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>

      {/* Delivery link */}
      {task.delivery_url && (
        <div className="mx-4 mb-3 flex items-center gap-3 bg-slate-800/60 rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 font-medium mb-0.5">Delivery ready for review</p>
            <p className="text-xs text-slate-500 truncate">{task.delivery_url}</p>
          </div>
          <a
            href={task.delivery_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      )}

      {/* Action buttons */}
      {!reviseOpen ? (
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={approve}
            disabled={!!loading}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {loading === 'approve'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />}
            Approve & Done
          </button>
          <button
            onClick={() => setReviseOpen(true)}
            disabled={!!loading}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-slate-200 text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Request Revision
          </button>
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what needs to be changed…"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={revise}
              disabled={!notes.trim() || !!loading}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
            >
              {loading === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Send Revision Request
            </button>
            <button
              onClick={() => { setReviseOpen(false); setNotes('') }}
              className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientPortalPage() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [invoices, setInvoices]     = useState<Invoice[]>([])
  const [pkg, setPkg]               = useState<ClientPackage | null>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'tasks' | 'invoices'>('tasks')
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [doneOpen, setDoneOpen]     = useState(false)

  async function load() {
    const [tasksRes, invoicesRes, pkgRes] = await Promise.all([
      fetch('/api/tasks'),
      fetch('/api/invoices'),
      fetch('/api/packages/mine'),
    ])
    const td = await tasksRes.json()
    const id = await invoicesRes.json()
    const pd = await pkgRes.json()
    setTasks(Array.isArray(td) ? td : [])
    setInvoices(Array.isArray(id) ? id : [])
    setPkg(pd && !pd.error ? pd : null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  const reviewTasks  = tasks.filter(t => t.status === 'review')
  const activeTasks  = tasks.filter(t => t.status !== 'done' && t.status !== 'review')
  const doneTasks    = tasks.filter(t => t.status === 'done')
  const fallbackPct  = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Welcome to your portal 👋</h2>
        <p className="text-slate-400 text-sm">Review deliverables, track progress, and manage your invoices.</p>
      </div>

      {/* Package progress */}
      {pkg ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <PackageProgress pkg={pkg} />
        </div>
      ) : tasks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Project Progress</p>
            <p className="text-sm font-bold text-white">{fallbackPct}%</p>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${fallbackPct}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-2">{doneTasks.length} of {tasks.length} tasks completed</p>
        </div>
      )}

      {/* ── Awaiting Approval section ─────────────────────────────────────────── */}
      {reviewTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <h3 className="text-sm font-semibold text-amber-400">
              {reviewTasks.length} item{reviewTasks.length > 1 ? 's' : ''} awaiting your approval
            </h3>
          </div>
          {reviewTasks.map(task => (
            <ApprovalCard key={task.id} task={task} onAction={load} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {(['tasks', 'invoices'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            {t === 'tasks' ? <CheckSquare className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'tasks' && activeTasks.length > 0 && (
              <span className="ml-1 text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                {activeTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* Active tasks */}
          {activeTasks.length === 0 && reviewTasks.length === 0 && doneTasks.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No tasks yet</p>
            </div>
          )}

          <div className="space-y-2.5">
            {activeTasks.map(task => {
              const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
              return (
                <div
                  key={task.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-colors"
                  onClick={() => setDetailTask(task)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white text-sm">{task.title}</h3>
                      {task.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {task.due_date && (
                    <div className={`flex items-center gap-1 text-xs mt-2.5 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                      {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Completed tasks (collapsible) */}
          {doneTasks.length > 0 && (
            <div>
              <button
                onClick={() => setDoneOpen(o => !o)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-400 py-1"
              >
                {doneOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {doneTasks.length} completed task{doneTasks.length > 1 ? 's' : ''}
              </button>
              {doneOpen && (
                <div className="space-y-2 mt-2 opacity-70">
                  {doneTasks.map(task => (
                    <div
                      key={task.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3 cursor-pointer hover:border-slate-700 transition-colors"
                      onClick={() => setDetailTask(task)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          <span className="text-sm text-slate-300 truncate">{task.title}</span>
                        </div>
                        {task.delivery_url && (
                          <a
                            href={task.delivery_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" /> View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <div className="space-y-3">
          {invoices.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No invoices yet</p>
            </div>
          )}
          {invoices.map(inv => {
            const cfg = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft
            return (
              <div key={inv.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-400 mt-1">Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">${inv.total.toLocaleString()}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <TaskDetailModal task={detailTask} open={!!detailTask} onClose={() => setDetailTask(null)} />
    </div>
  )
}
