'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  CheckCircle2,
  FileCheck,
  RefreshCw,
  User,
  Building2,
  ExternalLink,
  Loader2,
} from 'lucide-react'

interface ApprovalTask {
  id: string
  title: string
  task_type: string
  delivery_url: string | null
  approval_status: string
  client_approved_at: string | null
  admin_approved_at: string | null
  created_at: string
  updated_at: string
  revision_notes: string | null
  assignee: { id: string; display_name: string; role: string } | null
  client: { id: string; name: string } | null
}

const APPROVAL_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: 'Pending',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    icon: Clock,
  },
  client_approved: {
    label: 'Client Approved ✓',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    icon: CheckCircle2,
  },
  admin_approved: {
    label: 'Approved',
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
    icon: FileCheck,
  },
  revision_requested: {
    label: 'Revision',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    icon: RefreshCw,
  },
}

type FilterType = 'all' | 'pending' | 'client_approved' | 'admin_approved' | 'revision_requested'

const FILTER_LABELS: Record<FilterType, string> = {
  all: 'All',
  pending: 'Pending',
  client_approved: 'Client Approved',
  admin_approved: 'Approved',
  revision_requested: 'Revision',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ApprovalsPage() {
  const [tasks, setTasks] = useState<ApprovalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchTasks = useCallback(async (currentFilter: FilterType) => {
    setLoading(true)
    try {
      if (currentFilter === 'all') {
        // Fetch pending+client_approved (default) AND admin_approved AND revision_requested
        const [defaultRes, adminRes, revisionRes] = await Promise.all([
          fetch('/api/approvals'),
          fetch('/api/approvals?status=admin_approved'),
          fetch('/api/approvals?status=revision_requested'),
        ])
        const [defaultData, adminData, revisionData] = await Promise.all([
          defaultRes.ok ? defaultRes.json() : [],
          adminRes.ok ? adminRes.json() : [],
          revisionRes.ok ? revisionRes.json() : [],
        ])
        const combined: ApprovalTask[] = [
          ...(Array.isArray(defaultData) ? defaultData : defaultData?.tasks ?? []),
          ...(Array.isArray(adminData) ? adminData : adminData?.tasks ?? []),
          ...(Array.isArray(revisionData) ? revisionData : revisionData?.tasks ?? []),
        ]
        // Deduplicate by id
        const seen = new Set<string>()
        setTasks(combined.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true }))
      } else {
        const res = await fetch(`/api/approvals?status=${currentFilter}`)
        if (!res.ok) { setTasks([]); return }
        const data = await res.json()
        setTasks(Array.isArray(data) ? data : data?.tasks ?? [])
      }
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks(filter)
  }, [filter, fetchTasks])

  async function handleAction(taskId: string, action: 'revision_requested' | 'admin_approve') {
    setActionLoading(taskId + action)
    try {
      const body: Record<string, string> = { task_id: taskId, action }
      if (action === 'revision_requested') {
        body.note = revisionNotes[taskId] ?? ''
      }
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setRevisionNotes((prev) => { const n = { ...prev }; delete n[taskId]; return n })
        await fetchTasks(filter)
      }
    } finally {
      setActionLoading(null)
    }
  }

  // Stats derived from ALL tasks fetched (when filter is 'all') or from the filtered set
  const allTasksForStats = tasks

  const statCounts = {
    pending: allTasksForStats.filter((t) => t.approval_status === 'pending').length,
    client_approved: allTasksForStats.filter((t) => t.approval_status === 'client_approved').length,
    admin_approved: allTasksForStats.filter((t) => t.approval_status === 'admin_approved').length,
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="mt-1 text-sm text-slate-400">Review and approve completed designs</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Pending</span>
            </div>
            <p className="text-3xl font-bold text-amber-400">{statCounts.pending}</p>
          </div>
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Client Approved</span>
            </div>
            <p className="text-3xl font-bold text-blue-400">{statCounts.client_approved}</p>
          </div>
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="h-4 w-4 text-green-400" />
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Fully Approved</span>
            </div>
            <p className="text-3xl font-bold text-green-400">{statCounts.admin_approved}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filter === f
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-100'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <FileCheck className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No tasks found</p>
            <p className="text-sm mt-1">
              {filter === 'all' ? 'There are no approval tasks yet.' : `No tasks with status "${FILTER_LABELS[filter]}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const statusCfg = APPROVAL_STATUS_CONFIG[task.approval_status] ?? APPROVAL_STATUS_CONFIG.pending
              const StatusIcon = statusCfg.icon
              const isAdminApproved = task.approval_status === 'admin_approved'
              const isClientApproved = task.approval_status === 'client_approved'
              const isDesign = task.task_type === 'design'

              return (
                <div
                  key={task.id}
                  className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-white leading-tight">{task.title}</h3>
                        {isDesign && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                            Design · 15 AED
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {task.assignee && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assignee.display_name}
                          </span>
                        )}
                        {task.client && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {task.client.name}
                          </span>
                        )}
                        <span>{formatDate(task.created_at)}</span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border shrink-0 ${statusCfg.color}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Delivery URL */}
                  {task.delivery_url && (
                    <div className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2">
                      <a
                        href={task.delivery_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors break-all"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{task.delivery_url}</span>
                      </a>
                    </div>
                  )}

                  {/* Client approved notice */}
                  {task.client_approved_at && (
                    <p className="text-xs text-blue-400">
                      Client approved on {formatDate(task.client_approved_at)}
                    </p>
                  )}

                  {/* Revision notes */}
                  {task.revision_notes && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                      <p className="text-xs font-medium text-amber-400 mb-0.5">Revision requested</p>
                      <p className="text-xs text-amber-300">{task.revision_notes}</p>
                    </div>
                  )}

                  {/* Action row */}
                  {!isAdminApproved && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700">
                      <input
                        type="text"
                        placeholder="Add a revision note…"
                        value={revisionNotes[task.id] ?? ''}
                        onChange={(e) =>
                          setRevisionNotes((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleAction(task.id, 'revision_requested')}
                        disabled={actionLoading === task.id + 'revision_requested'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === task.id + 'revision_requested' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Revision
                      </button>
                      {/* Admin can approve directly — no need to wait for client */}
                      <button
                        onClick={() => handleAction(task.id, 'admin_approve')}
                        disabled={actionLoading === task.id + 'admin_approve'}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
                          isClientApproved
                            ? 'bg-green-600 hover:bg-green-500 text-white border-green-500'
                            : 'bg-green-500/15 hover:bg-green-500/25 text-green-400 border-green-500/30'
                        }`}
                      >
                        {actionLoading === task.id + 'admin_approve' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileCheck className="h-3.5 w-3.5" />
                        )}
                        {isDesign ? 'Approve + 15 AED' : 'Approve'}
                      </button>
                    </div>
                  )}

                  {/* Approved footer */}
                  {isAdminApproved && isDesign && (
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700 text-xs text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approved on {formatDate(task.admin_approved_at)} · 15 AED credited
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
