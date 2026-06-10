'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import SchedulePublishPanel from '@/components/tasks/SchedulePublishPanel'
import { Plus, Search, Pencil, Trash2, Calendar, AlertTriangle, Loader2, Download, CheckSquare, Square, X, ImagePlus, ExternalLink, ChevronUp, ChevronDown, CheckCircle2, Filter } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { getSupabaseClient } from '@/lib/supabase'
import type { Task, Client, TaskAssignee } from '@/types'

function sortByDue(a: Task, b: Task) {
  if (!a.due_date && !b.due_date) return 0
  if (!a.due_date) return 1
  if (!b.due_date) return -1
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
}

const STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done', 'overdue'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const
const TASK_TYPE_OPTIONS = [
  { value: 'reel_video', label: 'Reel / Short Video' },
  { value: 'design',     label: 'Design' },
  { value: 'ai_video',   label: 'AI Video' },
  { value: 'post',       label: 'Social Media Post' },
  { value: 'custom',     label: 'Custom / Other' },
] as const

function ImageUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Presign failed')
      }
      const data = await presignRes.json()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', data.apiKey)
      formData.append('timestamp', String(data.timestamp))
      formData.append('signature', data.signature)
      formData.append('public_id', data.publicId)
      if (data.eager) formData.append('eager', data.eager)
      const uploadRes = await fetch(data.uploadUrl, { method: 'POST', body: formData })
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}))
        throw new Error(errBody?.error?.message ?? 'Cloudinary upload failed')
      }
      const uploaded = await uploadRes.json()
      onChange(uploaded.secure_url ?? data.publicUrl)
    } catch (err) {
      console.error('Image upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Upload failed — check Cloudinary credentials')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <ImagePlus className="h-3.5 w-3.5 text-slate-400" /> Reference Image
      </Label>
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
          <img src={value} alt="Reference" className="w-full max-h-48 object-contain" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </a>
            <button type="button" onClick={() => onChange('')}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 disabled:opacity-60 rounded-xl py-6 flex flex-col items-center gap-2 text-slate-500 hover:text-slate-300 transition-all">
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            : <ImagePlus className="h-6 w-6" />}
          <span className="text-xs">{uploading ? 'Uploading…' : 'Click to upload reference image'}</span>
          <span className="text-[11px] text-slate-600">PNG, JPG, WebP up to 10 MB</span>
        </button>
      )}
      {uploadError && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {uploadError}
        </p>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
    </div>
  )
}

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
    title:                initial?.title                ?? '',
    description:          initial?.description          ?? '',
    status:               initial?.status               ?? 'todo',
    priority:             initial?.priority             ?? 'medium',
    task_type:            initial?.task_type            ?? '',
    due_date:             initial?.due_date             ?? '',
    assigned_to:          initial?.assigned_to          ?? '',
    client_id:            initial?.client_id            ?? '',
    delivery_url:         initial?.delivery_url         ?? '',
    reference_image_url:  initial?.reference_image_url  ?? '',
    scheduled_publish_at: initial?.scheduled_publish_at
      ? initial.scheduled_publish_at.slice(0, 16) // strip seconds for datetime-local
      : '',
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
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
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
          <Select value={form.client_id || undefined} onValueChange={(v) => set('client_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {clients.filter(c => c.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Assignee</Label>
        <Select value={form.assigned_to || undefined} onValueChange={(v) => set('assigned_to', v)}>
          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
          <SelectContent>
            {members.filter(m => m.id).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name ?? m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="text-slate-300" />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" /> Publish Date
          </Label>
          <Input
            type="datetime-local"
            value={form.scheduled_publish_at}
            onChange={(e) => set('scheduled_publish_at', e.target.value)}
            className="text-slate-300"
          />
        </div>
      </div>

      {/* Reference image */}
      <ImageUpload value={form.reference_image_url} onChange={(url) => set('reference_image_url', url)} />

      {/* Delivery URL */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5 text-slate-400" /> Delivery Link
        </Label>
        <Input value={form.delivery_url} onChange={(e) => set('delivery_url', e.target.value)}
          placeholder="https://drive.google.com/…" className="text-slate-300" />
      </div>

      {/* Schedule publishing — only available when editing (task already has an ID) */}
      {initial?.id && (
        <div className="border-t border-slate-800 pt-4">
          <SchedulePublishPanel taskId={initial.id} hasDelivery={!!form.delivery_url} />
        </div>
      )}

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
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [members, setMembers] = useState<TaskAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [search,          setSearch]          = useState('')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterAssignee,  setFilterAssignee]  = useState('all')
  const [filterClient,    setFilterClient]    = useState('all')
  const [filterDue,       setFilterDue]       = useState('any')
  const [filterDateFrom,  setFilterDateFrom]  = useState('')
  const [filterDateTo,    setFilterDateTo]    = useState('')
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [open,          setOpen]          = useState(false)
  const [editing,       setEditing]       = useState<Task | null>(null)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [userRole,      setUserRole]      = useState<string>('')
  const [guardReady,    setGuardReady]    = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      const role = p?.role ?? ''
      if (role === 'client') { router.replace('/client-portal'); return }
      if (['video_maker', 'designer', 'ai_video'].includes(role)) { router.replace('/team-portal'); return }
      setUserRole(role)
      setGuardReady(true)
    })
  }, [router])

  const isAdmin = userRole === 'admin'

  const load = useCallback(async () => {
    const [tr, cr, mr] = await Promise.all([
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/team-users').then((r) => r.json()),
    ])
    setTasks(Array.isArray(tr) ? tr : [])
    setClients(Array.isArray(cr) ? cr : [])
    setMembers(Array.isArray(mr) ? mr : [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Realtime: auto-refresh when any task changes
  useEffect(() => {
    const supabase = getSupabaseClient()
    const ch = supabase
      .channel('admin:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

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

  function exportCSV() {
    window.open('/api/export?type=tasks', '_blank')
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((t) => t.id)))
    }
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} task(s)?`)) return
    await Promise.all([...selected].map((id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' })))
    toast(`${selected.size} task(s) deleted`, 'success')
    setSelected(new Set())
    load()
  }

  async function bulkSetStatus(status: string) {
    await Promise.all([...selected].map((id) => {
      const task = tasks.find(t => t.id === id)
      if (!task) return Promise.resolve()
      return fetch(`/api/tasks/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...task,
          status,
          task_type:   task.task_type   ?? null,
          due_date:    task.due_date    ?? null,
          assigned_to: task.assigned_to ?? null,
          client_id:   task.client_id   ?? null,
        }),
      })
    }))
    toast(`${selected.size} task(s) updated`, 'success')
    setSelected(new Set())
    load()
  }

  async function bulkReassign(memberId: string) {
    await Promise.all([...selected].map((id) => {
      const task = tasks.find(t => t.id === id)
      if (!task) return Promise.resolve()
      return fetch(`/api/tasks/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...task,
          assigned_to: memberId,
          task_type:   task.task_type ?? null,
          due_date:    task.due_date  ?? null,
          client_id:   task.client_id ?? null,
        }),
      })
    }))
    toast(`${selected.size} task(s) reassigned`, 'success')
    setSelected(new Set())
    load()
  }

  function matchesDueFilter(dueDate: string | undefined | null): boolean {
    if (filterDue === 'any') {
      if (!filterDateFrom && !filterDateTo) return true
      if (!dueDate) return false
      const d = new Date(dueDate)
      if (filterDateFrom && d < new Date(filterDateFrom)) return false
      if (filterDateTo   && d > new Date(filterDateTo))   return false
      return true
    }
    const now   = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const due   = dueDate ? new Date(dueDate) : null
    if (filterDue === 'overdue')    return !!due && due < today
    if (filterDue === 'today')      return !!due && due.toDateString() === today.toDateString()
    if (filterDue === 'this_week') {
      if (!due) return false
      const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
      return due >= today && due <= weekEnd
    }
    if (filterDue === 'this_month') {
      if (!due) return false
      return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()
    }
    return true
  }

  function matchesCommonFilters(t: Task): boolean {
    if (!t.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterAssignee !== 'all' && t.assigned_to !== filterAssignee) return false
    if (filterClient   !== 'all' && t.client_id   !== filterClient)   return false
    if (!matchesDueFilter(t.due_date)) return false
    return true
  }

  const filtered = tasks
    .filter((t) => {
      if (t.status === 'done') return false
      if (!matchesCommonFilters(t)) return false
      return filterStatus === 'all' || t.status === filterStatus
    })
    .sort(sortByDue)

  // Done tasks: always separated
  const filteredDone = tasks
    .filter((t) => t.status === 'done' && matchesCommonFilters(t))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const activeFilterCount = [
    filterAssignee !== 'all',
    filterClient   !== 'all',
    filterDue      !== 'any' || !!filterDateFrom || !!filterDateTo,
  ].filter(Boolean).length

  function clearFilters() {
    setFilterAssignee('all')
    setFilterClient('all')
    setFilterDue('any')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const countByStatus = (s: string) => tasks.filter((t) => t.status === s).length

  if (!guardReady) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Top bar: search + new button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="ghost" size="sm" onClick={exportCSV} className="gap-1.5 text-slate-400 hover:text-slate-100">
          <Download className="h-4 w-4" /> Export
        </Button>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        )}
      </div>

      {/* Bulk action toolbar — admin only */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30">
          <span className="text-sm font-medium text-indigo-300">{selected.size} selected</span>
          <div className="flex-1" />
          <Select onValueChange={bulkSetStatus}>
            <SelectTrigger className="w-36 h-8 text-xs border-indigo-500/40 bg-slate-800">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={bulkReassign}>
            <SelectTrigger className="w-40 h-8 text-xs border-indigo-500/40 bg-slate-800">
              <SelectValue placeholder="Reassign to…" />
            </SelectTrigger>
            <SelectContent>
              {members.filter(m => m.id).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={bulkDelete} className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="p-1 rounded text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter row: Assignee | Client | Due date */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />

        {/* Assignee */}
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="h-8 w-40 text-xs border-slate-700 bg-slate-900">
            <SelectValue placeholder="All members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            {members.filter(m => m.id).map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Client */}
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="h-8 w-36 text-xs border-slate-700 bg-slate-900">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.filter(c => c.id).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Due date presets */}
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { v: 'any',        label: 'Any date' },
            { v: 'overdue',    label: 'Overdue' },
            { v: 'today',      label: 'Today' },
            { v: 'this_week',  label: 'This week' },
            { v: 'this_month', label: 'This month' },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => { setFilterDue(v); setFilterDateFrom(''); setFilterDateTo('') }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all
                ${filterDue === v
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom date range (shown in 'any' mode when dates set, or always for range input) */}
        {filterDue === 'any' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-8 w-32 text-xs border-slate-700 bg-slate-900 text-slate-300"
            />
            <span>–</span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-8 w-32 text-xs border-slate-700 bg-slate-900 text-slate-300"
            />
          </div>
        )}

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
          >
            <X className="h-3 w-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Status filter chips (active tasks only — done has its own section) */}
      <div className="flex gap-2 flex-wrap items-center">
        {filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {selected.size === filtered.length && filtered.length > 0
              ? <CheckSquare className="h-4 w-4 text-indigo-400" />
              : <Square className="h-4 w-4" />}
            <span className="text-xs">All</span>
          </button>
        )}
        {(['all', 'todo', 'in_progress', 'review', 'overdue'] as const).map((s) => {
          const count = s === 'all' ? tasks.filter(t => t.status !== 'done').length : countByStatus(s)
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
      ) : (
        <div className="space-y-3">
          {/* ── Active tasks ── */}
          {filtered.length === 0 && filteredDone.length === 0 && (
            <Card><CardContent className="py-16 text-center">
              <p className="text-slate-400 text-sm">No tasks found.</p>
              {isAdmin && (
                <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true) }}>
                  <Plus className="h-4 w-4" /> Create First Task
                </Button>
              )}
            </CardContent></Card>
          )}

          {filtered.map((task) => (
            <Card key={task.id} className={`hover:border-slate-600 transition-colors ${selected.has(task.id) ? 'border-indigo-500/40 bg-indigo-500/5' : ''}`}>
              <CardContent className="py-4 flex items-start gap-3">
                <button
                  onClick={() => toggleSelect(task.id)}
                  className="mt-0.5 shrink-0 text-slate-500 hover:text-indigo-400 transition-colors"
                >
                  {selected.has(task.id)
                    ? <CheckSquare className="h-4 w-4 text-indigo-400" />
                    : <Square className="h-4 w-4" />}
                </button>
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
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.assignee?.display_name && <span>@ {task.assignee.display_name}</span>}
                    {task.client?.name && <span>— {task.client.name}</span>}
                    {task.reference_image_url && (
                      <span className="flex items-center gap-1 text-indigo-400">
                        <ImagePlus className="h-3 w-3" /> ref image
                      </span>
                    )}
                    {task.delivery_url && (
                      <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors">
                        <ExternalLink className="h-3 w-3" /> delivery
                      </a>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(task); setOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* ── Completed section ── */}
          {filteredDone.length > 0 && (
            <div className="pt-1">
              <button
                onClick={() => setCompletedOpen(o => !o)}
                className="flex items-center gap-2 w-full px-1 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors rounded-lg"
              >
                {completedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <CheckCircle2 className="h-4 w-4 text-green-500/70" />
                <span className="font-medium">Completed</span>
                <span className="ml-1 text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-semibold">
                  {filteredDone.length}
                </span>
                <span className="ml-auto text-xs text-slate-600">
                  {completedOpen ? 'hide' : 'show'}
                </span>
              </button>

              {completedOpen && (
                <div className="space-y-2 mt-2">
                  {filteredDone.map((task) => (
                    <Card key={task.id} className="opacity-70 hover:opacity-90 transition-opacity border-green-500/10">
                      <CardContent className="py-3 flex items-start gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-slate-300 text-sm line-through">{task.title}</h3>
                            {task.task_type && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                                {TASK_TYPE_OPTIONS.find((t) => t.value === task.task_type)?.label ?? task.task_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                            {task.assignee?.display_name && <span>@ {task.assignee.display_name}</span>}
                            {task.client?.name && <span>— {task.client.name}</span>}
                            {task.client_rating && (
                              <span className="text-amber-400">
                                {'★'.repeat(task.client_rating)}{'☆'.repeat(5 - task.client_rating)}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(task); setOpen(true) }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-red-400" onClick={() => handleDelete(task.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <TaskForm initial={editing ?? undefined} clients={clients} members={members} onSave={handleSave} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
