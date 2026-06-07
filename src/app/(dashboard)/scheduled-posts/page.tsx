'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar, Camera, Globe, Music2, Clock, CheckCircle2, XCircle,
  Loader2, Trash2, ExternalLink, RefreshCw, Sparkles, Send,
  ImageIcon, FileVideo, Layers, ChevronDown, X, AlertCircle,
  LayoutGrid, PlayCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReadyTask {
  id: string
  title: string
  task_type: string | null
  description: string | null
  delivery_url: string | null
  client: { id: string; name: string } | null
  assignee: { display_name?: string } | null
  due_date: string | null
}

interface ScheduledPost {
  id: string
  task_id: string | null
  platform: string
  scheduled_at: string
  caption: string | null
  content_type: string
  status: string
  error: string | null
  attempts: number
  created_at: string
  task?: { id: string; title: string; delivery_url: string | null } | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Camera,  color: 'text-pink-400',  bg: 'bg-pink-500/10 border-pink-500/20',  ring: 'ring-pink-500' },
  { id: 'facebook',  label: 'Facebook',  icon: Globe,   color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/20',  ring: 'ring-blue-500' },
  { id: 'tiktok',    label: 'TikTok',    icon: Music2,  color: 'text-slate-300', bg: 'bg-slate-700/60 border-slate-600/30', ring: 'ring-slate-400' },
] as const

const CONTENT_TYPES = [
  { id: 'post',  label: 'Post',  icon: ImageIcon },
  { id: 'reel',  label: 'Reel',  icon: FileVideo },
  { id: 'story', label: 'Story', icon: Layers },
] as const

const TASK_TYPE_LABEL: Record<string, string> = {
  reel_video: 'Reel / Video',
  design:     'Design',
  ai_video:   'AI Video',
  post:       'Post',
  custom:     'Custom',
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS.find(x => x.id === platform)
  if (!p) return <span className="text-xs text-slate-500">{platform}</span>
  const Icon = p.icon
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${p.bg} ${p.color}`}>
      <Icon className="h-3 w-3" />{p.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending:   { label: 'Scheduled',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',  icon: Clock },
    published: { label: 'Published',  color: 'text-green-400 bg-green-500/10 border-green-500/20',  icon: CheckCircle2 },
    failed:    { label: 'Failed',     color: 'text-red-400 bg-red-500/10 border-red-500/20',        icon: XCircle },
    cancelled: { label: 'Cancelled',  color: 'text-slate-400 bg-slate-700/40 border-slate-600/30', icon: XCircle },
  }
  const c = cfg[status] ?? cfg.pending
  const Icon = c.icon
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${c.color}`}>
      <Icon className="h-3 w-3" />{c.label}
    </span>
  )
}

function isVideo(url: string | null) {
  if (!url) return false
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url)
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

function ScheduleModal({
  task,
  onClose,
  onScheduled,
}: {
  task: ReadyTask
  onClose: () => void
  onScheduled: () => void
}) {
  const { toast } = useToast()
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram'])
  const [contentType,       setContentType]       = useState('post')
  const [caption,           setCaption]           = useState('')
  const [scheduledDate,     setScheduledDate]     = useState('')
  const [scheduledTime,     setScheduledTime]     = useState('09:00')
  const [generating,        setGenerating]        = useState(false)
  const [submitting,        setSubmitting]        = useState(false)

  function togglePlatform(id: string) {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function generateCaption() {
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle:   task.title,
          taskType:    task.task_type,
          description: task.description,
          clientName:  task.client?.name,
        }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const { caption: generated } = await res.json()
      setCaption(generated)
    } catch {
      toast('Failed to generate caption', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function submit() {
    if (!selectedPlatforms.length) { toast('Select at least one platform', 'error'); return }
    if (!scheduledDate)             { toast('Set a date', 'error'); return }
    const scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
    setSubmitting(true)
    try {
      const res = await fetch('/api/social/scheduled-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id:      task.id,
          platform:     selectedPlatforms,
          content_type: contentType,
          caption:      caption || null,
          scheduled_at,
          client_id:    task.client?.id ?? null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to schedule')
      }
      toast(`Scheduled for ${new Date(scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 'success')
      onScheduled()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to schedule', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Schedule Post</h2>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-100 transition-colors ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Media preview */}
          {task.delivery_url && (
            <div className="rounded-xl overflow-hidden bg-slate-800/40 border border-slate-700/50 flex items-center justify-center h-40">
              {isVideo(task.delivery_url) ? (
                <video src={task.delivery_url} className="h-full w-full object-cover" muted controls={false} />
              ) : (
                <img src={task.delivery_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          )}

          {/* Task info strip */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {task.task_type && (
              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
              </span>
            )}
            {task.client && (
              <span className="text-slate-400">{task.client.name}</span>
            )}
            {task.delivery_url && (
              <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
                <ExternalLink className="h-3 w-3" />Preview
              </a>
            )}
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Platforms</label>
            <div className="flex gap-2">
              {PLATFORMS.map(p => {
                const Icon = p.icon
                const active = selectedPlatforms.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all ${
                      active
                        ? `${p.bg} ${p.color} ring-1 ${p.ring}`
                        : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content type */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Content Type</label>
            <div className="flex gap-2">
              {CONTENT_TYPES.map(ct => {
                const Icon = ct.icon
                const active = contentType === ct.id
                return (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => setContentType(ct.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      active
                        ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                        : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{ct.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-400">Caption & Hashtags</label>
              <button
                type="button"
                onClick={generateCaption}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 transition-colors disabled:opacity-50"
              >
                {generating
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />
                }
                {generating ? 'Generating…' : 'AI Generate'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption and hashtags here, or use AI to generate…"
              rows={4}
              className="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-600 text-sm px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-600 mt-1">{caption.length} characters</p>
          </div>

          {/* Schedule date + time */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Scheduled Time</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="w-28 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 pb-5">
          <Button variant="ghost" onClick={onClose} className="flex-1 text-slate-400" disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !selectedPlatforms.length || !scheduledDate} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? 'Scheduling…' : `Schedule to ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Ready task card ──────────────────────────────────────────────────────────

function ReadyTaskCard({ task, onSchedule }: { task: ReadyTask; onSchedule: (t: ReadyTask) => void }) {
  const video = isVideo(task.delivery_url)
  return (
    <Card className="hover:border-slate-600 transition-colors overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-0">
          {/* Thumbnail */}
          <div className="w-24 sm:w-32 shrink-0 bg-slate-800/60 flex items-center justify-center relative overflow-hidden">
            {task.delivery_url ? (
              video ? (
                <>
                  <video src={task.delivery_url} className="absolute inset-0 w-full h-full object-cover" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <PlayCircle className="h-8 w-8 text-white/80" />
                  </div>
                </>
              ) : (
                <img src={task.delivery_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )
            ) : (
              <ImageIcon className="h-6 w-6 text-slate-600" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 flex items-center gap-4 min-w-0">
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-medium text-slate-100 truncate">{task.title}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {task.client && (
                  <span className="text-xs text-slate-400">{task.client.name}</span>
                )}
                {task.task_type && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                    {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                  </span>
                )}
                {!task.delivery_url && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> No media
                  </span>
                )}
              </div>
              {task.description && (
                <p className="text-xs text-slate-500 line-clamp-1">{task.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {task.delivery_url && (
                <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Button size="sm" onClick={() => onSchedule(task)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 whitespace-nowrap">
                <Send className="h-3.5 w-3.5" />
                Schedule
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Planned/Published post card ──────────────────────────────────────────────

function PostCard({ post, onCancel }: { post: ScheduledPost; onCancel: (id: string) => void }) {
  return (
    <Card className="hover:border-slate-600 transition-colors">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <PlatformBadge platform={post.platform} />
              <StatusBadge status={post.status} />
              {post.task?.title && (
                <span className="text-sm font-medium text-slate-200 truncate">{post.task.title}</span>
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
                <XCircle className="h-3.5 w-3.5 shrink-0" />{post.error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {post.task?.delivery_url && (
              <a href={post.task.delivery_url} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {post.status === 'pending' && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(post.id)}
                className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'ready' | 'planned' | 'published'

export default function PublishingHubPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [tab,           setTab]           = useState<Tab>('ready')
  const [readyTasks,    setReadyTasks]    = useState<ReadyTask[]>([])
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [loading,       setLoading]       = useState(true)
  const [scheduleTask,  setScheduleTask]  = useState<ReadyTask | null>(null)

  // Guard: admin or media_buyer only (publishing is their primary workflow)
  useEffect(() => {
    const client = getSupabaseClient()
    client.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      client.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          const allowed = ['admin', 'media_buyer']
          if (profile?.role && !allowed.includes(profile.role)) {
            router.replace('/team-portal')
          }
        })
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tasksRes, postsRes] = await Promise.all([
        fetch('/api/tasks?status=done&approval_status=admin_approved'),
        fetch('/api/social/scheduled-posts'),
      ])
      const [tasks, posts]: [ReadyTask[], ScheduledPost[]] = await Promise.all([
        tasksRes.ok  ? tasksRes.json()  : [],
        postsRes.ok  ? postsRes.json()  : [],
      ])

      // tasks ready to publish = admin_approved + not already scheduled (active)
      const scheduledTaskIds = new Set(
        posts.filter(p => p.task_id && p.status !== 'cancelled').map(p => p.task_id!)
      )
      const ready = tasks.filter(t => !scheduledTaskIds.has(t.id))

      setReadyTasks(ready)
      setScheduledPosts(posts)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function cancelPost(id: string) {
    const res = await fetch('/api/social/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toast('Post cancelled', 'success'); void load() }
    else toast('Failed to cancel', 'error')
  }

  const planned   = scheduledPosts.filter(p => p.status === 'pending')
  const published = scheduledPosts.filter(p => p.status === 'published')
  const failed    = scheduledPosts.filter(p => p.status === 'failed')

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'ready',     label: 'Ready to Publish', count: readyTasks.length },
    { id: 'planned',   label: 'Planned',           count: planned.length },
    { id: 'published', label: 'Published',          count: published.length },
  ]

  const tabContent = {
    ready:     readyTasks,
    planned,
    published,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Publishing Hub</h1>
          <p className="text-xs text-slate-500 mt-0.5">Schedule and manage social media posts</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-slate-400">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10"><Send className="h-4 w-4 text-indigo-400" /></div>
            <div>
              <p className="text-xs text-slate-400">Ready</p>
              <p className="text-xl font-bold text-slate-100">{readyTasks.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10"><Clock className="h-4 w-4 text-amber-400" /></div>
            <div>
              <p className="text-xs text-slate-400">Planned</p>
              <p className="text-xl font-bold text-slate-100">{planned.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-400" /></div>
            <div>
              <p className="text-xs text-slate-400">Published</p>
              <p className="text-xl font-bold text-slate-100">{published.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-400" /></div>
            <div>
              <p className="text-xs text-slate-400">Failed</p>
              <p className="text-xl font-bold text-slate-100">{failed.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t.id ? 'bg-indigo-600/40 text-indigo-300' : 'bg-slate-700/80 text-slate-400'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        </div>
      ) : tab === 'ready' ? (
        readyTasks.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-slate-700" />
              <p className="text-slate-400 text-sm font-medium">No tasks ready to publish</p>
              <p className="text-slate-600 text-xs mt-1">Approved tasks will appear here once the admin signs off</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {readyTasks.map(task => (
              <ReadyTaskCard key={task.id} task={task} onSchedule={setScheduleTask} />
            ))}
          </div>
        )
      ) : (
        // Planned / Published
        (() => {
          const list = tab === 'planned' ? planned : published
          return list.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-700" />
                <p className="text-slate-400 text-sm font-medium">
                  {tab === 'planned' ? 'No scheduled posts' : 'Nothing published yet'}
                </p>
                <p className="text-slate-600 text-xs mt-1">
                  {tab === 'planned' ? 'Schedule a post from the Ready to Publish tab' : 'Published posts will appear here'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {list.map(post => (
                <PostCard key={post.id} post={post} onCancel={cancelPost} />
              ))}
            </div>
          )
        })()
      )}

      {/* Schedule modal */}
      {scheduleTask && (
        <ScheduleModal
          task={scheduleTask}
          onClose={() => setScheduleTask(null)}
          onScheduled={load}
        />
      )}
    </div>
  )
}
