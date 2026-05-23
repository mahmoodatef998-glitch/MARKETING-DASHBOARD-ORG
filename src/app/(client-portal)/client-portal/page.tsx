'use client'
import { useEffect, useState } from 'react'
import { CheckSquare, Clock, AlertTriangle, Loader2, FileText } from 'lucide-react'
import type { Task, Invoice } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo:        { label: 'To Do',       color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  done:        { label: 'Done',         color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  overdue:     { label: 'Overdue',      color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft:   { label: 'Draft',   color: 'bg-slate-500/10 text-slate-400' },
  sent:    { label: 'Sent',    color: 'bg-blue-500/10 text-blue-400' },
  paid:    { label: 'Paid',    color: 'bg-green-500/10 text-green-400' },
  overdue: { label: 'Overdue', color: 'bg-red-500/10 text-red-400' },
}

export default function ClientPortalPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tasks' | 'invoices'>('tasks')

  useEffect(() => {
    async function load() {
      const [tasksRes, invoicesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/invoices'),
      ])
      const td = await tasksRes.json(); setTasks(Array.isArray(td) ? td : [])
      const id = await invoicesRes.json(); setInvoices(Array.isArray(id) ? id : [])
      setLoading(false)
    }
    load()
  }, [])

  const doneTasks = tasks.filter(t => t.status === 'done').length
  const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Welcome to your portal 👋</h2>
        <p className="text-slate-400 text-sm">Track your project tasks and invoices in one place.</p>
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Project Progress</p>
            <p className="text-sm font-bold text-white">{progress}%</p>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">{doneTasks} of {tasks.length} tasks completed</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'tasks' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
          }`}
        >
          <CheckSquare className="h-4 w-4" /> Tasks
        </button>
        <button
          onClick={() => setTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'invoices' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
          }`}
        >
          <FileText className="h-4 w-4" /> Invoices
        </button>
      </div>

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No tasks yet</p>
            </div>
          )}
          {tasks.map(task => {
            const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
            return (
              <div key={task.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white">{task.title}</h3>
                    {task.description && (
                      <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                {task.due_date && (
                  <div className={`flex items-center gap-1 text-xs mt-3 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                    {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    Due: {new Date(task.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Invoices */}
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
                  <p className="text-xs text-slate-400 mt-1">
                    Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                  </p>
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
    </div>
  )
}
