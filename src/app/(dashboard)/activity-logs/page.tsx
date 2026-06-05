'use client'
import { useEffect, useState, useCallback } from 'react'
import { Activity, Filter, RefreshCw, User, FileText, CheckSquare, Users, CreditCard, Loader2 } from 'lucide-react'

interface ActivityLog {
  id: string
  user_id: string | null
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

const ENTITY_ICON: Record<string, React.ReactNode> = {
  task:    <CheckSquare className="h-3.5 w-3.5" />,
  client:  <Users className="h-3.5 w-3.5" />,
  invoice: <CreditCard className="h-3.5 w-3.5" />,
  team:    <User className="h-3.5 w-3.5" />,
}

const ACTION_COLOR: Record<string, string> = {
  created:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  updated:       'bg-blue-500/15 text-blue-400 border-blue-500/20',
  deleted:       'bg-red-500/15 text-red-400 border-red-500/20',
  status_changed:'bg-amber-500/15 text-amber-400 border-amber-500/20',
  approved:      'bg-green-500/15 text-green-400 border-green-500/20',
  revised:       'bg-orange-500/15 text-orange-400 border-orange-500/20',
  paid:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  sent:          'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  added:         'bg-purple-500/15 text-purple-400 border-purple-500/20',
  removed:       'bg-red-500/15 text-red-400 border-red-500/20',
  rated:         'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
}

function actionColor(action: string) {
  const key = action.split('.')[1] ?? action
  return ACTION_COLOR[key] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/20'
}

function actionLabel(action: string) {
  return action.replace('.', ' ').replace(/_/g, ' ')
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const ENTITY_TYPES = ['', 'task', 'client', 'invoice', 'team']

export default function ActivityLogsPage() {
  const [logs,        setLogs]       = useState<ActivityLog[]>([])
  const [loading,     setLoading]    = useState(true)
  const [entityFilter, setFilter]   = useState('')
  const [expanded,    setExpanded]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (entityFilter) params.set('entity_type', entityFilter)
    const res = await fetch(`/api/activity-logs?${params}`)
    if (res.ok) setLogs(await res.json())
    setLoading(false)
  }, [entityFilter])

  useEffect(() => { void load() }, [load])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400" />
            Activity Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">All changes made in the system</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-500" />
        <div className="flex gap-2 flex-wrap">
          {ENTITY_TYPES.map(type => (
            <button key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                entityFilter === type
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                  : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200'
              }`}>
              {type || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <Activity className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No activity recorded yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-800" />

          <div className="space-y-1">
            {logs.map(log => {
              const isOpen = expanded === log.id
              const hasDetails = log.old_value || log.new_value

              return (
                <div key={log.id} className="relative flex gap-4 group">
                  {/* Dot */}
                  <div className="relative z-10 flex-shrink-0 w-10 flex items-start pt-3.5 justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700 border-2 border-slate-600 group-hover:border-indigo-500 transition-colors" />
                  </div>

                  {/* Card */}
                  <div className={`flex-1 mb-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-colors hover:border-slate-700 ${isOpen ? 'border-slate-700' : ''}`}>
                    <button
                      className="w-full text-left px-4 py-3 flex items-start gap-3"
                      onClick={() => hasDetails && setExpanded(isOpen ? null : log.id)}
                    >
                      {/* Entity icon */}
                      <div className="mt-0.5 text-slate-500">
                        {ENTITY_ICON[log.entity_type] ?? <FileText className="h-3.5 w-3.5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${actionColor(log.action)}`}>
                            {actionLabel(log.action)}
                          </span>
                          {log.entity_name && (
                            <span className="text-xs text-slate-300 font-medium truncate">{log.entity_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">
                            {log.user_name ?? 'System'}
                          </span>
                          <span className="text-slate-700">·</span>
                          <span className="text-xs text-slate-600">{relativeTime(log.created_at)}</span>
                        </div>
                      </div>

                      {hasDetails && (
                        <span className="text-xs text-slate-600 hover:text-slate-400 transition-colors shrink-0 mt-0.5">
                          {isOpen ? 'Hide' : 'Details'}
                        </span>
                      )}
                    </button>

                    {isOpen && hasDetails && (
                      <div className="px-4 pb-3 border-t border-slate-800 pt-3 grid grid-cols-2 gap-3">
                        {log.old_value && (
                          <div>
                            <p className="text-[11px] text-slate-500 font-semibold mb-1.5">Before</p>
                            <pre className="text-[11px] text-slate-400 bg-slate-800/60 rounded-lg p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                              {JSON.stringify(log.old_value, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.new_value && (
                          <div>
                            <p className="text-[11px] text-slate-500 font-semibold mb-1.5">After</p>
                            <pre className="text-[11px] text-slate-400 bg-slate-800/60 rounded-lg p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                              {JSON.stringify(log.new_value, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
