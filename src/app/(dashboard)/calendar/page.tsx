'use client'
import { useEffect, useState } from 'react'
import { CalendarView } from '@/components/calendar/CalendarView'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users } from 'lucide-react'
import type { Task } from '@/types'

export default function CalendarPage() {
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filterBy, setFilterBy] = useState<string>('all')

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => setTasks(Array.isArray(data) ? data : (data.data ?? [])))
      .finally(() => setLoading(false))
  }, [])

  // Build unique assignees list
  const assignees = Array.from(
    new Map(
      tasks
        .filter(t => t.assignee?.display_name)
        .map(t => [t.assigned_to!, t.assignee!.display_name!])
    ).entries()
  )

  const visibleTasks =
    filterBy === 'all'
      ? tasks
      : tasks.filter(t => t.assigned_to === filterBy)

  const overdue  = tasks.filter(t => t.status === 'overdue').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const done     = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Team Calendar</h1>
          <p className="text-sm text-slate-400 mt-0.5">All tasks across the team by due date</p>
        </div>

        {/* Assignee filter */}
        {assignees.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {assignees.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Tasks',  value: tasks.length,  color: 'text-slate-100' },
          { label: 'In Progress',  value: inProgress,    color: 'text-blue-400' },
          { label: 'Done',         value: done,          color: 'text-green-400' },
          { label: 'Overdue',      value: overdue,       color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-8  bg-slate-800/50 rounded-lg animate-pulse w-48" />
          <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
        </div>
      ) : (
        <CalendarView tasks={visibleTasks} showAssignee={filterBy === 'all'} />
      )}
    </div>
  )
}
