'use client'
import { X, Clock, AlertTriangle, ExternalLink, User, Tag, Image } from 'lucide-react'
import type { Task } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo:        { label: 'To Do',       color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  review:      { label: 'In Review',   color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  done:        { label: 'Done',        color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  overdue:     { label: 'Overdue',     color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-slate-400' },
  medium: { label: 'Medium', color: 'text-blue-400' },
  high:   { label: 'High',   color: 'text-amber-400' },
  urgent: { label: 'Urgent', color: 'text-red-400' },
}

export default function TaskDetailModal({
  task,
  open,
  onClose,
}: {
  task: Task | null
  open: boolean
  onClose: () => void
}) {
  if (!open || !task) return null

  const status   = STATUS_CONFIG[task.status]   ?? STATUS_CONFIG.todo
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${status.color}`}>{status.label}</span>
            <span className={`text-xs font-semibold ${priority.color}`}>{priority.label} priority</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Title + description */}
          <div>
            <h2 className="text-lg font-bold text-white leading-snug">{task.title}</h2>
            {task.description && (
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">{task.description}</p>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 text-sm">
            {task.due_date && (
              <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                {isOverdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            {task.task_type && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Tag className="h-3.5 w-3.5" />
                <span className="capitalize">{task.task_type.replace(/_/g, ' ')}</span>
              </div>
            )}
            {task.assignee && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <User className="h-3.5 w-3.5" />
                <span>{task.assignee.display_name ?? 'Assigned'}</span>
              </div>
            )}
          </div>

          {/* Reference image */}
          {task.reference_image_url && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Image className="h-3.5 w-3.5" /> Reference Image
              </p>
              <div className="rounded-xl overflow-hidden border border-slate-700/60 bg-slate-800/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={task.reference_image_url}
                  alt="Reference"
                  className="w-full max-h-64 object-contain"
                />
              </div>
            </div>
          )}

          {/* Delivery URL */}
          {task.delivery_url && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Delivery</p>
              <a
                href={task.delivery_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 hover:border-indigo-500/40 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5">Delivered file</p>
                  <p className="text-sm text-slate-200 truncate group-hover:text-indigo-300 transition-colors">{task.delivery_url}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
              </a>
            </div>
          )}

          {/* Revision notes */}
          {task.revision_notes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Revision Request</p>
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-200 leading-relaxed">{task.revision_notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
