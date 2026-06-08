'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Megaphone, Plus, X, Loader2, Calendar, Target, DollarSign,
  Camera, Globe, Music2, CheckCircle2, Clock, PauseCircle,
  FileEdit, Trash2, ChevronRight, Users, TrendingUp, Send,
  AlertCircle, Eye,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client { id: string; name: string }

interface CampaignPost {
  id: string
  status: string
  platform: string
  scheduled_at: string
  caption: string | null
  content_type: string
  published_at: string | null
  task?: { id: string; title: string; delivery_url: string | null } | null
}

interface Campaign {
  id: string
  client_id: string
  name: string
  description: string | null
  goal: string | null
  platforms: string[]
  start_date: string
  end_date: string
  budget: number | null
  currency: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  created_at: string
  client?: { id: string; name: string } | null
  creator?: { id: string; display_name: string } | null
  posts?: CampaignPost[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GOALS = [
  { id: 'awareness',  label: 'Brand Awareness' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'leads',      label: 'Lead Generation' },
  { id: 'sales',      label: 'Sales' },
  { id: 'retention',  label: 'Client Retention' },
  { id: 'custom',     label: 'Custom' },
]

const PLATFORM_CFG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  instagram: { label: 'Instagram', icon: Camera, color: 'text-pink-400',  bg: 'bg-pink-500/15 border-pink-500/25' },
  facebook:  { label: 'Facebook',  icon: Globe,  color: 'text-blue-400',  bg: 'bg-blue-500/15 border-blue-500/25' },
  tiktok:    { label: 'TikTok',    icon: Music2, color: 'text-slate-300', bg: 'bg-slate-700/50 border-slate-600/30' },
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'text-slate-400 bg-slate-700/50 border-slate-600',     icon: FileEdit },
  active:    { label: 'Active',    color: 'text-green-400 bg-green-500/10 border-green-500/25',  icon: TrendingUp },
  paused:    { label: 'Paused',    color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',  icon: PauseCircle },
  completed: { label: 'Completed', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25', icon: CheckCircle2 },
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysLeft(end: string) {
  const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)
  return diff
}

// ─── Campaign Form Modal ──────────────────────────────────────────────────────

function CampaignModal({
  clients,
  initial,
  onClose,
  onSave,
}: {
  clients: Client[]
  initial?: Campaign | null
  onClose: () => void
  onSave: (data: Partial<Campaign>) => Promise<void>
}) {
  const [form, setForm] = useState({
    name:        initial?.name        ?? '',
    client_id:   initial?.client_id   ?? (clients[0]?.id ?? ''),
    description: initial?.description ?? '',
    goal:        initial?.goal        ?? '',
    platforms:   initial?.platforms   ?? [] as string[],
    start_date:  initial?.start_date  ?? '',
    end_date:    initial?.end_date    ?? '',
    budget:      initial?.budget?.toString() ?? '',
    currency:    initial?.currency    ?? 'USD',
    status:      initial?.status      ?? 'draft' as Campaign['status'],
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function togglePlatform(p: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p)
        ? f.platforms.filter(x => x !== p)
        : [...f.platforms, p],
    }))
  }

  async function submit() {
    if (!form.name.trim())    { setErr('Campaign name is required'); return }
    if (!form.client_id)      { setErr('Select a client'); return }
    if (!form.start_date)     { setErr('Start date is required'); return }
    if (!form.end_date)       { setErr('End date is required'); return }
    if (form.platforms.length === 0) { setErr('Select at least one platform'); return }
    if (form.start_date > form.end_date) { setErr('End date must be after start date'); return }

    setSaving(true)
    setErr('')
    try {
      await onSave({
        ...form,
        budget: form.budget ? Number(form.budget) : undefined,
      })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold text-white">{initial ? 'Edit Campaign' : 'New Campaign'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Campaign Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ramadan 2025 Campaign"
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Client *</label>
            <select
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors cursor-pointer"
            >
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Start Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">End Date *</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors"
              />
            </div>
          </div>

          {/* Platforms */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Platforms *</label>
            <div className="flex gap-2">
              {Object.entries(PLATFORM_CFG).map(([key, cfg]) => {
                const Icon = cfg.icon
                const active = form.platforms.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePlatform(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      active ? `${cfg.bg} ${cfg.color}` : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Campaign Goal</label>
            <select
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors cursor-pointer"
            >
              <option value="">— Select goal —</option>
              {GOALS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Budget (optional)</label>
            <div className="flex gap-2">
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors cursor-pointer"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                min="0"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="0.00"
                className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Campaign['status'] }))}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors cursor-pointer"
            >
              {Object.entries(STATUS_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Description / Notes</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Campaign strategy, target audience, key messages…"
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold transition-colors">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {initial ? 'Update' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Detail Panel ────────────────────────────────────────────────────

function CampaignDetail({ id, onClose, onEdit, onDelete }: {
  id: string
  onClose: () => void
  onEdit: (c: Campaign) => void
  onDelete: (id: string) => void
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/campaigns/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setCampaign(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!confirm('Delete this campaign? Posts will be unlinked but not deleted.')) return
    setDeleting(true)
    const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    if (res.ok) onDelete(id)
  }

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
    </div>
  )

  if (!campaign) return null

  const s = STATUS_CFG[campaign.status]
  const StatusIcon = s.icon
  const posts = campaign.posts ?? []
  const published = posts.filter(p => p.status === 'published').length
  const planned   = posts.filter(p => p.status === 'pending').length
  const failed    = posts.filter(p => p.status === 'failed').length
  const progress  = posts.length > 0 ? Math.round((published / posts.length) * 100) : 0
  const days      = daysLeft(campaign.end_date)
  const goal      = GOALS.find(g => g.id === campaign.goal)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>
                <StatusIcon className="h-3 w-3" />{s.label}
              </span>
              {campaign.client && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Users className="h-3 w-3" />{campaign.client.name}
                </span>
              )}
            </div>
            <h2 className="font-bold text-white text-lg leading-tight">{campaign.name}</h2>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button onClick={() => onEdit(campaign)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <FileEdit className="h-4 w-4" />
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Posts', value: posts.length, icon: Send,         color: 'text-indigo-400' },
              { label: 'Published',   value: published,    icon: CheckCircle2, color: 'text-green-400' },
              { label: 'Planned',     value: planned,      icon: Clock,        color: 'text-amber-400' },
              { label: 'Failed',      value: failed,       icon: AlertCircle,  color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[11px] text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {posts.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Campaign Progress</span>
                <span className="text-slate-300 font-semibold">{progress}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/40 rounded-xl p-3 space-y-0.5">
              <p className="text-[11px] text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> Duration</p>
              <p className="text-sm text-white font-medium">{fmt(campaign.start_date)} → {fmt(campaign.end_date)}</p>
              {days > 0
                ? <p className="text-xs text-indigo-400">{days} days remaining</p>
                : days === 0
                  ? <p className="text-xs text-amber-400">Ends today</p>
                  : <p className="text-xs text-slate-500">Ended {Math.abs(days)} days ago</p>
              }
            </div>
            {campaign.budget && (
              <div className="bg-slate-800/40 rounded-xl p-3 space-y-0.5">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Budget</p>
                <p className="text-sm text-white font-medium">{campaign.budget.toLocaleString()} {campaign.currency}</p>
              </div>
            )}
            {goal && (
              <div className="bg-slate-800/40 rounded-xl p-3 space-y-0.5">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><Target className="h-3 w-3" /> Goal</p>
                <p className="text-sm text-white font-medium">{goal.label}</p>
              </div>
            )}
            {campaign.platforms.length > 0 && (
              <div className="bg-slate-800/40 rounded-xl p-3 space-y-1">
                <p className="text-[11px] text-slate-500">Platforms</p>
                <div className="flex gap-1.5 flex-wrap">
                  {campaign.platforms.map(p => {
                    const cfg = PLATFORM_CFG[p]
                    if (!cfg) return null
                    const Icon = cfg.icon
                    return (
                      <span key={p} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {campaign.description && (
            <div className="bg-slate-800/40 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 mb-1">Description</p>
              <p className="text-sm text-slate-300 leading-relaxed">{campaign.description}</p>
            </div>
          )}

          {/* Posts list */}
          {posts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scheduled Posts</p>
              <div className="space-y-2">
                {posts.map(post => {
                  const pcfg = PLATFORM_CFG[post.platform]
                  const PIcon = pcfg?.icon ?? Send
                  const isPublished = post.status === 'published'
                  const isFailed    = post.status === 'failed'
                  return (
                    <div key={post.id}
                      className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5 border border-slate-700/40">
                      <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${pcfg?.bg ?? ''} ${pcfg?.color ?? 'text-slate-400'}`}>
                        <PIcon className="h-3 w-3" />{pcfg?.label ?? post.platform}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 truncate">{post.task?.title ?? 'Post'}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(post.scheduled_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                        </p>
                      </div>
                      <span className={`text-[11px] font-medium shrink-0 ${isPublished ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-amber-400'}`}>
                        {isPublished ? '✓ Published' : isFailed ? '✗ Failed' : '⏳ Planned'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const s    = STATUS_CFG[campaign.status]
  const SI   = s.icon
  const posts = campaign.posts ?? []
  const published = posts.filter(p => p.status === 'published').length
  const progress  = posts.length > 0 ? Math.round((published / posts.length) * 100) : 0
  const days      = daysLeft(campaign.end_date)

  return (
    <div
      onClick={onClick}
      className="group bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/40 rounded-2xl p-4 cursor-pointer transition-all hover:bg-slate-800/60 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight truncate">{campaign.name}</p>
          {campaign.client && (
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Users className="h-3 w-3" />{campaign.client.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>
            <SI className="h-3 w-3" />{s.label}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {fmt(campaign.start_date)} → {fmt(campaign.end_date)}
        </span>
        {days > 0 && campaign.status === 'active' && (
          <span className="text-indigo-400">{days}d left</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {campaign.platforms.map(p => {
          const cfg = PLATFORM_CFG[p]
          if (!cfg) return null
          const Icon = cfg.icon
          return (
            <span key={p} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
              <Icon className="h-3 w-3" />
            </span>
          )
        })}
        {campaign.goal && (
          <span className="text-[11px] flex items-center gap-1 text-slate-500">
            <Target className="h-3 w-3" />
            {GOALS.find(g => g.id === campaign.goal)?.label}
          </span>
        )}
        {campaign.budget && (
          <span className="text-[11px] flex items-center gap-1 text-slate-500">
            <DollarSign className="h-3 w-3" />
            {campaign.budget.toLocaleString()} {campaign.currency}
          </span>
        )}
      </div>

      {posts.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{published}/{posts.length} posts published</span>
            <span className="text-slate-400 font-medium">{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns,    setCampaigns]    = useState<Campaign[]>([])
  const [clients,      setClients]      = useState<Client[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState<Campaign | null>(null)
  const [detailId,     setDetailId]     = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Role guard
  useEffect(() => {
    const client = getSupabaseClient()
    client.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      client.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          if (profile?.role && !['admin', 'media_buyer'].includes(profile.role)) {
            router.replace('/dashboard')
          }
        })
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterClient) params.set('client_id', filterClient)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/campaigns?${params}`)
      if (res.ok) setCampaigns(await res.json())
    } finally {
      setLoading(false)
    }
  }, [filterClient, filterStatus])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : [])
      .then(d => setClients(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  async function handleSave(data: Partial<Campaign>) {
    if (editTarget) {
      const res = await fetch(`/api/campaigns/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update')
    } else {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create')
    }
    await load()
  }

  const statusCounts = {
    draft:     campaigns.filter(c => c.status === 'draft').length,
    active:    campaigns.filter(c => c.status === 'active').length,
    paused:    campaigns.filter(c => c.status === 'paused').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-indigo-400" /> Campaigns
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Full campaign plans per client</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(statusCounts) as [Campaign['status'], number][]).map(([key, count]) => {
          const cfg  = STATUS_CFG[key]
          const Icon = cfg.icon
          return (
            <Card key={key} className="cursor-pointer" onClick={() => setFilterStatus(filterStatus === key ? '' : key)}>
              <CardContent className="pt-3 pb-3 flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${cfg.color.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-slate-700'}`}>
                  <Icon className={`h-4 w-4 ${cfg.color.split(' ')[0]}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-400">{cfg.label}</p>
                  <p className="text-xl font-bold text-slate-100">{count}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterClient}
          onChange={e => setFilterClient(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
        >
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="p-4 rounded-2xl bg-slate-800/60">
            <Megaphone className="h-10 w-10 text-slate-600" />
          </div>
          <p className="text-slate-400 text-sm font-medium">No campaigns yet</p>
          <p className="text-slate-600 text-xs">Create your first campaign plan for a client</p>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true) }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors mt-2"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} onClick={() => setDetailId(c.id)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <CampaignModal
          clients={clients}
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSave={handleSave}
        />
      )}

      {detailId && (
        <CampaignDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); setEditTarget(c); setShowModal(true) }}
          onDelete={(id) => {
            setCampaigns(prev => prev.filter(c => c.id !== id))
            setDetailId(null)
          }}
        />
      )}
    </div>
  )
}
