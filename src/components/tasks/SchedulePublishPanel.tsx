'use client'
import React, { useEffect, useState } from 'react'
import { Calendar, Camera, Globe, Music2, Clock, CheckCircle2, X, Loader2, AlertTriangle, ExternalLink } from 'lucide-react'

interface ScheduledPost {
  id:               string
  platform:         string
  scheduled_at:     string
  caption:          string | null
  status:           string
  platform_post_id: string | null
  error:            string | null
}

type PlatformMeta = { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
const PLATFORM_META: Record<string, PlatformMeta> = {
  instagram: { label: 'Instagram', icon: Camera, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  facebook:  { label: 'Facebook',  icon: Globe,  color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  tiktok:    { label: 'TikTok',    icon: Music2, color: 'text-slate-300 bg-slate-700/50 border-slate-600/30' },
}

const STATUS_STYLE: Record<string, string> = {
  pending:    'text-amber-400 bg-amber-500/10',
  publishing: 'text-blue-400 bg-blue-500/10',
  published:  'text-emerald-400 bg-emerald-500/10',
  failed:     'text-red-400 bg-red-500/10',
  cancelled:  'text-slate-500 bg-slate-800',
}

export default function SchedulePublishPanel({ taskId, hasDelivery }: { taskId: string; hasDelivery: boolean }) {
  const [posts,       setPosts]       = useState<ScheduledPost[]>([])
  const [connections, setConnections] = useState<{ platform: string }[]>([])
  const [open,        setOpen]        = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [caption,     setCaption]     = useState('')
  const [platforms,   setPlatforms]   = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  async function load() {
    const [postsRes, connRes] = await Promise.all([
      fetch(`/api/social/scheduled-posts?taskId=${taskId}`),
      fetch('/api/social/connections'),
    ])
    if (postsRes.ok) setPosts(await postsRes.json())
    if (connRes.ok) setConnections(await connRes.json())
    setLoading(false)
  }

  useEffect(() => { void load() }, [taskId])

  async function handleSchedule() {
    if (!scheduledAt || platforms.length === 0) return
    setSaving(true)
    await fetch('/api/social/scheduled-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, platform: platforms, scheduled_at: scheduledAt, caption }),
    })
    setOpen(false)
    setScheduledAt('')
    setCaption('')
    setPlatforms([])
    await load()
    setSaving(false)
  }

  async function handleCancel(id: string) {
    await fetch('/api/social/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const availablePlatforms = connections.filter(c => PLATFORM_META[c.platform])
  const pendingPosts        = posts.filter(p => p.status === 'pending' || p.status === 'publishing')
  const completedPosts      = posts.filter(p => p.status === 'published' || p.status === 'failed')

  if (loading) return <div className="h-6 bg-slate-800/50 rounded animate-pulse" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Calendar className="h-3.5 w-3.5" /> Schedule Publishing
        </p>
        {availablePlatforms.length > 0 && hasDelivery && (
          <button onClick={() => setOpen(o => !o)}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 font-semibold border border-indigo-500/20 transition-colors">
            + Schedule
          </button>
        )}
      </div>

      {!hasDelivery && (
        <p className="text-xs text-slate-500 bg-slate-800/40 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          Add a delivery file/link first before scheduling a post.
        </p>
      )}

      {hasDelivery && availablePlatforms.length === 0 && (
        <p className="text-xs text-slate-500 bg-slate-800/40 rounded-xl px-3 py-2.5">
          No social accounts connected yet.{' '}
          <a href="/settings" className="text-indigo-400 hover:text-indigo-300 underline">Connect in Settings →</a>
        </p>
      )}

      {/* Schedule form */}
      {open && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
          {/* Platform selector */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 font-medium">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map(conn => {
                const meta = PLATFORM_META[conn.platform]
                const Icon = meta.icon
                const active = platforms.includes(conn.platform)
                return (
                  <button key={conn.platform} type="button" onClick={() => togglePlatform(conn.platform)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      active ? meta.color : 'text-slate-500 bg-transparent border-slate-700 hover:border-slate-500'
                    }`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                    {active && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date-time */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Publish Time
            </p>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors"
            />
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 font-medium">Caption</p>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your post caption here…"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none resize-none transition-colors"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} type="button"
              className="flex-1 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors">
              Cancel
            </button>
            <button onClick={handleSchedule} disabled={saving || !scheduledAt || platforms.length === 0} type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scheduling…</> : <><Calendar className="h-3.5 w-3.5" /> Schedule Post</>}
            </button>
          </div>
        </div>
      )}

      {/* Pending / active posts */}
      {pendingPosts.length > 0 && (
        <div className="space-y-2">
          {pendingPosts.map(post => {
            const meta = PLATFORM_META[post.platform] ?? { label: post.platform, icon: Calendar, color: 'text-slate-400' }
            const Icon = meta.icon
            return (
              <div key={post.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                <Icon className={`h-4 w-4 shrink-0 ${meta.color.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200">{meta.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[post.status] ?? ''}`}>
                  {post.status}
                </span>
                {post.status === 'pending' && (
                  <button onClick={() => handleCancel(post.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors ml-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Published / failed history */}
      {completedPosts.length > 0 && (
        <div className="space-y-1.5">
          {completedPosts.map(post => {
            const meta = PLATFORM_META[post.platform] ?? { label: post.platform, icon: Calendar, color: 'text-slate-400' }
            const Icon = meta.icon
            return (
              <div key={post.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">{meta.label}</p>
                  {post.error && <p className="text-[11px] text-red-400 mt-0.5 truncate">{post.error}</p>}
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[post.status] ?? ''}`}>
                  {post.status}
                </span>
                {post.platform_post_id && (
                  <a href={`https://www.instagram.com/p/${post.platform_post_id}`} target="_blank" rel="noopener noreferrer"
                    className="text-slate-500 hover:text-slate-300 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
