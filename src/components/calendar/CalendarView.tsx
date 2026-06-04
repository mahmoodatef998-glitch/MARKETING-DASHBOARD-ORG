'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Task } from '@/types'

const STATUS_DOT: Record<string, string> = {
  todo:        'bg-slate-400',
  in_progress: 'bg-blue-400',
  review:      'bg-amber-400',
  done:        'bg-emerald-400',
  overdue:     'bg-red-400',
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function CalendarView({ tasks, showAssignee }: { tasks: Task[]; showAssignee: boolean }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const daysInMonth  = getDaysInMonth(year, month)
  const firstDow     = getFirstDayOfWeek(year, month)
  const todayStr     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Index tasks by due_date (YYYY-MM-DD)
  const byDate: Record<string, Task[]> = {}
  for (const task of tasks) {
    if (!task.due_date) continue
    const d = task.due_date.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(task)
  }

  // Build grid cells: leading blanks + day numbers
  const cells: Array<{ day: number; dateStr: string } | null> = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push({ day: d, dateStr: `${year}-${mm}-${dd}` })
  }

  const selectedTasks = selected ? (byDate[selected] ?? []) : []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          {new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-1">
          <button onClick={prevMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={nextMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-px">
        {DOW_LABELS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-800/40 rounded-xl overflow-hidden border border-slate-800">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`blank-${i}`} className="bg-slate-900/60 h-14 sm:h-16" />
          }
          const { day, dateStr } = cell
          const dayTasks  = byDate[dateStr] ?? []
          const isToday   = dateStr === todayStr
          const isSelected = dateStr === selected

          return (
            <button
              key={dateStr}
              onClick={() => setSelected(s => s === dateStr ? null : dateStr)}
              className={`relative h-14 sm:h-16 p-1.5 text-left transition-colors ${
                isSelected
                  ? 'bg-indigo-600/20 border-indigo-500/40'
                  : 'bg-slate-900/80 hover:bg-slate-800/60'
              }`}
            >
              <span className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full ${
                isToday ? 'bg-indigo-500 text-white' : 'text-slate-400'
              }`}>
                {day}
              </span>

              {dayTasks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <span
                      key={t.id}
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status] ?? 'bg-slate-400'}`}
                    />
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[9px] text-slate-500 leading-none mt-0.5">+{dayTasks.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day task list */}
      {selected && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' '}— {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
          </p>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-3 text-center">No tasks due this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[task.status] ?? 'bg-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{task.title}</p>
                    {showAssignee && task.assignee?.display_name && (
                      <p className="text-xs text-slate-500 mt-0.5">{task.assignee.display_name}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize shrink-0 ${
                    task.status === 'done'        ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    task.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                    task.status === 'review'      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {[
          { label: 'To Do',       color: 'bg-slate-400' },
          { label: 'In Progress', color: 'bg-blue-400' },
          { label: 'Review',      color: 'bg-amber-400' },
          { label: 'Done',        color: 'bg-emerald-400' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
