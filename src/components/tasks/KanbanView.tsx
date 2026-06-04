'use client'
import { useState } from 'react'
import { AlertTriangle, Calendar, Link2, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types'

const COLUMNS: { status: TaskStatus; label: string; header: string; dot: string }[] = [
  { status: 'todo',        label: 'To Do',       header: 'border-blue-500/40 bg-blue-500/5',    dot: 'bg-blue-400' },
  { status: 'in_progress', label: 'In Progress',  header: 'border-purple-500/40 bg-purple-500/5', dot: 'bg-purple-400' },
  { status: 'review',      label: 'Review',       header: 'border-amber-500/40 bg-amber-500/5',  dot: 'bg-amber-400' },
  { status: 'done',        label: 'Done',         header: 'border-green-500/40 bg-green-500/5',  dot: 'bg-green-400' },
  { status: 'overdue',     label: 'Overdue',      header: 'border-red-500/40 bg-red-500/5',      dot: 'bg-red-400' },
]

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-500', medium: 'text-yellow-500', high: 'text-orange-500', urgent: 'text-red-500',
}

interface Props {
  tasks: Task[]
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onTaskClick: (task: Task) => void
}

export default function KanbanView({ tasks, onStatusChange, onTaskClick }: Props) {
  const [dragging, setDragging]   = useState<string | null>(null)
  const [overCol,  setOverCol]    = useState<TaskStatus | null>(null)

  function onDragStart(e: React.DragEvent, id: string) {
    setDragging(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverCol(status)
  }

  function onDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    if (dragging) {
      const task = tasks.find(t => t.id === dragging)
      if (task && task.status !== status) onStatusChange(dragging, status)
    }
    setDragging(null)
    setOverCol(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1" style={{ minHeight: '65vh' }}>
      {COLUMNS.map(({ status, label, header, dot }) => {
        const col   = tasks.filter(t => t.status === status)
        const isOver = overCol === status

        return (
          <div
            key={status}
            className="flex flex-col gap-2 flex-shrink-0 w-[240px] md:w-[260px]"
            onDragOver={(e) => onDragOver(e, status)}
            onDrop={(e) => onDrop(e, status)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null)
            }}
          >
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${header}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-xs font-semibold text-slate-300">{label}</span>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-full">{col.length}</span>
            </div>

            {/* Cards drop zone */}
            <div className={`flex-1 flex flex-col gap-2 rounded-xl p-1 transition-all ${isOver ? 'bg-indigo-500/8 ring-1 ring-indigo-500/25 ring-dashed' : ''}`}>
              {col.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, task.id)}
                  onDragEnd={() => { setDragging(null); setOverCol(null) }}
                  onClick={() => onTaskClick(task)}
                  className={`bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-slate-600 hover:bg-slate-800 transition-all select-none ${dragging === task.id ? 'opacity-40 scale-95' : ''}`}
                >
                  <p className="text-sm font-medium text-slate-200 leading-snug mb-2">{task.title}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    {task.priority && (
                      <span className={`text-[11px] font-semibold ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority === 'urgent' && <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />}
                        {task.priority}
                      </span>
                    )}
                    {task.client?.name && (
                      <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                        {task.client.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-600">
                    <div className="flex items-center gap-2">
                      {task.assignee?.display_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          {task.assignee.display_name.split(' ')[0]}
                        </span>
                      )}
                      {task.delivery_url && <Link2 className="h-2.5 w-2.5 text-emerald-500" />}
                    </div>
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {formatDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty column placeholder */}
              {col.length === 0 && !isOver && (
                <div className="flex-1 flex items-center justify-center border border-dashed border-slate-800 rounded-xl py-8">
                  <p className="text-xs text-slate-700">Drop here</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
