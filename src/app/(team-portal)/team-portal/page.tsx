'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CheckSquare, MessageCircle, Clock, AlertTriangle, Send, Loader2,
  CheckCircle2, ExternalLink, ImagePlus, Link2, X, Calendar, Camera,
  Globe, Music2, Mic, Sparkles, Search, RefreshCw, ChevronDown, ChevronUp,
  Rss, Trash2, XCircle, PlusCircle, WifiOff, Users, Plus, Settings2, BarChart2,
} from 'lucide-react'
import type { Task, Message } from '@/types'
import { getSupabaseClient } from '@/lib/supabase'
import { CalendarView } from '@/components/calendar/CalendarView'

// ── Shared constants ───────────────────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; pill: string; color: string; bg: string }> = {
  instagram: { label: 'Instagram', icon: Camera, pill: 'text-pink-400 bg-pink-500/10 border-pink-500/20',   color: 'text-pink-400',  bg: 'bg-pink-500/10' },
  facebook:  { label: 'Facebook',  icon: Globe,  pill: 'text-blue-400 bg-blue-500/10 border-blue-500/20',   color: 'text-blue-400',  bg: 'bg-blue-500/10' },
  tiktok:    { label: 'TikTok',    icon: Music2, pill: 'text-slate-300 bg-slate-700/60 border-slate-600/30', color: 'text-slate-300', bg: 'bg-slate-700/60' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Scheduled', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',  icon: Clock },
  published: { label: 'Published', color: 'text-green-400 bg-green-500/10 border-green-500/20',  icon: CheckCircle2 },
  failed:    { label: 'Failed',    color: 'text-red-400 bg-red-500/10 border-red-500/20',        icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-slate-400 bg-slate-700/40 border-slate-600/30',  icon: XCircle },
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

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScheduledPost {
  id: string
  task_id: string | null
  platform: string
  scheduled_at: string
  caption: string | null
  status: string
  error: string | null
  task?: { id: string; title: string; delivery_url: string | null } | null
}

interface SocialConnection {
  id: string
  platform: string
  is_active: boolean
  extra?: Record<string, unknown>
}

interface ScheduleInfo {
  platforms:   string[]
  scheduledAt: string
  caption:     string
}

// ── TaskFilter ─────────────────────────────────────────────────────────────────
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

// ── MarkDoneModal ──────────────────────────────────────────────────────────────
function MarkDoneModal({
  task, isMediaBuyer, connectedPlatforms, onConfirm, onCancel,
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
      const data = await presignRes.json()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', data.apiKey)
      formData.append('timestamp', String(data.timestamp))
      formData.append('signature', data.signature)
      formData.append('public_id', data.publicId)
      if (data.eager) formData.append('eager', data.eager)
      const upRes = await fetch(data.uploadUrl, { method: 'POST', body: formData })
      const uploaded = await upRes.json()
      setDeliveryUrl(uploaded.secure_url ?? data.publicUrl)
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
  const hasDelivery = !!deliveryUrl
  const [minScheduleDateTime] = useState(() => new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="bg-slate-800/60 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-0.5">Task</p>
            <p className="font-medium text-white text-sm">{task.title}</p>
          </div>

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

          {canSchedule && (
            <div className="border-t border-slate-800 pt-4 space-y-3">
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
                <div className="space-y-3">
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

                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Publish Time
                    </p>
                    <input type="datetime-local" value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      min={minScheduleDateTime}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-medium">Caption</p>
                      <button type="button" onClick={handleGenerateCaption} disabled={generatingCaption}
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

                  {scheduleOn && !hasDelivery && (
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

const CONTENT_TYPES = [
  { value: 'post',  label: 'Post',  desc: 'Feed post (image/video)' },
  { value: 'reel',  label: 'Reel',  desc: 'Short-form vertical video' },
  { value: 'story', label: 'Story', desc: 'Disappears after 24h' },
] as const

// ── NewPostModal ───────────────────────────────────────────────────────────────
interface DeliverableTask {
  id: string
  title: string
  delivery_url: string
  task_type?: string | null
  assignee_name?: string | null
  client_name?: string | null
}

function NewPostModal({
  doneTasks, connectedPlatforms, clients, onSave, onClose, preSelectedTaskId,
}: {
  doneTasks:          Task[]
  connectedPlatforms: string[]
  clients:            { id: string; name: string }[]
  onSave:             () => void
  onClose:            () => void
  preSelectedTaskId?: string
}) {
  const [source,           setSource]           = useState<'upload' | 'task'>(preSelectedTaskId ? 'task' : 'upload')
  const [clientId,         setClientId]         = useState(clients[0]?.id ?? '')
  const [taskId,           setTaskId]           = useState(preSelectedTaskId ?? '')
  const [mediaUrl,         setMediaUrl]         = useState('')
  const [uploading,        setUploading]        = useState(false)
  const [uploadPct,        setUploadPct]        = useState(0)
  const [contentType,      setContentType]      = useState<'post' | 'reel' | 'story'>('post')
  const [platforms,        setPlatforms]        = useState<string[]>([])
  const [scheduledAt,      setScheduledAt]      = useState('')
  const [caption,          setCaption]          = useState('')
  const [generating,       setGenerating]       = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')
  const [deliverableTasks, setDeliverableTasks] = useState<DeliverableTask[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch all team deliverable tasks once when modal opens
  useEffect(() => {
    fetch('/api/tasks/deliverables')
      .then(r => r.ok ? r.json() : [])
      .then((data: DeliverableTask[]) => setDeliverableTasks(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const tasksWithFile = doneTasks.filter(t => t.delivery_url)
  const hasMedia = source === 'upload' ? !!mediaUrl : !!taskId

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadPct(0)
    setError('')
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Failed to get upload URL')
      const data = await presignRes.json()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', data.apiKey)
      formData.append('timestamp', String(data.timestamp))
      formData.append('signature', data.signature)
      formData.append('public_id', data.publicId)
      if (data.eager) formData.append('eager', data.eager)

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100))
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('POST', data.uploadUrl)
        xhr.send(formData)
      })
      const uploadedData = JSON.parse(xhr.responseText) as { secure_url?: string }
      setMediaUrl(uploadedData.secure_url ?? data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleGenerateCaption() {
    setGenerating(true)
    try {
      const body = taskId ? { task_id: taskId } : { media_url: mediaUrl, content_type: contentType }
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { caption: gen } = await res.json()
        setCaption(gen)
      }
    } catch {}
    setGenerating(false)
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleSave() {
    setError('')
    if (!hasMedia || platforms.length === 0 || !scheduledAt) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      platform:     platforms,
      scheduled_at: new Date(scheduledAt).toISOString(),
      caption,
      content_type: contentType,
      client_id:    clientId || undefined,
    }
    if (source === 'upload') payload.media_url = mediaUrl
    else                     payload.task_id   = taskId

    const res = await fetch('/api/social/scheduled-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) { onSave(); onClose() }
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to schedule post.')
    }
  }

  const [minScheduleDateTime] = useState(() => new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="font-semibold text-white text-sm">Schedule New Post</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Source toggle */}
          <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1">
            <button onClick={() => setSource('upload')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                source === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              Upload New File
            </button>
            <button onClick={() => setSource('task')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                source === 'task' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              From Task
            </button>
          </div>

          {/* Client selector */}
          {clients.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Client</p>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors">
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Upload section */}
          {source === 'upload' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-300">Content Type *</p>
                <div className="grid grid-cols-3 gap-2">
                  {CONTENT_TYPES.map(ct => (
                    <button key={ct.value} type="button"
                      onClick={() => setContentType(ct.value)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all ${
                        contentType === ct.value
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}>
                      <span className="font-bold">{ct.label}</span>
                      <span className="font-normal text-[10px] opacity-70">{ct.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">Media File *</p>
                {mediaUrl ? (
                  <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-xs text-emerald-300 hover:underline truncate">
                      File uploaded ↗
                    </a>
                    <button onClick={() => { setMediaUrl(''); if (fileRef.current) fileRef.current.value = '' }}
                      className="text-slate-500 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-full flex flex-col items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-xl py-6 text-sm text-slate-400 hover:text-slate-300 transition-all disabled:opacity-50">
                    {uploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                        <span className="text-xs">Uploading… {uploadPct}%</span>
                        <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploadPct}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-xs">Click to upload image or video</span>
                        <span className="text-[10px] text-slate-500">MP4, MOV, JPG, PNG, WebP</span>
                      </>
                    )}
                  </button>
                )}
                <input ref={fileRef} type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/mov,video/webm,video/quicktime"
                  className="hidden" onChange={handleFile} disabled={uploading} />
              </div>
            </div>
          )}

          {/* Task picker section */}
          {source === 'task' && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Select Task *</p>
              {deliverableTasks.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-800/60 rounded-xl px-3 py-3">
                  No completed tasks with uploaded files yet. Mark a task as done and attach a file first.
                </p>
              ) : (
                <select value={taskId} onChange={e => setTaskId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors">
                  <option value="">— choose a task —</option>
                  {deliverableTasks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                      {t.client_name ? ` · ${t.client_name}` : ''}
                      {t.task_type ? ` [${t.task_type.replace(/_/g, ' ')}]` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Platforms */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-300">Platforms *</p>
            {connectedPlatforms.length === 0 ? (
              <p className="text-xs text-slate-500">No platforms connected. Go to Manage Accounts first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedPlatforms.map(p => {
                  const meta   = PLATFORM_META[p]
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
            )}
          </div>

          {/* Scheduled time */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" /> Publish Time *
            </p>
            <input type="datetime-local" value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              min={minScheduleDateTime}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors" />
          </div>

          {/* Caption + AI */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">Caption &amp; Hashtags</p>
              <button type="button" onClick={handleGenerateCaption}
                disabled={generating || !hasMedia}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors">
                {generating
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                  : <><Sparkles className="h-3 w-3" /> AI Generate</>}
              </button>
            </div>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption and hashtags, or use AI Generate above…" rows={4}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none resize-none transition-colors" />
            <p className="text-[10px] text-slate-600">Tip: hashtags go at the end of your caption or in the first comment.</p>
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-slate-800/60 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            disabled={saving || uploading || !hasMedia || platforms.length === 0 || !scheduledAt}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</>
              : <><Calendar className="h-4 w-4" /> Schedule Post</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ManageAccountsSection ─────────────────────────────────────────────────────
const MANUAL_PLATFORMS = [
  {
    key: 'instagram' as const,
    label: 'Instagram',
    icon: Camera,
    color: 'from-pink-500 to-purple-500',
    fields: [
      { key: 'ig_user_id',   label: 'Instagram Business User ID', placeholder: '17841400000000000' },
      { key: 'access_token', label: 'Page Access Token',          placeholder: 'EAABsbCS…',         type: 'password' as const },
    ],
  },
  {
    key: 'facebook' as const,
    label: 'Facebook Page',
    icon: Globe,
    color: 'from-blue-600 to-blue-500',
    fields: [
      { key: 'page_id',      label: 'Facebook Page ID',  placeholder: '123456789012345' },
      { key: 'access_token', label: 'Page Access Token', placeholder: 'EAABsbCS…',     type: 'password' as const },
    ],
  },
  {
    key: 'tiktok' as const,
    label: 'TikTok',
    icon: Music2,
    color: 'from-slate-700 to-slate-600',
    fields: [
      { key: 'access_token', label: 'User Access Token', placeholder: 'act.example…', type: 'password' as const },
    ],
  },
]

interface Connection {
  id: string
  client_id: string
  platform: string
  page_id?: string
  ig_user_id?: string
  token_expires_at?: string
  is_active: boolean
  extra?: Record<string, string>
}

function ManageAccountsSection({ oauthSuccessClientId }: { oauthSuccessClientId?: string }) {
  const [clients,     setClients]     = useState<{ id: string; name: string }[]>([])
  const [selectedId,  setSelectedId]  = useState(oauthSuccessClientId ?? '')
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading,     setLoading]     = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [openForm,    setOpenForm]    = useState<string | null>(null)
  const [form,        setForm]        = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState(false)
  const [banner,      setBanner]      = useState<{ type: 'success' | 'error'; msg: string } | null>(
    oauthSuccessClientId ? { type: 'success', msg: 'Facebook & Instagram connected successfully!' } : null
  )

  useEffect(() => {
    fetch('/api/clients').then(r => r.ok ? r.json() : []).then((data: { id: string; name: string }[]) => {
      const list = Array.isArray(data) ? data : []
      setClients(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
      else if (oauthSuccessClientId) setSelectedId(oauthSuccessClientId)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadConnections(clientId: string) {
    if (!clientId) return
    setLoading(true)
    const res = await fetch(`/api/social/connections?client_id=${clientId}`)
    if (res.ok) setConnections(await res.json())
    setLoading(false)
  }

  useEffect(() => { if (selectedId) void loadConnections(selectedId) }, [selectedId])

  function startOAuth() {
    if (!selectedId) return
    setOauthLoading(true)
    window.location.href = `/api/social/oauth?client_id=${selectedId}&returnTo=/team-portal`
  }

  async function handleSave(platform: string) {
    setSaving(true)
    await fetch('/api/social/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: selectedId, platform, ...form }),
    })
    setOpenForm(null)
    setForm({})
    setSaving(false)
    void loadConnections(selectedId)
    setBanner({ type: 'success', msg: `${platform} connected!` })
  }

  async function handleDelete(id: string) {
    await fetch('/api/social/connections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    void loadConnections(selectedId)
  }

  const selectedClient = clients.find(c => c.id === selectedId)

  return (
    <div className="space-y-4">

      {banner && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${
          banner.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {banner.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Client selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">Select Client</p>
        </div>
        {clients.length === 0 ? (
          <p className="text-xs text-slate-500">No clients found.</p>
        ) : (
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setBanner(null) }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors cursor-pointer">
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {selectedId && (
          <button onClick={startOAuth} disabled={oauthLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold text-sm transition-all">
            {oauthLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</>
              : <><Link2 className="h-4 w-4" /> Connect Facebook & Instagram for {selectedClient?.name ?? '…'}</>}
          </button>
        )}
        <p className="text-xs text-slate-500 text-center">
          One click connects Facebook Pages + Instagram Business accounts automatically via OAuth.
        </p>
      </div>

      {/* Platform cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {MANUAL_PLATFORMS.map(cfg => {
            const conn  = connections.find(c => c.platform === cfg.key) ?? null
            const Icon  = cfg.icon
            const isExpired = conn?.token_expires_at ? new Date(conn.token_expires_at) < new Date() : false
            const isOpen = openForm === cfg.key
            return (
              <div key={cfg.key} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center shrink-0`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{cfg.label}</p>
                      {conn ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          {isExpired
                            ? <><AlertTriangle className="h-3 w-3 text-amber-400" /><span className="text-xs text-amber-400">Token expired</span></>
                            : <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-xs text-emerald-400">
                                Connected{conn.extra?.page_name ? ` — ${conn.extra.page_name}` : ''}
                                {conn.extra?.ig_username ? ` (@${conn.extra.ig_username})` : ''}
                              </span></>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5">
                          <XCircle className="h-3 w-3 text-slate-500" />
                          <span className="text-xs text-slate-500">Not connected</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conn ? (
                      <>
                        <button onClick={() => { setOpenForm(isOpen ? null : cfg.key); setForm({}) }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                          {isExpired ? 'Refresh' : 'Update'}
                        </button>
                        <button onClick={() => handleDelete(conn.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setOpenForm(isOpen ? null : cfg.key); setForm({}) }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Manual
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-800 px-4 py-3 space-y-3 bg-slate-950/40">
                    {cfg.fields.map(f => (
                      <div key={f.key} className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">{f.label}</label>
                        <input
                          type={f.type ?? 'text'}
                          value={form[f.key] ?? ''}
                          onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors font-mono"
                        />
                      </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => { setOpenForm(null); setForm({}) }}
                        className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                        Cancel
                      </button>
                      <button onClick={() => handleSave(cfg.key)} disabled={saving}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold transition-colors">
                        {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DashboardTab ───────────────────────────────────────────────────────────────
interface Earning {
  id: string
  amount: number
  task_title?: string | null
  client_name?: string | null
  approved_at?: string | null
}

function DashboardTab({ tasks }: { tasks: Task[] }) {
  const [earnings,        setEarnings]        = useState<Earning[]>([])
  const [earningsLoading, setEarningsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/earnings')
      .then(r => r.ok ? r.json() : [])
      .then((data: Earning[]) => setEarnings(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setEarningsLoading(false))
  }, [])

  const totalTasks    = tasks.length
  const doneTasks     = tasks.filter(t => t.status === 'done')
  const inProgress    = tasks.filter(t => t.status === 'in_progress' || t.status === 'review')
  const overdueTasks  = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done')

  // On-time rate: done tasks without overdue flag
  const doneOnTime   = doneTasks.filter(t => !(t.due_date && new Date(t.due_date) < new Date()))
  const onTimeRate   = doneTasks.length > 0 ? Math.round((doneOnTime.length / doneTasks.length) * 100) : 0

  // Revision rate: done tasks that had revision_notes
  const revisedTasks = doneTasks.filter(t => t.revision_notes)
  const revisionRate = doneTasks.length > 0 ? Math.round((revisedTasks.length / doneTasks.length) * 100) : 0

  const totalEarned  = earnings.reduce((s, e) => s + (e.amount ?? 0), 0)

  return (
    <div className="space-y-5">

      {/* Task stats */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Task Overview</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Tasks',  value: totalTasks,        color: 'text-white' },
            { label: 'Completed',    value: doneTasks.length,  color: 'text-green-400' },
            { label: 'In Progress',  value: inProgress.length, color: 'text-blue-400' },
            { label: 'Overdue',      value: overdueTasks.length, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance rates */}
      {doneTasks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Performance</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">On-time Rate</span>
                <span className={`font-semibold ${onTimeRate >= 80 ? 'text-green-400' : onTimeRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{onTimeRate}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${onTimeRate >= 80 ? 'bg-green-500' : onTimeRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${onTimeRate}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{doneOnTime.length} of {doneTasks.length} done tasks delivered on time</p>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Revision Rate</span>
                <span className={`font-semibold ${revisionRate === 0 ? 'text-green-400' : revisionRate <= 20 ? 'text-amber-400' : 'text-red-400'}`}>{revisionRate}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${revisionRate === 0 ? 'bg-green-500' : revisionRate <= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${revisionRate}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{revisedTasks.length} of {doneTasks.length} done tasks had revisions</p>
            </div>
          </div>
        </div>
      )}

      {/* Earnings */}
      {earningsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
      ) : earnings.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">My Earnings</p>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-3xl font-extrabold text-green-400">{totalEarned} AED</div>
            <div className="text-xs text-slate-500 mt-1">Total Earned</div>
          </div>
          <div className="space-y-2">
            {earnings.map(e => (
              <div key={e.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{e.task_title ?? 'Task'}</p>
                  {e.client_name && <p className="text-xs text-slate-500 mt-0.5">{e.client_name}</p>}
                  {e.approved_at && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {new Date(e.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-green-400 shrink-0">{e.amount} AED</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center">Earnings are credited for approved design tasks</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-4">Design task approvals will appear here</p>
      )}
    </div>
  )
}

// ── SocialTab ──────────────────────────────────────────────────────────────────
function SocialTab({ tasks, connectedPlatforms, clients, oauthSuccessClientId }: {
  tasks: Task[]
  connectedPlatforms: string[]
  clients: { id: string; name: string }[]
  oauthSuccessClientId?: string
}) {
  const [subTab, setSubTab] = useState<'posts' | 'accounts'>(oauthSuccessClientId ? 'accounts' : 'posts')
  const [posts,             setPosts]             = useState<ScheduledPost[]>([])
  const [loading,           setLoading]           = useState(true)
  const [statusFilter,      setStatusFilter]      = useState('all')
  const [showNew,           setShowNew]           = useState(false)
  const [deliverableTasks,  setDeliverableTasks]  = useState<DeliverableTask[]>([])
  const [preScheduleTaskId, setPreScheduleTaskId] = useState<string | undefined>()

  async function loadPosts() {
    setLoading(true)
    const res = await fetch('/api/social/scheduled-posts')
    if (res.ok) setPosts(await res.json())
    setLoading(false)
  }

  useEffect(() => { void loadPosts() }, [])

  useEffect(() => {
    fetch('/api/tasks/deliverables')
      .then(r => r.ok ? r.json() : [])
      .then((data: DeliverableTask[]) => setDeliverableTasks(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  async function cancelPost(id: string) {
    await fetch('/api/social/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    void loadPosts()
  }

  const doneTasks = tasks.filter(t => t.status === 'done')
  const filtered  = posts.filter(p => statusFilter === 'all' || p.status === statusFilter)
  const counts = {
    pending:   posts.filter(p => p.status === 'pending').length,
    published: posts.filter(p => p.status === 'published').length,
    failed:    posts.filter(p => p.status === 'failed').length,
  }
  const scheduledTaskIds = new Set(
    posts.filter(p => p.task_id && p.status !== 'cancelled').map(p => p.task_id!)
  )
  const readyToPublish = deliverableTasks.filter(t => !scheduledTaskIds.has(t.id))

  return (
    <div className="space-y-4">

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        <button onClick={() => setSubTab('posts')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'posts' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100'
          }`}>
          <Calendar className="h-3.5 w-3.5" /> Scheduled Posts
        </button>
        <button onClick={() => setSubTab('accounts')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'accounts' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100'
          }`}>
          <Settings2 className="h-3.5 w-3.5" /> Manage Accounts
        </button>
      </div>

      {/* ── Scheduled Posts sub-tab ── */}
      {subTab === 'posts' && (
        <div className="space-y-4">

          {/* Ready to Publish */}
          {readyToPublish.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Ready to Publish ({readyToPublish.length})
              </p>
              {readyToPublish.map(task => (
                <div key={task.id} className="bg-slate-900 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-3">
                  {task.delivery_url && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                      {/\.(mp4|mov|webm|avi)/i.test(task.delivery_url) ? (
                        <video src={task.delivery_url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={task.delivery_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{task.title}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {(task as unknown as { client_name?: string }).client_name ?? ''}
                      {(task as unknown as { assignee_name?: string }).assignee_name
                        ? ` · ${(task as unknown as { assignee_name?: string }).assignee_name}`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => { setPreScheduleTaskId(task.id); setShowNew(true) }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" /> Schedule
                  </button>
                </div>
              ))}
              <div className="border-t border-slate-800/60" />
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-amber-400">{counts.pending}</p>
              <p className="text-xs text-slate-500 mt-0.5">Scheduled</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{counts.published}</p>
              <p className="text-xs text-slate-500 mt-0.5">Published</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-red-400">{counts.failed}</p>
              <p className="text-xs text-slate-500 mt-0.5">Failed</p>
            </div>
          </div>

          {/* Filters + New Post */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'pending', 'published', 'failed', 'cancelled'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    statusFilter === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}>
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadPosts}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
              {connectedPlatforms.length > 0 && (
                <button onClick={() => setShowNew(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                  <PlusCircle className="h-3.5 w-3.5" /> New Post
                </button>
              )}
            </div>
          </div>

          {/* Posts list */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center">
              <Calendar className="h-9 w-9 mx-auto mb-2 text-slate-700" />
              <p className="text-sm text-slate-500">No scheduled posts yet</p>
              {connectedPlatforms.length > 0 && (
                <button onClick={() => setShowNew(true)}
                  className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  + Schedule your first post
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(post => {
                const meta = PLATFORM_META[post.platform]
                const Icon = meta?.icon ?? Globe
                const cfg  = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.pending
                const StatusIcon = cfg.icon
                return (
                  <div key={post.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${meta?.pill ?? ''}`}>
                            <Icon className="h-3 w-3" /> {meta?.label ?? post.platform}
                          </span>
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                            <StatusIcon className="h-3 w-3" /> {cfg.label}
                          </span>
                          {post.task?.title && (
                            <span className="text-xs text-slate-400 truncate">{post.task.title}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(post.scheduled_at).toLocaleString([], {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                        {post.caption && (
                          <p className="text-xs text-slate-400 line-clamp-2 bg-slate-800/40 rounded-lg px-3 py-2">
                            {post.caption}
                          </p>
                        )}
                        {post.error && (
                          <p className="text-xs text-red-400 flex items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5 shrink-0" /> {post.error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {post.task?.delivery_url && (
                          <a href={post.task.delivery_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {post.status === 'pending' && (
                          <button onClick={() => cancelPost(post.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {showNew && (
            <NewPostModal
              doneTasks={doneTasks}
              connectedPlatforms={connectedPlatforms}
              clients={clients}
              onSave={() => { void loadPosts() }}
              onClose={() => { setShowNew(false); setPreScheduleTaskId(undefined) }}
              preSelectedTaskId={preScheduleTaskId}
            />
          )}
        </div>
      )}

      {/* ── Manage Accounts sub-tab ── */}
      {subTab === 'accounts' && (
        <ManageAccountsSection oauthSuccessClientId={oauthSuccessClientId} />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamPortalPage() {
  const searchParams = useSearchParams()
  const oauthSuccess  = searchParams.get('success') === '1'
  const oauthClientId = searchParams.get('client_id') ?? undefined
  const oauthError    = searchParams.get('error') ?? undefined

  const [tasks,              setTasks]              = useState<Task[]>([])
  const [messages,           setMessages]           = useState<Message[]>([])
  const [newMsg,             setNewMsg]             = useState('')
  const [adminId,            setAdminId]            = useState<string | null>(null)
  const [myId,               setMyId]               = useState<string | null>(null)
  const [myRole,             setMyRole]             = useState<string>('')
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([])
  const [clients,            setClients]            = useState<{ id: string; name: string }[]>([])
  const [loading,            setLoading]            = useState(true)
  const [sending,            setSending]            = useState(false)
  // Auto-switch to social tab on OAuth return
  const [tab, setTab] = useState<'tasks' | 'dashboard' | 'social' | 'calendar' | 'chat'>(
    oauthSuccess || oauthError ? 'social' : 'tasks'
  )
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

      if (profile.role === 'media_buyer') {
        const [connRes, clientsRes] = await Promise.all([
          fetch('/api/social/connections'),
          fetch('/api/clients'),
        ])
        if (connRes.ok) {
          const conns: SocialConnection[] = await connRes.json()
          setConnectedPlatforms(conns.filter(c => c.is_active).map(c => c.platform))
        }
        if (clientsRes.ok) {
          const cl = await clientsRes.json()
          setClients(Array.isArray(cl) ? cl : [])
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

  // Realtime: tasks
  useEffect(() => {
    if (!myId) return
    const supabase = getSupabaseClient()
    const tasksCh = supabase
      .channel(`team-portal:tasks:${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${myId}` },
        async () => {
          const res  = await fetch('/api/tasks?limit=200')
          const data = await res.json()
          setTasks(Array.isArray(data) ? data : (data.data ?? []))
        })
      .subscribe()
    return () => { supabase.removeChannel(tasksCh) }
  }, [myId])

  // Realtime: messages
  useEffect(() => {
    if (!myId) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`messages:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        })
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
        ...task, status: newStatus,
        task_type: task.task_type ?? null, due_date: task.due_date ?? null,
        assigned_to: task.assigned_to ?? null, client_id: task.client_id ?? null,
      }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t))
  }

  async function confirmDone(deliveryUrl: string, schedule?: ScheduleInfo) {
    if (!doneModal) return
    const task = doneModal
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...task, status: 'done', delivery_url: deliveryUrl || null,
        task_type: task.task_type ?? null, due_date: task.due_date ?? null,
        assigned_to: task.assigned_to ?? null, client_id: task.client_id ?? null,
      }),
    })
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
      t.id === task.id ? { ...t, status: 'done' as Task['status'], delivery_url: deliveryUrl || undefined } : t
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

  // Tabs config — social tab only for media buyers; My Stats for all
  const tabs = [
    { id: 'tasks'     as const, label: 'My Tasks',    icon: CheckSquare   },
    { id: 'dashboard' as const, label: 'My Dashboard', icon: BarChart2     },
    ...(isMediaBuyer ? [{ id: 'social' as const, label: 'Social Media', icon: Rss }] : []),
    { id: 'calendar'  as const, label: 'Calendar',    icon: Calendar      },
    { id: 'chat'      as const, label: 'Chat',        icon: MessageCircle },
  ]

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
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── My Tasks Tab ──────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="space-y-3">
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
                        <select value={task.status} onChange={e => updateStatus(task.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-md border-0 outline-none cursor-pointer ${STATUS_COLOR[task.status]}`}>
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="review">Review</option>
                        </select>
                        <button onClick={() => setDoneModal(task)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 font-medium transition-colors border border-green-500/20">
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

          {doneTasks.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <button onClick={() => setCompletedOpen(o => !o)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 py-1.5 w-full transition-colors">
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

      {/* ── My Stats Tab ─────────────────────────────────── */}
      {tab === 'dashboard' && (
        <DashboardTab tasks={tasks} />
      )}

      {/* ── Social Media Tab (media buyers only) ─────────── */}
      {tab === 'social' && isMediaBuyer && (
        <SocialTab
          tasks={tasks}
          connectedPlatforms={connectedPlatforms}
          clients={clients}
          oauthSuccessClientId={oauthSuccess ? oauthClientId : undefined}
        />
      )}

      {/* ── Calendar Tab ─────────────────────────────────── */}
      {tab === 'calendar' && (
        <CalendarView tasks={tasks} showAssignee={false} />
      )}

      {/* ── Chat Tab ─────────────────────────────────────── */}
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
