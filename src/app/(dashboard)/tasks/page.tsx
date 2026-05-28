'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Search, Pencil, Trash2, Calendar, AlertTriangle, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Task, Client, TaskAssignee } from '@/types'

const STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done', 'overdue'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const
const TASK_TYPE_OPTIONS = [
  { value: 'reel_video', label: 'Reel / Short Video' },
  { value: 'design',     label: 'Design' },
  { value: 'ai_video',   label: 'AI Video' },
  { value: 'post',       label: 'Social Media Post' },
  { value: 'custom',     label: 'Custom / Other' },
] as const

function TaskForm({
  initial, clients, members, onSave, onCancel,
}: {
  initial?: Partial<Task>
  clients: Client[]
  members: TaskAssignee[]
  onSave: (d: Partial<Task>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    status: initial?.status ?? 'todo',
    priority: initial?.priority ?? 'medium',
    task_type: initial?.task_type ?? '',
    due_date: initial?.due_date ?? '',
    assigned_to: initial?.assigned_to ?? '',
    client_id: initial?.client_id ?? '',
  })
  const [loading, setLoading] = useState(false)
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSave(form as Partial<Task>)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Task title" required />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Task details…" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Task Type</Label>
          <Select value={form.task_type} onValueChange={(v) => set('task_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {TASK_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Client</Label>
          <Select value={form.client_id} onValueChange={(v) => set('client_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Assignee</Label>
        <Select value={form.assigned_to} onValueChange={(v) => set('assigned_to', v)}>
          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name ?? m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Due Date</Label>
        <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="text-slate-300" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial?.id ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </form>
  )
}

const statusColors: Record<string, string> = {
  todo: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  review: 'bg-amber-500/20 text-amber-400',
  done: 'bg-green-500/20 text-green-400',
  overdue: 'bg-red-500/20 text-red-400',
}

const statusFilterStyle: Record<string, string> = {
  all:         'bg-slate-700 text-slate-200 border-slate-600',
  todo:        'bg-blue-500/20 text-blue-300 border-blue-500/40',
  in_progress: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  review:      'bg-amber-500/20 text-amber-300 border-amber-500/40',
  done:        'bg-green-500/20 text-green-300 border-green-500/40',
  overdue:     'bg-red-500/20 text-red-300 border-red-500/40',
}

const statusLabel: Record<string, string> = {
  all: 'All', todo: 'To Do', in_progress: 'In Progress',
  review: 'Review', done: 'Done', overdue: 'Overdue',
}
const priorityColors: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

export default function TasksPage() {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [members, setMembers] = useState<TaskAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  async function load() {
    const [tr, cr, mr] = await Promise.all([
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/team-users').then((r) => r.json()),
    ])
    setTasks(Array.isArray(tr) ? tr : [])
    setClients(Array.isArray(cr) ? cr : [])
    setMembers(Array.isArray(mr) ? mr : [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleSave(data: Partial<Task>) {
    if (editing) {
      const res = await fetch(`/api/tasks/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Task updated', 'success'); setOpen(false); load() }
      else toast('Failed to update', 'error')
    } else {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Task created', 'success'); setOpen(false); load() }
      else toast('Failed to create', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Task deleted', 'success'); load() }
    else toast('Failed to delete', 'error')
  }

  const filtered = tasks
    .filter((t) => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus === 'all' || t.status === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      // Overdue always first
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (b.status === 'overdue' && a.status !== 'overdue') return 1
      // Then by due_date ascending (no date goes last)
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })

  const countByStatus = (s: string) => tasks.filter((t) => t.status === s).length

  return (
    <div className="space-y-5">
      {/* Top bar: search + new button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...STATUS_OPTIONS] as const).map((s) => {
          const count = s === 'all' ? tasks.length : countByStatus(s)
          const active = filterStatus === s
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                ${active
                  ? `${statusFilterStyle[s]} ring-2 ring-offset-2 ring-offset-slate-950 ring-current shadow-lg scale-105`
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300 bg-transparent'
                }`}
            >
              {statusLabel[s]}
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold
                ${active ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <p className="text-slate-400 text-sm">No tasks found.</p>
          <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> Create First Task
          </Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <Card key={task.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-slate-100 text-sm">{task.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[task.status]}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-1 ${priorityColors[task.priority]}`}>
                      {task.priority === 'urgent' && <AlertTriangle className="h-3 w-3" />}
                      {task.priority}
                    </span>
                    {task.task_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                        {TASK_TYPE_OPTIONS.find((t) => t.value === task.task_type)?.label ?? task.task_type}
                      </span>
                    )}
                  </div>
                  {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{task.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.assignee?.display_name && <span>@ {task.assignee.display_name}</span>}
                    {task.client?.name && <span>— {task.client.name}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(task); setOpen(true) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(task.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <TaskForm initial={editing ?? undefined} clients={clients} members={members} onSave={handleSave} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
