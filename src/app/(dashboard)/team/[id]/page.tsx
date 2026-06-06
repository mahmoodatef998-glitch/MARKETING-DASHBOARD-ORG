'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Loader2, ArrowLeft, CheckCircle2, Clock, AlertTriangle,
  BarChart2, User, Mail, DollarSign, TrendingUp,
} from 'lucide-react'

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
}

interface MemberEarning {
  id: string
  amount: number
  currency: string
  created_at: string
  task?: { title: string; client?: { name: string } | null } | null
}

interface MemberInfo {
  id: string
  name: string
  email: string
  role: string
  status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/20 text-purple-400',
  designer:    'bg-pink-500/20 text-pink-400',
  ai_video:    'bg-cyan-500/20 text-cyan-400',
  media_buyer: 'bg-orange-500/20 text-orange-400',
}

const STATUS_BADGE: Record<string, string> = {
  todo:        'bg-slate-700 text-slate-300',
  in_progress: 'bg-blue-500/20 text-blue-400',
  review:      'bg-amber-500/20 text-amber-400',
  done:        'bg-green-500/20 text-green-400',
  overdue:     'bg-red-500/20 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  review:      'Review',
  done:        'Done',
  overdue:     'Overdue',
}

const PRIORITY_BADGE: Record<string, string> = {
  low:    'bg-slate-700 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high:   'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function fmt(dateStr?: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function isOverdue(task: MemberTask): boolean {
  if (task.status === 'done') return false
  if (task.status === 'overdue') return true
  if (!task.due_date) return false
  return new Date(task.due_date) < new Date()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, color = 'text-white', icon: Icon,
}: {
  label: string
  value: number
  color?: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
      </div>
    </div>
  )
}

function PctBox({
  label, value, icon: Icon,
}: {
  label: string
  value: number | null
  icon: React.ElementType
}) {
  const color =
    value === null ? 'text-slate-500'
    : value >= 70   ? 'text-green-400'
    : value >= 40   ? 'text-amber-400'
    : 'text-red-400'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${color}`}>
        {value === null ? 'N/A' : `${value}%`}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamMemberPage() {
  const params  = useParams<{ id: string }>()
  const id      = params.id
  const router  = useRouter()

  const [member,   setMember]   = useState<MemberInfo | null>(null)
  const [tasks,    setTasks]    = useState<MemberTask[]>([])
  const [earnings, setEarnings] = useState<MemberEarning[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [teamRes, tasksRes, earningsRes] = await Promise.all([
          fetch('/api/team'),
          fetch('/api/tasks?limit=500'),
          fetch(`/api/earnings?user_id=${id}`),
        ])

        // Member info
        if (teamRes.ok) {
          const teamList: MemberInfo[] = await teamRes.json()
          const found = Array.isArray(teamList)
            ? teamList.find((m) => m.id === id) ?? null
            : null
          setMember(found)
        }

        // Tasks — filter by assigned_to === id
        if (tasksRes.ok) {
          const allTasks: MemberTask[] = await tasksRes.json()
          const filtered = Array.isArray(allTasks)
            ? allTasks.filter((t) => t.assigned_to === id)
            : []
          setTasks(filtered)
        }

        // Earnings
        if (earningsRes.ok) {
          const earningsData: MemberEarning[] = await earningsRes.json()
          setEarnings(Array.isArray(earningsData) ? earningsData : [])
        }
      } catch (err) {
        setError('Failed to load member data.')
        console.error('[TeamMemberPage]', err)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalTasks     = tasks.length
  const doneTasks      = tasks.filter((t) => t.status === 'done')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const overdueTasks   = tasks.filter(isOverdue)

  // On-time rate: done tasks that were NOT overdue
  const doneOnTime = doneTasks.filter((t) => {
    if (!t.due_date) return true // no due date → assume on time
    return new Date(t.due_date) >= new Date(t.updated_at)
  })
  const onTimeRate = doneTasks.length > 0
    ? Math.round((doneOnTime.length / doneTasks.length) * 100)
    : null

  // Revision rate: tasks with revision_notes / total
  const revisionCount = tasks.filter((t) => !!t.revision_notes).length
  const revisionRate  = totalTasks > 0
    ? Math.round((revisionCount / totalTasks) * 100)
    : null

  // Earnings total
  const totalEarned = earnings.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // Show earnings section?
  const showEarnings = member?.role === 'designer' || earnings.length > 0

  // Recent 10 tasks ordered by updated_at desc
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10)

  // ── Render: Loading ────────────────────────────────────────────────────────

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
        <button onClick={() => router.back()} className="text-indigo-400 text-sm hover:underline">
          ← Go back
        </button>
      </div>
    )
  }

  // ── Display name fallback ──────────────────────────────────────────────────
  const displayName  = member?.name ?? `Member ${id.slice(0, 8)}`
  const displayEmail = member?.email ?? '—'
  const displayRole  = member?.role ?? 'unknown'
  const displayStatus = member?.status ?? 'unknown'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-16">
      {/* Back button */}
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-100 text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </button>

        {/* ── Member header card ──────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {displayName !== `Member ${id.slice(0, 8)}`
                ? initials(displayName)
                : <User className="h-7 w-7" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-white truncate">{displayName}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[displayRole] ?? 'bg-slate-700 text-slate-400'}`}>
                  {ROLE_LABELS[displayRole] ?? displayRole}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  displayStatus === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {displayStatus}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{displayEmail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Task Stats ──────────────────────────────────────────────────── */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4" /> Task Stats
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Tasks"  value={totalTasks}          icon={CheckCircle2} color="text-indigo-400" />
            <StatCard label="Completed"    value={doneTasks.length}    icon={CheckCircle2} color="text-green-400" />
            <StatCard label="In Progress"  value={inProgressTasks.length} icon={Clock}    color="text-blue-400" />
            <StatCard label="Overdue"      value={overdueTasks.length} icon={AlertTriangle} color="text-red-400" />
          </div>
        </section>

        {/* ── Performance metrics ─────────────────────────────────────────── */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Performance
          </h2>
          <div className="flex gap-4">
            <PctBox label="On-time Rate"   value={onTimeRate}   icon={CheckCircle2} />
            <PctBox label="Revision Rate"  value={revisionRate} icon={AlertTriangle} />
          </div>
        </section>

        {/* ── Earnings ────────────────────────────────────────────────────── */}
        {showEarnings && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Earnings
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              {/* Total */}
              <div className="mb-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Earned</p>
                <p className="text-4xl font-extrabold text-green-400">
                  {totalEarned.toLocaleString('en-AE', { minimumFractionDigits: 0 })} AED
                </p>
              </div>

              {/* List */}
              {earnings.length === 0 ? (
                <p className="text-slate-500 text-sm italic">No approved design tasks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {earnings.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">
                          {e.task?.title ?? 'Design task'}
                        </p>
                        {e.task?.client?.name && (
                          <p className="text-xs text-slate-500">{e.task.client.name}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
                        {e.amount} {e.currency ?? 'AED'}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 w-24 text-right">
                        {fmt(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ── Recent Tasks ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Recent Tasks
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {recentTasks.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500 text-sm">
                No tasks assigned to this member.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {recentTasks.map((t) => (
                  <li key={t.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/40 transition-colors">
                    {/* Title + client */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate font-medium">{t.title}</p>
                      {t.client?.name && (
                        <p className="text-xs text-slate-500 truncate">{t.client.name}</p>
                      )}
                    </div>

                    {/* Priority chip */}
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${PRIORITY_BADGE[t.priority] ?? 'bg-slate-700 text-slate-400'}`}>
                      {t.priority}
                    </span>

                    {/* Status badge */}
                    <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[t.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>

                    {/* Due date */}
                    <span className={`shrink-0 text-xs w-24 text-right ${
                      isOverdue(t) ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {t.due_date ? fmt(t.due_date) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
