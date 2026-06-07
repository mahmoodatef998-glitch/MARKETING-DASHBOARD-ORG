'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Loader2, ArrowLeft, CheckCircle2, Clock, AlertTriangle,
  User, Mail, DollarSign, TrendingUp, CalendarDays, Target,
  Plus, X, ImagePlus, ExternalLink, Banknote, History,
} from 'lucide-react'
import { DonutChart } from '@/components/charts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberTask {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string
  task_type?: string
  revision_notes?: string
  assigned_to?: string
  client?: { name: string } | null
  updated_at: string
  created_at: string
}

interface MemberEarning {
  id: string
  amount: number
  currency: string
  created_at: string
  task?: { title: string; client?: { name: string } | null } | null
}

interface Payout {
  id: string
  member_id: string
  amount: number
  currency: string
  description?: string
  proof_url?: string
  paid_at: string
  created_at: string
}

interface MemberInfo {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  designer:    'bg-pink-500/20 text-pink-400 border-pink-500/30',
  ai_video:    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  media_buyer: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

const STATUS_BADGE: Record<string, string> = {
  todo:        'bg-slate-700 text-slate-300',
  in_progress: 'bg-blue-500/20 text-blue-400',
  review:      'bg-amber-500/20 text-amber-400',
  done:        'bg-green-500/20 text-green-400',
  overdue:     'bg-red-500/20 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', overdue: 'Overdue',
}

const PRIORITY_BADGE: Record<string, string> = {
  low:    'bg-slate-700 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high:   'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

function fmt(dateStr?: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(amount: number, currency = 'AED') {
  return `${amount.toLocaleString('en-AE', { minimumFractionDigits: 0 })} ${currency}`
}

function isOverdue(task: MemberTask): boolean {
  if (task.status === 'done') return false
  if (task.status === 'overdue') return true
  if (!task.due_date) return false
  return new Date(task.due_date) < new Date()
}

// Monthly bucketing
function byMonth(tasks: MemberTask[]): { label: string; done: number; total: number }[] {
  const now = new Date()
  const months: { label: string; done: number; total: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString('en-US', { month: 'short' })
    const inMonth = tasks.filter((t) => {
      const created = new Date(t.created_at)
      return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear()
    })
    months.push({ label, total: inMonth.length, done: inMonth.filter((t) => t.status === 'done').length })
  }
  return months
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────
function MonthlyBars({ data }: { data: { label: string; done: number; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1)
  return (
    <div className="flex items-end gap-2 h-20">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col justify-end" style={{ height: 64 }}>
            <div className="relative w-full rounded-t-md overflow-hidden" style={{ height: `${(d.total / max) * 64}px`, minHeight: d.total > 0 ? 4 : 0 }}>
              <div className="absolute inset-0 bg-slate-700 rounded-t-md" />
              <div className="absolute bottom-0 left-0 right-0 bg-indigo-500 rounded-t-md transition-all" style={{ height: `${d.total > 0 ? (d.done / d.total) * 100 : 0}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Image upload for payouts ─────────────────────────────────────────────────
function ProofUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Presign failed')
      const data = await presignRes.json()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', data.apiKey)
      fd.append('timestamp', String(data.timestamp))
      fd.append('signature', data.signature)
      fd.append('public_id', data.publicId)
      if (data.eager) fd.append('eager', data.eager)
      const upRes = await fetch(data.uploadUrl, { method: 'POST', body: fd })
      if (!upRes.ok) throw new Error('Upload failed')
      const uploaded = await upRes.json()
      onChange(uploaded.secure_url ?? data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
        <ImagePlus className="h-3.5 w-3.5 text-slate-400" /> Payment Proof <span className="text-slate-500 font-normal">(optional)</span>
      </label>
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
          <img src={value} alt="Proof" className="w-full max-h-36 object-contain" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </a>
            <button type="button" onClick={() => onChange('')}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs px-3 py-1.5 rounded-lg">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full border-2 border-dashed border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-60 rounded-xl py-5 flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-all">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-emerald-400" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs">{uploading ? 'Uploading…' : 'Upload transfer screenshot'}</span>
        </button>
      )}
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
    </div>
  )
}

// ─── Payout Modal ────────────────────────────────────────────────────────────
function PayoutModal({
  memberId, memberName, pendingAmount, currency,
  onSave, onClose,
}: {
  memberId: string
  memberName: string
  pendingAmount: number
  currency: string
  onSave: (payout: Payout) => void
  onClose: () => void
}) {
  const [amount,      setAmount]      = useState(String(pendingAmount > 0 ? pendingAmount : ''))
  const [description, setDescription] = useState('')
  const [proofUrl,    setProofUrl]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function handleSave() {
    const amt = Number(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    setError(null)
    const res = await fetch('/api/team-payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, amount: amt, currency, description, proof_url: proofUrl }),
    })
    if (res.ok) {
      const payout = await res.json()
      onSave(payout)
    } else {
      const err = await res.json().catch(() => ({}))
      setError(err.error ?? 'Failed to save payout')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Banknote className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Record Payout</p>
              <p className="text-xs text-slate-400">{memberName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {pendingAmount > 0 && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm">
              <span className="text-amber-300 font-medium">Pending amount</span>
              <span className="text-amber-400 font-bold">{fmtMoney(pendingAmount, currency)}</span>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Amount *</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="flex-1 bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors"
              />
              <span className="text-sm text-slate-400 font-medium px-2">{currency}</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Description <span className="text-slate-500 font-normal">(optional)</span></label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Designs for client X — June 2026"
              className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Proof upload */}
          <ProofUpload value={proofUrl} onChange={setProofUrl} />

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!amount || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamMemberDashboard() {
  const params  = useParams<{ id: string }>()
  const id      = params.id
  const router  = useRouter()

  const [member,   setMember]   = useState<MemberInfo | null>(null)
  const [tasks,    setTasks]    = useState<MemberTask[]>([])
  const [earnings, setEarnings] = useState<MemberEarning[]>([])
  const [payouts,  setPayouts]  = useState<Payout[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [showPayout, setShowPayout] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [teamRes, tasksRes, earningsRes, payoutsRes] = await Promise.all([
        fetch('/api/team'),
        fetch('/api/tasks?limit=500'),
        fetch(`/api/earnings?user_id=${id}`),
        fetch(`/api/team-payouts?member_id=${id}`),
      ])

      if (teamRes.ok) {
        const teamList: MemberInfo[] = await teamRes.json()
        setMember(Array.isArray(teamList) ? (teamList.find((m) => m.id === id) ?? null) : null)
      }
      if (tasksRes.ok) {
        const all: MemberTask[] = await tasksRes.json()
        setTasks(Array.isArray(all) ? all.filter((t) => t.assigned_to === id) : [])
      }
      if (earningsRes.ok) {
        const d: MemberEarning[] = await earningsRes.json()
        setEarnings(Array.isArray(d) ? d : [])
      }
      if (payoutsRes.ok) {
        const d: Payout[] = await payoutsRes.json()
        setPayouts(Array.isArray(d) ? d : [])
      }
    } catch (err) {
      setError('Failed to load member data.')
      console.error('[TeamMemberDashboard]', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (id) void load() }, [id])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const done        = tasks.filter((t) => t.status === 'done')
  const inProgress  = tasks.filter((t) => t.status === 'in_progress')
  const review      = tasks.filter((t) => t.status === 'review')
  const todo        = tasks.filter((t) => t.status === 'todo')
  const overdueList = tasks.filter(isOverdue)

  const doneOnTime  = done.filter((t) => !t.due_date || new Date(t.due_date) >= new Date(t.updated_at))
  const onTimeRate  = done.length > 0 ? Math.round((doneOnTime.length / done.length) * 100) : null
  const revisionCount = tasks.filter((t) => !!t.revision_notes).length
  const revisionRate  = tasks.length > 0 ? Math.round((revisionCount / tasks.length) * 100) : null

  const totalEarned    = earnings.reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalPaidOut   = payouts.reduce((s, p) => s + (p.amount ?? 0), 0)
  const pendingAmount  = Math.max(0, totalEarned - totalPaidOut)
  const currency       = earnings[0]?.currency ?? payouts[0]?.currency ?? 'AED'

  const monthlyData = byMonth(tasks)

  const donutSegments = [
    { label: 'Done',        value: done.length,       color: '#22c55e' },
    { label: 'In Progress', value: inProgress.length,  color: '#3b82f6' },
    { label: 'Review',      value: review.length,      color: '#f59e0b' },
    { label: 'To Do',       value: todo.length,        color: '#64748b' },
    { label: 'Overdue',     value: overdueList.length, color: '#ef4444' },
  ]

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-slate-400 text-sm">{error}</p>
        <button onClick={() => router.back()} className="text-indigo-400 text-sm hover:underline">← Go back</button>
      </div>
    )
  }

  const displayName  = member?.name ?? `Member ${id.slice(0, 8)}`
  const displayEmail = member?.email ?? '—'
  const displayRole  = member?.role ?? 'unknown'

  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-6">

      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-100 text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Team
      </button>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-lg shadow-indigo-500/20">
              {member?.name ? initials(displayName) : <User className="h-7 w-7" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-white">{displayName}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${ROLE_COLORS[displayRole] ?? 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {ROLE_LABELS[displayRole] ?? displayRole}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  member?.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {member?.status ?? 'unknown'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{displayEmail}</span>
                {member?.created_at && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> Joined {fmt(member.created_at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Payout button */}
          <button
            onClick={() => setShowPayout(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/30">
            <Banknote className="h-4 w-4" /> Record Payout
          </button>
        </div>
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks',  value: tasks.length,       color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: Target },
          { label: 'Completed',    value: done.length,        color: 'text-green-400',  bg: 'bg-green-500/10',  icon: CheckCircle2 },
          { label: 'In Progress',  value: inProgress.length,  color: 'text-blue-400',   bg: 'bg-blue-500/10',   icon: Clock },
          { label: 'Overdue',      value: overdueList.length, color: 'text-red-400',    bg: 'bg-red-500/10',    icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut — status distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Task Status Distribution</h2>
          <div className="flex items-center gap-6">
            <DonutChart segments={donutSegments} size={120} />
            <div className="space-y-2 flex-1">
              {donutSegments.filter(s => s.value > 0).map((s) => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-400">{s.label}</span>
                  </div>
                  <span className="font-semibold text-slate-200">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Monthly Activity</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> Done</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-700 inline-block" /> Total</span>
            </div>
          </div>
          <MonthlyBars data={monthlyData} />
        </div>
      </div>

      {/* ── Performance metrics ────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" /> Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'On-time Rate',
              value: onTimeRate !== null ? `${onTimeRate}%` : 'N/A',
              color: onTimeRate === null ? 'text-slate-500' : onTimeRate >= 70 ? 'text-green-400' : onTimeRate >= 40 ? 'text-amber-400' : 'text-red-400',
            },
            {
              label: 'Revision Rate',
              value: revisionRate !== null ? `${revisionRate}%` : 'N/A',
              color: revisionRate === null ? 'text-slate-500' : revisionRate <= 20 ? 'text-green-400' : revisionRate <= 40 ? 'text-amber-400' : 'text-red-400',
            },
            {
              label: 'Completion Rate',
              value: tasks.length > 0 ? `${Math.round((done.length / tasks.length) * 100)}%` : 'N/A',
              color: tasks.length === 0 ? 'text-slate-500' : (done.length / tasks.length) >= 0.7 ? 'text-green-400' : 'text-amber-400',
            },
            {
              label: 'In Review',
              value: review.length,
              color: 'text-amber-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Earnings & Payouts ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Summary cards */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Total Earned
            </p>
            <p className="text-3xl font-extrabold text-green-400">{fmtMoney(totalEarned, currency)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Pending Payout
            </p>
            <p className={`text-3xl font-extrabold ${pendingAmount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {fmtMoney(pendingAmount, currency)}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Total Paid Out
            </p>
            <p className="text-3xl font-extrabold text-indigo-400">{fmtMoney(totalPaidOut, currency)}</p>
          </div>
        </div>

        {/* Payout history */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" /> Payout History
            </h2>
            <button onClick={() => setShowPayout(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-medium transition-colors border border-emerald-500/20">
              <Plus className="h-3.5 w-3.5" /> New Payout
            </button>
          </div>
          {payouts.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">No payouts recorded yet.</div>
          ) : (
            <ul className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
              {payouts.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium">{p.description ?? 'Payout'}</p>
                    <p className="text-xs text-slate-500">{fmt(p.paid_at)}</p>
                  </div>
                  {p.proof_url && (
                    <a href={p.proof_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors" title="View proof">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <span className="shrink-0 text-sm font-bold text-emerald-400">
                    {fmtMoney(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Recent Tasks ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" /> Recent Tasks
          </h2>
        </div>
        {recentTasks.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No tasks assigned.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {recentTasks.map((t) => (
              <li key={t.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate font-medium">{t.title}</p>
                  {t.client?.name && <p className="text-xs text-slate-500 truncate">{t.client.name}</p>}
                </div>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${PRIORITY_BADGE[t.priority] ?? ''}`}>
                  {t.priority}
                </span>
                <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[t.status] ?? ''}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
                <span className={`shrink-0 text-xs w-24 text-right ${isOverdue(t) ? 'text-red-400' : 'text-slate-500'}`}>
                  {t.due_date ? fmt(t.due_date) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Payout Modal */}
      {showPayout && (
        <PayoutModal
          memberId={id}
          memberName={displayName}
          pendingAmount={pendingAmount}
          currency={currency}
          onSave={(payout) => {
            setPayouts(prev => [payout, ...prev])
            setShowPayout(false)
          }}
          onClose={() => setShowPayout(false)}
        />
      )}
    </div>
  )
}
