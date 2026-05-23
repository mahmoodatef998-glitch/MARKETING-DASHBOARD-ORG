'use client'
import { useEffect, useState, useRef } from 'react'
import { CheckSquare, MessageCircle, Clock, AlertTriangle, Send, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Task, Message } from '@/types'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [adminId, setAdminId] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState<'tasks' | 'chat'>('tasks')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      // Get my profile
      const profileRes = await fetch('/api/profile')
      const profile = await profileRes.json()
      setMyId(profile.id)

      // Get my tasks
      const tasksRes = await fetch('/api/tasks')
      const allTasks: Task[] = await tasksRes.json()
      setTasks(allTasks)

      // Get admin user id (first admin profile)
      const adminRes = await fetch('/api/admin-id')
      if (adminRes.ok) {
        const { id } = await adminRes.json()
        setAdminId(id)
        // Load messages with admin
        const msgRes = await fetch(`/api/messages?partner=${id}`)
        if (msgRes.ok) setMessages(await msgRes.json())
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done')
  const pendingTasks = tasks.filter(t => t.status !== 'done')

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
          <p className="text-xs text-slate-400 mb-1">Total Tasks</p>
          <p className="text-2xl font-bold text-white">{tasks.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">In Progress</p>
          <p className="text-2xl font-bold text-blue-400">{pendingTasks.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-400">{overdueTasks.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'tasks'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-100'
          }`}
        >
          <CheckSquare className="h-4 w-4" />
          My Tasks
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'chat'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-100'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Chat with Admin
        </button>
      </div>

      {/* Tasks Tab */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No tasks assigned yet</p>
            </div>
          )}
          {tasks.map(task => (
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

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {task.due_date && (
                    <div className={`flex items-center gap-1 text-xs ${
                      new Date(task.due_date) < new Date() && task.status !== 'done'
                        ? 'text-red-400'
                        : 'text-slate-400'
                    }`}>
                      {new Date(task.due_date) < new Date() && task.status !== 'done'
                        ? <AlertTriangle className="h-3 w-3" />
                        : <Clock className="h-3 w-3" />
                      }
                      {new Date(task.due_date).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Status selector */}
                <select
                  value={task.status}
                  onChange={e => updateStatus(task.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded-md border-0 outline-none cursor-pointer ${STATUS_COLOR[task.status]}`}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat Tab */}
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
