'use client'
import { useEffect, useState, useRef } from 'react'
import {
  CheckSquare, MessageCircle, Clock, AlertTriangle, Send, Loader2,
  CheckCircle2, ExternalLink, ImagePlus, Link2, X, Calendar, Camera,
  Globe, Music2, Mic, Sparkles, Search, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { Task, Message } from '@/types'
import { getSupabaseClient } from '@/lib/supabase'
import { CalendarView } from '@/components/calendar/CalendarView'

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
  review:      'bg-amber-500/10 text-amber-400',
  done:        'bg-green-500/10 text-green-400',
  overdue:     'bg-red-500/10 text-red-400',
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; pill: string }> = {
  instagram: { label: 'Instagram', icon: Camera, pill: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  facebook:  { label: 'Facebook',  icon: Globe,  pill: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  tiktok:    { label: 'TikTok',    icon: Music2, pill: 'text-slate-300 bg-slate-700/60 border-slate-600/30' },
}

interface ScheduleInfo {
  platforms:   string[]
  scheduledAt: string
  caption:     string
}

// ─── Mark Done Modal ──────────────────────────────────────────────────────────
function MarkDoneModal({
  task,
  isMediaBuyer,
  connectedPlatforms,
  onConfirm,
  onCancel,
}: {
  task:               Task
  isMediaBuyer:       boolean
  connectedPlatforms: string[]
  onConfirm: (deliveryUrl: string, schedule?: ScheduleInfo) => Promise<void>
  onCancel: () => void
}) {
  const [deliveryUrl,       setDeliveryUrl]       = useState(task.delivery_url ?? '')
  const [uploading,         setUploading]         = useState(false)
  const [saving,            setSaving]            = useState(false)
  const [scheduleOn,        setScheduleOn]        = useState(false)
  const [platforms,         setPlatforms]         = useState<string[]>([])
  const [scheduledAt,       setScheduledAt]       = useState('')
  const [caption,           setCaption]           = useState('')
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleGenerateCaption() {
    setGeneratingCaption(true)
    try {
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      })
      if (res.ok) {
        const { caption: generated } = await res.json()
        setCaption(generated)
      }
    } catch {}
    setGeneratingCaption(false)
  }

  const hasDelivery = !!deliveryUrl

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Presign failed')
      const { signedUrl, publicUrl } = await presignRes.json()
      await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setDeliveryUrl(publicUrl)
    } catch (err) {
      console.error('Upload error', err)
    } finally {
      setUploading(false)
    }
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleConfirm() {
    setSaving(true)
    const schedule = scheduleOn && platforms.length > 0 && scheduledAt
      ? { platforms, scheduledAt, caption }
      : undefined
    await onConfirm(deliveryUrl, schedule)
    setSaving(false)
  }

  const canSchedule = isMediaBuyer && connectedPlatforms.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="font-semibold text-white text-sm">Mark as Done</span>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Task name */}
          <div className="bg-slate-800/60 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-0.5">Task</p>
            <p className="font-medium text-white text-sm">{task.title}</p>
          </div>

          {/* Reference image */}
          {task.reference_image_url && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" /> Reference Image
              </p>
              <div className="rounded-xl overflow-hidden border border-slate-700">
                <img src={task.reference_image_url} alt="Reference"
                  className="w-full max-h-36 object-contain bg-slate-800" />
              </div>
            </div>
          )}

          {/* ── Delivery link ────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-slate-400" />
              Attach your work <span className="text-slate-500 font-normal">(optional)</span>
            </p>
            <div className="flex gap-2">
              <input value={deliveryUrl} onChange={e => setDeliveryUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors" />
              {deliveryUrl && (
                <button onClick={() => setDeliveryUrl('')} type="button"
                  className="px-2.5 text-slate-500 hover:text-red-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 text-center">— or upload a file directly —</p>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-xl py-3 text-sm text-slate-400 hover:text-slate-300 transition-all disabled:opacity-50">
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> Uploading…</>
                : <><ImagePlus className="h-4 w-4" /> Upload file</>}
            </button>
            <input ref={inputRef} type="file" className="hidden" onChange={handleFile} disabled={uploading} />
            {deliveryUrl?.startsWith('http') && (
              <a href={deliveryUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                <ExternalLink className="h-3 w-3" /> Preview attachment
              </a>
            )}
          </div>

          {/* ── Schedule Publishing (media buyer only) ───────────── */}
          {canSchedule && (
            <div className="border-t border-slate-800 pt-4 space-y-3">
              {/* Toggle */}
              <button
                type="button"
                onClick={() => setScheduleOn(o => !o)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  scheduleOn
                    ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-300'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:border-slate-600'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="h-4 w-4" />
                  Schedule for publishing
                </span>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${scheduleOn ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${scheduleOn ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>

              {scheduleOn && (
                <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                  {/* Platform selector */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-400 font-medium">Platforms</p>
                    <div className="flex flex-wrap gap-2">
                      {connectedPlatforms.map(p => {
                        const meta = PLATFORM_META[p]
                        if (!meta) return null
                        const Icon   = meta.icon
                        const active = platforms.includes(p)
                        return (
                          <button key={p} type="button" onClick={() => togglePlatform(p)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                              active ? meta.pill : 'text-slate-500 bg-transparent border-slate-700 hover:border-slate-500 hover:text-slate-300'
                            }`}>
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                            {active && <CheckCircle2 className="h-3 w-3" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Datetime */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Publish Time
                    </p>
                    <input type="datetime-local" value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors" />
                  </div>

                  {/* Caption */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-medium">Caption</p>
                      <button type="button" onClick={handleGenerateCaption}
                        disabled={generatingCaption}
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors">
                        {generatingCaption
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                          : <><Sparkles className="h-3 w-3" /> AI Generate</>}
                      </button>
                    </div>
                    <textarea value={caption} onChange={e => setCaption(e.target.value)}
                      placeholder="Write your post caption or use AI Generate above…" rows={3}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none resize-none transition-colors" />
                  </div>

                  {/* Validation hint */}
                  {scheduleOn && (!hasDelivery) && (
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Add a delivery file/link above to enable scheduling.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-slate-800/60 shrink-0">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm}
            disabled={saving || uploading || (scheduleOn && (!hasDelivery || platforms.length === 0 || !scheduledAt))}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : scheduleOn && hasDelivery
                ? <><Calendar className="h-4 w-4" /> Done & Schedule</>
                : <><CheckCircle2 className="h-4 w-4" /> Mark as Done</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeamPortalPage() {
  const [tasks,              setTasks]              = useState<Task[]>([])
  const [messages,           setMessages]           = useState<Message[]>([])
  const [newMsg,             setNewMsg]             = useState('')
  const [adminId,            setAdminId]            = useState<string | null>(null)
  const [myId,               setMyId]               = useState<string | null>(null)
  const [myRole,             setMyRole]             = useState<string>('')
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([])
  const [loading,            setLoading]            = useState(true)
  const [sending,            setSending]            = useState(false)
  const [tab,                setTab]                = useState<'tasks' | 'calendar' | 'chat'>('tasks')
  const [doneModal,          setDoneModal]          = useState<Task | null>(null)
  const [completedOpen,      setCompletedOpen]      = useState(false)
  const [online,             setOnline]             = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isMediaBuyer = myRole === 'media_buyer'

  useEffect(() => {
    async function load() {
      const profileRes = await fetch('/api/profile')
      const profile    = await profileRes.json()
      setMyId(profile.id)
      setMyRole(profile.role ?? '')

      const tasksRes  = await fetch('/api/tasks')
      const tasksData = await tasksRes.json()
      setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.data ?? []))

      // Load social connections for media buyer scheduling
      if (profile.role === 'media_buyer') {
        const connRes = await fetch('/api/social/connections')
        if (connRes.ok) {
          const conns: { platform: string; is_active: boolean }[] = await connRes.json()
          setConnectedPlatforms(conns.filter(c => c.is_active).map(c => c.platform))
        }
      }

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

  // Realtime: tasks assigned to me
  useEffect(() => {
    if (!myId) return
    const supabase = getSupabaseClient()
    const tasksCh = supabase
      .channel(`team-portal:tasks:${myId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${myId}` },
        async () => {
          const res  = await fetch('/api/tasks?limit=200')
          const data = await res.json()
          setTasks(Array.isArray(data) ? data : (data.data ?? []))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(tasksCh) }
  }, [myId])

  // Realtime: incoming messages
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

  async function updateStatus(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (newStatus === 'done') { setDoneModal(task); return }
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...task,
        status:      newStatus,
        task_type:   task.task_type   ?? null,
        due_date:    task.due_date    ?? null,
        assigned_to: task.assigned_to ?? null,
        client_id:   task.client_id   ?? null,
      }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t))
  }

  async function confirmDone(deliveryUrl: string, schedule?: ScheduleInfo) {
    if (!doneModal) return
    const task = doneModal

    // 1 — update task status + delivery URL
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...task,
        status:       'done',
        delivery_url: deliveryUrl || null,
        task_type:    task.task_type   ?? null,
        due_date:     task.due_date    ?? null,
        assigned_to:  task.assigned_to ?? null,
        client_id:    task.client_id   ?? null,
      }),
    })

    // 2 — schedule post if media buyer filled it in
    if (schedule && schedule.platforms.length > 0 && schedule.scheduledAt) {
      await fetch('/api/social/scheduled-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id:      task.id,
          platform:     schedule.platforms,
          scheduled_at: new Date(schedule.scheduledAt).toISOString(),
          caption:      schedule.caption,
        }),
      })
    }

    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, status: 'done' as Task['status'], delivery_url: deliveryUrl || undefined }
        : t
    ))
    setDoneModal(null)
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

      {/* Media buyer badge */}
      {isMediaBuyer && (
        <div className="flex items-center gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-4 py-2.5">
          <Calendar className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="text-xs text-indigo-300">
            <span className="font-semibold">Media Buyer:</span>{' '}
            {connectedPlatforms.length > 0
              ? `You can schedule posts on ${connectedPlatforms.join(', ')} directly when marking tasks done.`
              : 'Ask your admin to connect social accounts in Settings to enable scheduling.'}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {([
          { id: 'tasks',    label: 'My Tasks',        icon: CheckSquare    },
          { id: 'calendar', label: 'Calendar',        icon: Calendar       },
          { id: 'chat',     label: 'Chat with Admin', icon: MessageCircle  },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}>
            <Icon className="h-4 w-4" /> {label}
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
                  <div key={task.id} className={`bg-slate-900 border rounded-xl p-4 space-y-3 ${task.revision_notes ? 'border-amber-500/30' : 'border-slate-800'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-white">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                        )}
                        {/* Revision notes inline */}
                        {task.revision_notes && (
                          <div className="mt-2 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                            <RefreshCw className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-amber-400 mb-0.5">Revision requested</p>
                              <p className="text-xs text-slate-300 leading-relaxed">{task.revision_notes}</p>
                              {task.revision_voice_url && (
                                <div className="flex items-center gap-2 pt-1.5">
                                  <Mic className="h-3 w-3 text-amber-400 shrink-0" />
                                  <audio src={task.revision_voice_url} controls className="flex-1 h-7 min-w-0" />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Reference image */}
                        {task.reference_image_url && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-indigo-500/20 bg-slate-800">
                            <div className="px-3 py-1.5 border-b border-indigo-500/10 flex items-center gap-1.5">
                              <ImagePlus className="h-3 w-3 text-indigo-400" />
                              <span className="text-xs text-indigo-400 font-medium">Reference Image</span>
                              <a href={task.reference_image_url} target="_blank" rel="noopener noreferrer"
                                className="ml-auto text-slate-500 hover:text-slate-300 transition-colors">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <img src={task.reference_image_url} alt="Reference" className="w-full max-h-40 object-contain" />
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${PRIORITY_COLOR[task.priority] ?? ''}`}>
                        {task.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {task.due_date && (
                          <div className={`flex items-center gap-1 text-xs ${
                            new Date(task.due_date) < new Date() ? 'text-red-400' : 'text-slate-400'
                          }`}>
                            {new Date(task.due_date) < new Date()
                              ? <AlertTriangle className="h-3 w-3" />
                              : <Clock className="h-3 w-3" />}
                            {new Date(task.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={task.status}
                          onChange={e => updateStatus(task.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-md border-0 outline-none cursor-pointer ${STATUS_COLOR[task.status]}`}
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="review">Review</option>
                        </select>

                        <button
                          onClick={() => setDoneModal(task)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 font-medium transition-colors border border-green-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {isMediaBuyer && connectedPlatforms.length > 0 ? 'Done & Publish' : 'Done'}
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
          ) : null}

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
              <div className="text-center py-8 text-slate-500 text-sm">No messages yet. Say hello! 👋</div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_id === myId ? 'justify-end' : 'justify-start'}`}>
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
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type a message..."
              className="flex-1 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-slate-500 border border-slate-700 focus:border-indigo-500 transition-colors" />
            <button type="submit" disabled={sending || !newMsg.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition-colors">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}

      {/* Mark Done Modal */}
      {doneModal && (
        <MarkDoneModal
          task={doneModal}
          isMediaBuyer={isMediaBuyer}
          connectedPlatforms={connectedPlatforms}
          onConfirm={confirmDone}
          onCancel={() => setDoneModal(null)}
        />
      )}
    </div>
  )
}
