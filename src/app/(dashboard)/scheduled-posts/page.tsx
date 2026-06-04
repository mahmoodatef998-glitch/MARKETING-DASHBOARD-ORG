'use client'
import { useEffect, useState } from 'react'
import { Calendar, Camera, Globe, Music2, Clock, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

interface ScheduledPost {
  id: string
  task_id: string | null
  platform: string
  scheduled_at: string
  caption: string | null
  status: string
  error: string | null
  attempts: number
  created_at: string
  task?: { id: string; title: string; delivery_url: string | null } | null
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  instagram: { label: 'Instagram', icon: Camera, color: 'text-pink-400',  bg: 'bg-pink-500/10 border-pink-500/20' },
  facebook:  { label: 'Facebook',  icon: Globe,  color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/20' },
  tiktok:    { label: 'TikTok',    icon: Music2, color: 'text-slate-300', bg: 'bg-slate-700/60 border-slate-600/30' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Scheduled',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',   icon: Clock },
  published: { label: 'Published',  color: 'text-green-400 bg-green-500/10 border-green-500/20',   icon: CheckCircle2 },
  failed:    { label: 'Failed',     color: 'text-red-400 bg-red-500/10 border-red-500/20',         icon: XCircle },
  cancelled: { label: 'Cancelled',  color: 'text-slate-400 bg-slate-700/40 border-slate-600/30',   icon: XCircle },
}

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform]
  if (!meta) return <span className="text-xs text-slate-500">{platform}</span>
  const Icon = meta.icon
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${meta.bg} ${meta.color}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  )
}

export default function ScheduledPostsPage() {
  const { toast } = useToast()
  const [posts,    setPosts]    = useState<ScheduledPost[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<string>('all')

  async function load() {
    const res = await fetch('/api/social/scheduled-posts')
    if (res.ok) setPosts(await res.json())
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function cancel(id: string) {
    const res = await fetch('/api/social/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toast('Post cancelled', 'success'); load() }
    else toast('Failed to cancel', 'error')
  }

  const statuses = ['all', 'pending', 'published', 'failed', 'cancelled']
  const filtered = posts.filter(p => filter === 'all' || p.status === filter)

  const counts = {
    pending:   posts.filter(p => p.status === 'pending').length,
    published: posts.filter(p => p.status === 'published').length,
    failed:    posts.filter(p => p.status === 'failed').length,
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="h-4 w-4 text-amber-400" /></div>
            <div><p className="text-xs text-slate-400">Scheduled</p><p className="text-xl font-bold text-slate-100">{counts.pending}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-400" /></div>
            <div><p className="text-xs text-slate-400">Published</p><p className="text-xl font-bold text-slate-100">{counts.published}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-400" /></div>
            <div><p className="text-xs text-slate-400">Failed</p><p className="text-xl font-bold text-slate-100">{counts.failed}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-slate-400">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500 text-sm">No scheduled posts yet</p>
            <p className="text-slate-600 text-xs mt-1">Posts are created when a Media Buyer marks a task done and schedules it</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => (
            <Card key={post.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Title + task link */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlatformBadge platform={post.platform} />
                      <StatusBadge status={post.status} />
                      {post.task?.title && (
                        <span className="text-sm font-medium text-slate-200 truncate">{post.task.title}</span>
                      )}
                    </div>

                    {/* Schedule time */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(post.scheduled_at).toLocaleString([], {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>

                    {/* Caption */}
                    {post.caption && (
                      <p className="text-xs text-slate-400 line-clamp-2 bg-slate-800/40 rounded-lg px-3 py-2">
                        {post.caption}
                      </p>
                    )}

                    {/* Error */}
                    {post.error && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5 shrink-0" /> {post.error}
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
                      <Button size="sm" variant="ghost" onClick={() => cancel(post.id)}
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
