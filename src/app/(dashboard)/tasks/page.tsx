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
import { Plus, Search, Pencil, Trash2, Calendar, AlertTriangle, Loader2, ExternalLink, MessageSquare, Upload, UploadCloud } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import TaskDetailModal from '@/components/tasks/TaskDetailModal'
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
    delivery_url: initial?.delivery_url ?? '',
  })
  const [loading, setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadPct(0)
    try {
      // Get presigned URL
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Storage not configured')
      const { uploadUrl, fileUrl } = await presignRes.json()

      // Upload directly to R2 using XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Upload network error'))
        xhr.send(file)
      })

      set('delivery_url', fileUrl)
      setUploadPct(100)
    } catch (err: any) {
      alert(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

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
      <div className="space-y-2">
        <Label>Delivery <span className="text-slate-500 font-normal text-xs">(paste link or upload file)</span></Label>
        <div className="flex gap-2">
          <Input
            value={form.delivery_url}
            onChange={(e) => set('delivery_url', e.target.value)}
            placeholder="https://drive.google.com/… or upload →"
            type="url"
            className="flex-1"
          />
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0 ${
            uploading ? 'bg-slate-700 text-slate-400' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            {uploading ? `${uploadPct}%` : 'Upload'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
        {form.delivery_url && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            <a href={form.delivery_url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[300px]">
              {form.delivery_url}
            </a>
          </p>
        )}
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
  todo:        'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  review:      'bg-amber-500/20 text-amber-400',
  done:        'bg-green-500/20 text-green-400',
  overdue:     'bg-red-500/20 text-red-400',
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
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  async function load() {
    try {
      const [tr, cr, mr] = await Promise.all([
        fetch('/api/tasks?limit=200').then((r) => r.json()),
        fetch('/api/clients?page=all').then((r) => r.json()),
        fetch('/api/team-users').then((r) => r.json()),
      ])
      setTasks(Array.isArray(tr) ? tr : (tr.data ?? []))
      setClients(Array.isArray(cr) ? cr : (cr.data ?? []))
      setMembers(Array.isArray(mr) ? mr : [])
    } catch {
      // keep empty arrays — page shows "no tasks" instead of spinning forever
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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

  const filtered = tasks.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || t.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      <div className="flex gap-4 text-sm text-slate-400 flex-wrap">
        <span>{tasks.length} total</span>
        {STATUS_OPTIONS.map((s) => (
          <span key={s} className={statusColors[s].split(' ')[1]}>
            {tasks.filter((t) => t.status === s).length} {s.replace('_', ' ')}
          </span>
        ))}
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
            <Card
              key={task.id}
              className="hover:border-slate-600 transition-colors cursor-pointer"
              onClick={() => setDetailTask(task)}
            >
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
                    {task.delivery_url && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> Delivery
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
                    <span className="flex items-center gap-1 text-slate-600">
                      <MessageSquare className="h-3 w-3" /> Comments
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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

      <TaskDetailModal
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
      />
    </div>
  )
}
