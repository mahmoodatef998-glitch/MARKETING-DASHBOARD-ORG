'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Search, Pencil, Trash2, Mail, Loader2, UserPlus, LayoutGrid, BarChart2 } from 'lucide-react'
import type { TeamMember, Task } from '@/types'

// Must match the UserRole values used in profiles table
const ROLES = ['video_maker', 'designer', 'ai_video', 'media_buyer'] as const
const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
}

function TeamForm({
  initial, onSave, onCancel,
}: { initial?: Partial<TeamMember>; onSave: (d: Partial<TeamMember>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    role: initial?.role ?? 'developer',
    status: initial?.status ?? 'active',
  })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSave(form as Partial<TeamMember>)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="John Doe" required />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@agency.com" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => set('role', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial?.id ? 'Update Member' : 'Add Member'}
        </Button>
      </div>
    </form>
  )
}

const roleColors: Record<string, string> = {
  video_maker: 'bg-purple-500/20 text-purple-400',
  designer:    'bg-pink-500/20 text-pink-400',
  ai_video:    'bg-cyan-500/20 text-cyan-400',
  media_buyer: 'bg-orange-500/20 text-orange-400',
}

interface WorkloadStats {
  todo: number; in_progress: number; review: number; done: number; overdue: number; total: number
}

const STATUS_COLORS: Record<string, string> = {
  todo:        '#64748b',
  in_progress: '#818cf8',
  review:      '#f59e0b',
  done:        '#34d399',
  overdue:     '#f87171',
}

function WorkloadBar({ stats }: { stats: WorkloadStats }) {
  if (stats.total === 0) return <p className="text-xs text-slate-600 italic">No tasks assigned</p>
  return (
    <div className="space-y-2">
      {/* stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden w-full">
        {(['done', 'in_progress', 'review', 'todo', 'overdue'] as const).map(s => {
          const pct = (stats[s] / stats.total) * 100
          if (pct === 0) return null
          return <div key={s} style={{ width: `${pct}%`, background: STATUS_COLORS[s] }} />
        })}
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {([
          ['done',        'Done'],
          ['in_progress', 'In Progress'],
          ['review',      'Review'],
          ['todo',        'To Do'],
          ['overdue',     'Overdue'],
        ] as const).map(([s, label]) => stats[s] > 0 && (
          <span key={s} className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[s] }} />
            {stats[s]} {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function TeamPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [members,   setMembers]   = useState<TeamMember[]>([])
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [viewMode,  setViewMode]  = useState<'grid' | 'workload'>('grid')
  const [open,      setOpen]      = useState(false)
  const [editing,   setEditing]   = useState<TeamMember | null>(null)

  async function load() {
    const [membersRes, tasksRes] = await Promise.all([
      fetch('/api/team'),
      fetch('/api/tasks'),
    ])
    setMembers(await membersRes.json())
    const t = await tasksRes.json()
    setTasks(Array.isArray(t) ? t : [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  function getWorkload(memberId: string): WorkloadStats {
    const mt = tasks.filter(t => t.assigned_to === memberId)
    return {
      todo:        mt.filter(t => t.status === 'todo').length,
      in_progress: mt.filter(t => t.status === 'in_progress').length,
      review:      mt.filter(t => t.status === 'review').length,
      done:        mt.filter(t => t.status === 'done').length,
      overdue:     mt.filter(t => t.status === 'overdue').length,
      total:       mt.length,
    }
  }

  async function handleSave(data: Partial<TeamMember>) {
    if (!editing) return
    const res = await fetch(`/api/team/${editing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { toast('Member updated', 'success'); setOpen(false); load() }
    else {
      const err = await res.json().catch(() => ({}))
      toast(err.error ?? 'Failed to update', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this team member?')) return
    const res = await fetch(`/api/team/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Member removed', 'success'); load() }
    else toast('Failed to delete', 'error')
  }

  const filtered = members.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
          <button
            onClick={() => setViewMode('workload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'workload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" /> Workload
          </button>
        </div>
        <Button onClick={() => router.push('/users')}>
          <UserPlus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Team members are created from the{' '}
        <button onClick={() => router.push('/users')} className="text-indigo-400 hover:underline">Users page</button>
        {' '}— assign the Video Maker, Designer, AI Video, or Media Buyer role.
      </p>

      <div className="flex gap-4 text-sm text-slate-400">
        <span>{members.length} total</span>
        <span className="text-green-400">{members.filter((m) => m.status === 'active').length} active</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <Card key={m.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100 text-sm">{m.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[m.role] ?? 'bg-slate-700 text-slate-400'}`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(m); setOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{m.email}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                    {m.status}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ── Workload view ───────────────────────────────────────── */
        <div className="space-y-3">
          {filtered
            .map(m => ({ m, stats: getWorkload(m.id) }))
            .sort((a, b) => b.stats.total - a.stats.total)
            .map(({ m, stats }) => (
              <Card key={m.id} className="hover:border-slate-600 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar + info */}
                    <div className="flex items-center gap-3 w-48 shrink-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{m.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleColors[m.role] ?? 'bg-slate-700 text-slate-400'}`}>
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </div>
                    </div>

                    {/* Workload bar */}
                    <div className="flex-1 min-w-0">
                      <WorkloadBar stats={stats} />
                    </div>

                    {/* Total count */}
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-bold text-slate-200">{stats.total}</p>
                      <p className="text-[10px] text-slate-500">tasks</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Member' : 'Add Team Member'}</DialogTitle>
          </DialogHeader>
          <TeamForm initial={editing ?? undefined} onSave={handleSave} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
