'use client'
import { useEffect, useState, useRef } from 'react'
import { CheckSquare, MessageCircle, CalendarDays, Clock, AlertTriangle, Send, Loader2, Search, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { CalendarView } from '@/components/calendar/CalendarView'
import { getSupabaseClient } from '@/lib/supabase'
import type { Task, Message } from '@/types'

// ── Task filter component ──────────────────────────────────────────────────────
function TaskFilter({ tasks, render }: { tasks: Task[]; render: (filtered: Task[]) => React.ReactNode }) {
  const [search,   setSearch]   = useState('')
  const [priority, setPriority] = useState('all')
  const [status,   setStatus]   = useState('all')

  const filtered = tasks.filter(t => {
    const matchSearch   = !search   || t.title.toLowerCase().includes(search.toLowerCase())
    const matchPriority = priority === 'all' || t.priority === priority
    const matchStatus   = status   === 'all' || t.status   === status
    return matchSearch && matchPriority && matchStatus
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="text-xs px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 outline-none cursor-pointer">
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-xs px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 outline-none cursor-pointer">
          <option value="all">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="overdue">Overdue</option>
          <option value="done">Done</option>
        </select>
        {(search || priority !== 'all' || status !== 'all') && (
          <button onClick={() => { setSearch(''); setPriority('all'); setStatus('all') }}
            className="text-xs px-2 py-1.5 text-slate-400 hover:text-slate-200 transition-colors">
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">{filtered.length} of {tasks.length} tasks</p>
      {render(filtered)}
    </div>
  )
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
  high:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const STATUS_COLOR: Record<string, string> = {
  todo:        'bg-slate-500/10 text-slate-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  done:        'bg-green-500/10 text-green-400',
  overdue:     'bg-red-500/10 text-red-400',
}

export default function TeamPortalPage() {
  const [tasks,          setTasks]          = useState<Task[]>([])
  const [messages,       setMessages]       = useState<Message[]>([])
  const [newMsg,         setNewMsg]         = useState('')
  const [adminId,        setAdminId]        = useState<string | null>(null)
  const [myId,           setMyId]           = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [sending,        setSending]        = useState(false)
  const [tab,            setTab]            = useState<'tasks' | 'calendar' | 'chat'>('tasks')
  const [online,         setOnline]         = useState(false)
  const [completedOpen,  setCompletedOpen]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const profileRes = await fetch('/api/profile')
      const profile    = await profileRes.json()
      setMyId(profile.id)

      const tasksRes  = await fetch('/api/tasks?limit=200')
      const tasksData = await tasksRes.json()
      setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.data ?? []))

      const adminRes = await fetch('/api/admin-id')
      if (adminRes.ok) {
        const { id } = await adminRes.json()
        setAdminId(id)
        const msgRes = await fetch(`/api/messages?partner=${id}`)
        if (msgRes.ok) setMessages(await msgRes.json())
      }
      setLoading(false)
    }
    load()
  }, [])

  // Real-time: subscribe to new incoming messages
  useEffect(() => {
    if (!myId) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`messages:${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        }
      )
      .subscribe((status) => setOnline(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [myId])

  useEffect(() => {
    if (tab === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMsg.trim() || !adminId) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiver_id: adminId, content: newMsg.trim() }),
    })
    if (res.ok) {
      const msg = await res.json()
      setMessages(prev => [...prev, msg])
      setNewMsg('')
    }
    setSending(false)
  }

  async function updateStatus(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as Task['status'] } : t))
  }

  const activeTasks  = tasks.filter(t => t.status !== 'done')
  const doneTasks    = tasks.filter(t => t.status === 'done')
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Active</p>
          <p className="text-2xl font-bold text-white">{activeTasks.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-400">{doneTasks.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-400">{overdueTasks.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { key: 'tasks',    label: 'My Tasks',        icon: CheckSquare },
          { key: 'calendar', label: 'My Calendar',     icon: CalendarDays },
          { key: 'chat',     label: 'Chat with Admin', icon: MessageCircle },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === 'chat' && (
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-slate-600'}`} title={online ? 'Live' : 'Connecting…'} />
            )}
          </button>
        ))}
      </div>

      {/* ── My Tasks Tab ──────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="space-y-3">

          {/* Active tasks */}
          {activeTasks.length > 0 ? (
            <TaskFilter tasks={activeTasks} render={(filtered) => (
              <>
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">No tasks match your filters.</div>
                )}
                {filtered.map(task => (
                  <div key={task.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-white">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${PRIORITY_COLOR[task.priority] ?? ''}`}>
                        {task.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {task.due_date && (
                          <div className={`flex items-center gap-1 text-xs ${
                            new Date(task.due_date) < new Date()
                              ? 'text-red-400' : 'text-slate-400'
                          }`}>
                            {new Date(task.due_date) < new Date()
                              ? <AlertTriangle className="h-3 w-3" />
                              : <Clock className="h-3 w-3" />}
                            {new Date(task.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Status dropdown — no "Done" option here */}
                        <select
                          value={task.status}
                          onChange={e => updateStatus(task.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-md border-0 outline-none cursor-pointer ${STATUS_COLOR[task.status]}`}
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="review">Review</option>
                        </select>

                        {/* Dedicated Done button */}
                        <button
                          onClick={() => updateStatus(task.id, 'done')}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 font-medium transition-colors border border-green-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )} />
          ) : doneTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No tasks assigned yet</p>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/50" />
              All tasks completed! 🎉
            </div>
          )}

          {/* Completed section */}
          {doneTasks.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => setCompletedOpen(o => !o)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 py-1.5 w-full transition-colors"
              >
                {completedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60" />
                <span className="font-medium">{doneTasks.length} completed task{doneTasks.length > 1 ? 's' : ''}</span>
              </button>

              {completedOpen && (
                <div className="space-y-2 mt-2">
                  {doneTasks.map(task => (
                    <div key={task.id} className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 opacity-75">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-300 line-through truncate">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{task.description}</p>
                            )}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border shrink-0 ${PRIORITY_COLOR[task.priority] ?? ''}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.client_rating && (
                        <p className="mt-2 text-xs text-amber-400 pl-6">
                          {'★'.repeat(task.client_rating)}{'☆'.repeat(5 - task.client_rating)} Client rating
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── My Calendar Tab ───────────────────────────────────────── */}
      {tab === 'calendar' && (
        <CalendarView tasks={tasks} showAssignee={false} />
      )}

      {/* ── Chat Tab ──────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[500px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No messages yet. Say hello! 👋
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_id === myId ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                  msg.sender_id === myId
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-100 rounded-bl-none'
                }`}>
                  {msg.content}
                  <p className="text-xs opacity-60 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t border-slate-800 flex gap-2">
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-slate-500 border border-slate-700 focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              disabled={sending || !newMsg.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
