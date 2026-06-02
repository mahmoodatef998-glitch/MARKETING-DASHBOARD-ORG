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
import { Search, Pencil, Trash2, Mail, Loader2, UserPlus, BarChart2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
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

export default function TeamPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [open,    setOpen]    = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [tab,     setTab]     = useState<'members' | 'workload'>('members')

  async function load() {
    try {
      const [teamRes, tasksRes] = await Promise.all([
        fetch('/api/team'),
        fetch('/api/tasks?limit=500'),
      ])
      const teamData  = await teamRes.json()
      const tasksData = await tasksRes.json()
      setMembers(Array.isArray(teamData) ? teamData : [])
      setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.data ?? []))
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

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

  // Workload: group tasks by assigned_to profile id
  const workload = members.map(m => {
    const memberTasks = tasks.filter(t => {
      if (!t.assigned_to) return false
      if (t.assigned_to === m.id) return true
      if (t.assignee?.display_name?.toLowerCase().includes(m.name.toLowerCase())) return true
      return false
    })
    const doneTasks   = memberTasks.filter(t => t.status === 'done')
    const ratedTasks  = doneTasks.filter(t => t.client_rating != null)
    const avgRating   = ratedTasks.length > 0
      ? ratedTasks.reduce((sum, t) => sum + (t.client_rating ?? 0), 0) / ratedTasks.length
      : null
    const doneRate    = memberTasks.length > 0
      ? Math.round((doneTasks.length / memberTasks.length) * 100)
      : null
    return {
      member: m,
      total:       memberTasks.length,
      todo:        memberTasks.filter(t => t.status === 'todo').length,
      in_progress: memberTasks.filter(t => t.status === 'in_progress').length,
      review:      memberTasks.filter(t => t.status === 'review').length,
      done:        doneTasks.length,
      overdue:     memberTasks.filter(t => t.status === 'overdue').length,
      avgRating,
      doneRate,
    }
  }).sort((a, b) => (b.in_progress + b.todo) - (a.in_progress + a.todo))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => router.push('/users')}>
          <UserPlus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { key: 'members',  label: 'Team Members', icon: UserPlus },
          { key: 'workload', label: 'Workload',      icon: BarChart2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Members Tab ── */}
      {tab === 'members' && <>
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
      ) : (
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
      )}
      </>}

      {/* ── Workload Tab ── */}
      {tab === 'workload' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Task distribution across active team members — sorted by active workload.</p>
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)}</div>
          ) : workload.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No team members found.</div>
          ) : (
            workload.map(({ member, total, todo, in_progress, review, done, overdue, avgRating, doneRate }) => {
              const activeLoad = in_progress + todo + review
              const maxLoad    = Math.max(...workload.map(w => w.in_progress + w.todo + w.review), 1)
              const barPct     = Math.round((activeLoad / maxLoad) * 100)
              return (
                <div key={member.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-100 text-sm">{member.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${roleColors[member.role] ?? 'bg-slate-700 text-slate-400'}`}>
                          {ROLE_LABELS[member.role] ?? member.role}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${overdue > 0 ? 'text-red-400' : activeLoad > 5 ? 'text-orange-400' : 'text-slate-300'}`}>
                        {activeLoad} active
                      </p>
                      <p className="text-xs text-slate-500">{total} total</p>
                    </div>
                  </div>

                  {/* Load bar */}
                  <div className="h-1.5 bg-slate-800 rounded-full mb-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${overdue > 0 ? 'bg-red-500' : activeLoad > 5 ? 'bg-orange-500' : 'bg-indigo-500'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  {/* Counters */}
                  <div className="flex items-center gap-3 flex-wrap text-xs mb-3">
                    {in_progress > 0 && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Clock className="h-3 w-3" />{in_progress} in progress
                      </span>
                    )}
                    {review > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Clock className="h-3 w-3" />{review} review
                      </span>
                    )}
                    {todo > 0 && (
                      <span className="text-slate-400">{todo} to do</span>
                    )}
                    {done > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="h-3 w-3" />{done} done
                      </span>
                    )}
                    {overdue > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertTriangle className="h-3 w-3" />{overdue} overdue
                      </span>
                    )}
                    {total === 0 && <span className="text-slate-600">No tasks assigned</span>}
                  </div>

                  {/* Performance metrics */}
                  {(doneRate !== null || avgRating !== null) && (
                    <div className="flex items-center gap-4 pt-2 border-t border-slate-800 text-xs">
                      {doneRate !== null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">Done rate</span>
                          <span className={`font-semibold ${doneRate >= 70 ? 'text-green-400' : doneRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {doneRate}%
                          </span>
                        </div>
                      )}
                      {avgRating !== null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">Avg rating</span>
                          <span className="font-semibold text-amber-400">
                            {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}
                            {' '}{avgRating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
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
