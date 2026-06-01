'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { Task } from '@/types'

const WEEK_DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-red-500/80    text-white',
  high:   'bg-orange-500/80 text-white',
  medium: 'bg-yellow-500/70 text-white',
  low:    'bg-slate-600     text-slate-200',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-500',
  medium: 'bg-yellow-400',
  low:    'bg-slate-500',
}

const STATUS_LABEL: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  review:      'Review',
  done:        'Done',
  overdue:     'Overdue',
}

// Returns 'YYYY-MM-DD' for the given year/month/day
function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarView({
  tasks,
  showAssignee = false,
}: {
  tasks: Task[]
  showAssignee?: boolean
}) {
  const today     = new Date()
  const todayKey  = today.toISOString().slice(0, 10)

  const [year,        setYear]        = useState(today.getFullYear())
  const [month,       setMonth]       = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  /* ── Navigation ─────────────────────────────────────────────── */
  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedKey(null)
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedKey(null)
  }
  function goToday() {
    setMonth(today.getMonth())
    setYear(today.getFullYear())
    setSelectedKey(todayKey)
  }

  /* ── Group tasks by due_date ─────────────────────────────────── */
  const tasksByDate: Record<string, Task[]> = {}
  for (const t of tasks) {
    if (!t.due_date) continue
    const k = t.due_date.slice(0, 10)
    ;(tasksByDate[k] ??= []).push(t)
  }

  /* ── Build grid cells ────────────────────────────────────────── */
  const startPad = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedTasks = selectedKey ? (tasksByDate[selectedKey] ?? []) : []

  /* ── Stats for current month ─────────────────────────────────── */
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthTasks  = tasks.filter(t => t.due_date?.startsWith(monthPrefix))
  const doneCnt     = monthTasks.filter(t => t.status === 'done').length
  const overdueCnt  = monthTasks.filter(t => t.status === 'overdue' || (
    t.due_date && t.due_date.slice(0,10) < todayKey && t.status !== 'done'
  )).length

  return (
    <div className="space-y-4">

      {/* ── Month stats strip ──────────────────────────────────── */}
      <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
        <span>{monthTasks.length} tasks this month</span>
        <span className="text-green-400">{doneCnt} done</span>
        {overdueCnt > 0 && <span className="text-red-400">{overdueCnt} overdue</span>}
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={prev}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Today
          </button>
          <button
            onClick={next}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────── */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">

        {/* Day headers */}
        <div className="grid grid-cols-7 bg-slate-900/80 border-b border-slate-800">
          {WEEK_DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const key        = day ? dateKey(year, month, day) : null
            const dayTasks   = key ? (tasksByDate[key] ?? []) : []
            const isToday    = key === todayKey
            const isSelected = key === selectedKey
            const isPast     = key ? key < todayKey : false
            const hasOverdue = dayTasks.some(t =>
              t.status === 'overdue' || (t.due_date && t.due_date.slice(0,10) < todayKey && t.status !== 'done')
            )

            return (
              <div
                key={idx}
                onClick={() => day && setSelectedKey(isSelected ? null : key)}
                className={[
                  'min-h-[90px] p-1.5 border-b border-r border-slate-800/40 transition-colors',
                  day ? 'cursor-pointer hover:bg-slate-800/40' : 'bg-slate-950/20',
                  isSelected ? 'bg-violet-950/30 ring-1 ring-inset ring-violet-500/30' : '',
                  isPast && !isToday ? 'opacity-60' : '',
                ].filter(Boolean).join(' ')}
              >
                {day && (
                  <>
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={[
                        'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                        isToday    ? 'bg-violet-600 text-white' :
                        isSelected ? 'text-violet-400' :
                        'text-slate-400',
                      ].join(' ')}>
                        {day}
                      </span>
                      {hasOverdue && !isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                    </div>

                    {/* Task pills */}
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map(t => (
                        <div
                          key={t.id}
                          title={`${t.title}${showAssignee && t.assignee?.display_name ? ` — ${t.assignee.display_name}` : ''}`}
                          className={[
                            'text-xs px-1.5 py-0.5 rounded truncate leading-tight',
                            PRIORITY_PILL[t.priority] ?? 'bg-slate-700 text-slate-200',
                            t.status === 'done' ? 'opacity-40' : '',
                          ].join(' ')}
                        >
                          {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-xs text-slate-500 px-1">+{dayTasks.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        {(['urgent','high','medium','low'] as const).map(p => (
          <div key={p} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${PRIORITY_PILL[p].split(' ')[0]}`} />
            <span className="text-xs text-slate-500 capitalize">{p}</span>
          </div>
        ))}
      </div>

      {/* ── Selected day panel ──────────────────────────────────── */}
      {selectedKey && (
        <div className="border border-slate-800 rounded-xl bg-slate-900/50 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-slate-900">
            <CalendarDays className="h-4 w-4 text-violet-400" />
            <h3 className="font-semibold text-slate-100 text-sm">
              {new Date(selectedKey + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </h3>
            <span className="ml-auto text-xs text-slate-500">
              {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Task list */}
          <div className="p-3">
            {selectedTasks.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No tasks due on this day</p>
            ) : (
              <div className="space-y-2">
                {selectedTasks.map(task => (
                  <div
                    key={task.id}
                    className={[
                      'flex items-start gap-3 p-3 rounded-lg bg-slate-800/60',
                      task.status === 'done'    ? 'opacity-50' :
                      task.status === 'overdue' ? 'border-l-2 border-red-500' :
                      task.status === 'in_progress' ? 'border-l-2 border-indigo-400' :
                      task.status === 'review'  ? 'border-l-2 border-yellow-400' : '',
                    ].join(' ')}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-100 ${task.status === 'done' ? 'line-through' : ''}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_PILL[task.priority] ?? 'bg-slate-700 text-slate-300'}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-slate-500">
                          {STATUS_LABEL[task.status] ?? task.status}
                        </span>
                        {task.task_type && (
                          <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                            {task.task_type.replace('_', ' ')}
                          </span>
                        )}
                        {showAssignee && task.assignee?.display_name && (
                          <span className="ml-auto text-xs text-indigo-400 font-medium">
                            {task.assignee.display_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
