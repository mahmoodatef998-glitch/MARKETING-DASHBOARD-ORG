'use client'
import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react'
import type { Task } from '@/types'

const WEEK_DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

const STATUS_BORDER: Record<string, string> = {
  overdue:     'border-l-2 border-red-500',
  in_progress: 'border-l-2 border-indigo-400',
  review:      'border-l-2 border-yellow-400',
  done:        'opacity-50',
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── Day Detail Modal ───────────────────────────────────────────────────────────
function DayModal({
  dateStr,
  tasks,
  showAssignee,
  onClose,
}: {
  dateStr: string
  tasks: Task[]
  showAssignee: boolean
  onClose: () => void
}) {
  // Close on Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Prevent scroll on body while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet / Modal */}
      <div
        className={[
          'relative z-10 w-full bg-slate-900 border border-slate-700',
          'rounded-t-2xl sm:rounded-2xl shadow-2xl',
          'sm:max-w-lg sm:mx-4',
          'max-h-[85vh] flex flex-col',
          'animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200',
        ].join(' ')}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          {/* Drag handle for mobile */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-700 sm:hidden" />

          <CalendarDays className="h-5 w-5 text-violet-400 shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-100 text-sm leading-tight">{label}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Task list — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tasks.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-700" />
              <p className="text-slate-500 text-sm">No tasks due on this day</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className={[
                    'flex items-start gap-3 p-4 rounded-xl bg-slate-800/60',
                    STATUS_BORDER[task.status] ?? '',
                  ].join(' ')}
                >
                  <span
                    className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-slate-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-slate-100 text-sm leading-snug ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Badges row */}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_PILL[task.priority] ?? 'bg-slate-700 text-slate-300'}`}>
                        {task.priority}
                      </span>
                      <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
                        {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                      {task.task_type && (
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full capitalize">
                          {task.task_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>

                    {/* Assignee (admin view) */}
                    {showAssignee && task.assignee?.display_name && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-indigo-600/40 flex items-center justify-center text-indigo-300 text-[9px] font-bold shrink-0">
                          {task.assignee.display_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-indigo-400 font-medium">
                          {task.assignee.display_name}
                        </span>
                      </div>
                    )}

                    {/* Client */}
                    {task.client && (task.client as { name?: string }).name && (
                      <p className="mt-1 text-xs text-slate-500">
                        Client: {(task.client as { name: string }).name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Calendar View ──────────────────────────────────────────────────────────────
export function CalendarView({
  tasks,
  showAssignee = false,
}: {
  tasks: Task[]
  showAssignee?: boolean
}) {
  const today    = new Date()
  const todayKey = today.toISOString().slice(0, 10)

  const [year,      setYear]      = useState(today.getFullYear())
  const [month,     setMonth]     = useState(today.getMonth())
  const [modalKey,  setModalKey]  = useState<string | null>(null)

  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
  }
  function goToday() {
    setMonth(today.getMonth())
    setYear(today.getFullYear())
    setModalKey(todayKey)
  }

  /* Group tasks by date */
  const tasksByDate: Record<string, Task[]> = {}
  for (const t of tasks) {
    if (!t.due_date) continue
    const k = t.due_date.slice(0, 10)
    ;(tasksByDate[k] ??= []).push(t)
  }

  /* Build grid */
  const startPad  = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  /* Month stats */
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthTasks  = tasks.filter(t => t.due_date?.startsWith(monthPrefix))
  const doneCnt     = monthTasks.filter(t => t.status === 'done').length
  const overdueCnt  = monthTasks.filter(t =>
    t.status === 'overdue' || (t.due_date && t.due_date.slice(0, 10) < todayKey && t.status !== 'done')
  ).length

  const modalTasks = modalKey ? (tasksByDate[modalKey] ?? []) : []

  return (
    <>
      <div className="space-y-4">

        {/* Stats strip */}
        <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
          <span>{monthTasks.length} tasks this month</span>
          <span className="text-green-400">{doneCnt} done</span>
          {overdueCnt > 0 && <span className="text-red-400">{overdueCnt} overdue</span>}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">{MONTH_NAMES[month]} {year}</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={prev}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">
              Today
            </button>
            <button onClick={next}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Grid */}
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
              const isPast     = key ? key < todayKey : false
              const hasOverdue = dayTasks.some(t =>
                t.status === 'overdue' ||
                (t.due_date && t.due_date.slice(0, 10) < todayKey && t.status !== 'done')
              )
              const hasTasks   = dayTasks.length > 0

              return (
                <div
                  key={idx}
                  onClick={() => day && setModalKey(key)}
                  className={[
                    'min-h-[80px] sm:min-h-[96px] p-1 sm:p-1.5',
                    'border-b border-r border-slate-800/40 transition-colors',
                    day  ? 'cursor-pointer hover:bg-slate-800/40 active:bg-slate-800/60' : 'bg-slate-950/20',
                    isPast && !isToday ? 'opacity-60' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {day && (
                    <>
                      {/* Day number row */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={[
                          'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                          isToday ? 'bg-violet-600 text-white' : 'text-slate-400',
                        ].join(' ')}>
                          {day}
                        </span>
                        {hasOverdue && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        )}
                      </div>

                      {/* Task pills — desktop shows text, mobile shows dots */}
                      <div className="hidden sm:block space-y-0.5">
                        {dayTasks.slice(0, 2).map(t => (
                          <div
                            key={t.id}
                            className={[
                              'text-xs px-1.5 py-0.5 rounded truncate leading-tight',
                              PRIORITY_PILL[t.priority] ?? 'bg-slate-700 text-slate-200',
                              t.status === 'done' ? 'opacity-40' : '',
                            ].join(' ')}
                          >
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 2 && (
                          <p className="text-xs text-slate-500 px-1">+{dayTasks.length - 2} more</p>
                        )}
                      </div>

                      {/* Mobile: colored dots instead of text pills */}
                      {hasTasks && (
                        <div className="flex sm:hidden flex-wrap gap-0.5 mt-1">
                          {dayTasks.slice(0, 4).map(t => (
                            <span
                              key={t.id}
                              className={`w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-slate-500'}`}
                            />
                          ))}
                          {dayTasks.length > 4 && (
                            <span className="text-[9px] text-slate-500 leading-none self-center">+{dayTasks.length - 4}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {(['urgent','high','medium','low'] as const).map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${PRIORITY_PILL[p].split(' ')[0]}`} />
              <span className="text-xs text-slate-500 capitalize">{p}</span>
            </div>
          ))}
          <span className="text-xs text-slate-600 ml-2">Tap any day to see details</span>
        </div>

      </div>

      {/* Day detail modal */}
      {modalKey && (
        <DayModal
          dateStr={modalKey}
          tasks={modalTasks}
          showAssignee={showAssignee}
          onClose={() => setModalKey(null)}
        />
      )}
    </>
  )
}
