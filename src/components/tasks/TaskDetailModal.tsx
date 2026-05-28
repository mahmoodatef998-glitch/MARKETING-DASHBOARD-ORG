'use client'
import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import {
  Send, ExternalLink, MessageSquare, Calendar,
  User, Tag, Loader2, AlertTriangle, Link2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Task, TaskComment } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_progress: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  done:        'bg-green-500/20 text-green-400 border-green-500/30',
  overdue:     'bg-red-500/20 text-red-400 border-red-500/30',
}
const PRIORITY_COLORS: Record<string, string> = {
  low:    'text-slate-400',
  medium: 'text-yellow-400',
  high:   'text-orange-400',
  urgent: 'text-red-400',
}
const TYPE_LABELS: Record<string, string> = {
  reel_video: 'Reel / Video',
  design:     'Design',
  ai_video:   'AI Video',
  post:       'Post',
  custom:     'Custom',
}

interface Props {
  task: Task | null
  open: boolean
  onClose: () => void
}

export default function TaskDetailModal({ task, open, onClose }: Props) {
  const { toast } = useToast()
  const [comments, setComments]     = useState<TaskComment[]>([])
  const [loadingCmt, setLoadingCmt] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadComments() {
    if (!task) return
    setLoadingCmt(true)
    try {
      const res  = await fetch(`/api/tasks/${task.id}/comments`)
      const data = await res.json()
      setComments(Array.isArray(data) ? data : [])
    } finally {
      setLoadingCmt(false)
    }
  }

  useEffect(() => {
    if (open && task) loadComments()
    else { setComments([]); setNewComment('') }
  }, [open, task?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function handleSendComment() {
    if (!newComment.trim() || !task || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      })
      if (res.ok) {
        setNewComment('')
        loadComments()
      } else {
        toast('Failed to post comment', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] flex flex-col overflow-hidden p-0">
        {/* Fixed header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">{task.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${STATUS_COLORS[task.status] ?? ''}`}>
              {task.status.replace('_', ' ')}
            </span>
            <span className={`text-xs font-semibold flex items-center gap-1 ${PRIORITY_COLORS[task.priority] ?? ''}`}>
              {task.priority === 'urgent' && <AlertTriangle className="h-3 w-3" />}
              {task.priority}
            </span>
            {task.task_type && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                {TYPE_LABELS[task.task_type] ?? task.task_type}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-400">
            {task.client?.name && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-slate-600" />
                <span>{task.client.name}</span>
              </div>
            )}
            {task.assignee?.display_name && (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-600" />
                <span>{task.assignee.display_name}</span>
              </div>
            )}
            {task.due_date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-600" />
                <span>{formatDate(task.due_date)}</span>
              </div>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3 leading-relaxed">
              {task.description}
            </p>
          )}

          {task.revision_notes && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-400 mb-1">🔄 Revision Requested</p>
              <p className="text-sm text-slate-300 leading-relaxed">{task.revision_notes}</p>
            </div>
          )}

          {/* Delivery Link */}
          {task.delivery_url ? (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-400">Delivery Ready</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{task.delivery_url}</p>
              </div>
              <a
                href={task.delivery_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            </div>
          ) : task.status === 'done' && (
            <div className="border border-dashed border-slate-700 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">No delivery link added yet</p>
            </div>
          )}

          {/* Comments */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments {comments.length > 0 && `(${comments.length})`}
            </h4>

            {loadingCmt ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">No comments yet</p>
            ) : (
              <div className="space-y-2.5">
                {comments.map((c) => (
                  <div key={c.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-600/40 flex items-center justify-center text-[9px] font-bold text-indigo-300">
                          {(c.author_name ?? 'T').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-slate-300">
                          {c.author_name ?? 'Team Member'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-600">
                        {new Date(c.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Fixed comment input */}
        <div className="px-6 pb-5 pt-3 border-t border-slate-800 shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment… (Ctrl+Enter to send)"
              rows={2}
              className="text-sm resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendComment()
              }}
            />
            <Button
              onClick={handleSendComment}
              disabled={submitting || !newComment.trim()}
              className="h-auto w-10 shrink-0 self-end"
              size="icon"
            >
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
