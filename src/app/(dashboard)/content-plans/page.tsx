'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Loader2, Calendar, ChevronRight, Camera, Globe, Music2,
  Paintbrush, Video, Sparkles, Pencil, Trash2, CheckCircle2,
  Clock, AlertTriangle, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentPlanItem {
  id:                string
  plan_id:           string
  client_id:         string
  content_type:      'reel' | 'design' | 'ai_video'
  title:             string
  publish_date:      string
  internal_due_date: string
  sla_days:          number
  sequence_number:   number
  platforms:         string[]
  notes:             string | null
  status:            string
  task_id:           string | null
  task?: {
    id:          string
    title:       string
    status:      string
    priority:    string
    assigned_to: string | null
    due_date:    string | null
    assignee?:   { id: string; display_name?: string } | null
  } | null
}

interface ContentPlan {
  id:         string
  client_id:  string
  month:      string
  title:      string
  status:     string
  notes:      string | null
  created_at: string
  client:     { id: string; name: string } | null
  items:      ContentPlanItem[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { value: 'reel',     label: 'Reel / Short Video', icon: Video,      color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', sla: 3 },
  { value: 'design',   label: 'Static Design',      icon: Paintbrush, color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20',     sla: 2 },
  { value: 'ai_video', label: 'AI Video',            icon: Sparkles,   color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20',      sla: 4 },
] as const

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Camera,  color: 'text-pink-400' },
  { id: 'tiktok',    label: 'TikTok',    icon: Music2,  color: 'text-slate-300' },
  { id: 'facebook',  label: 'Facebook',  icon: Globe,   color: 'text-blue-400' },
]

const TASK_STATUS_STYLE: Record<string, string> = {
  todo:        'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  review:      'bg-amber-500/20 text-amber-400',
  done:        'bg-green-500/20 text-green-400',
  overdue:     'bg-red-500/20 text-red-400',
}

const PLAN_STATUS_STYLE: Record<string, string> = {
  draft:     'bg-slate-700 text-slate-300',
  active:    'bg-indigo-500/20 text-indigo-400',
  completed: 'bg-green-500/20 text-green-400',
  archived:  'bg-slate-800 text-slate-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── New Plan Dialog ──────────────────────────────────────────────────────────

function NewPlanDialog({
  open, onClose, clients, onCreated,
}: {
  open: boolean
  onClose: () => void
  clients: Client[]
  onCreated: (plan: ContentPlan) => void
}) {
  const { toast } = useToast()
  const [clientId, setClientId] = useState('')
  const [month,    setMonth]    = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { toast('Select a client', 'error'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/content-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, month, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('Plan created!', 'success')
      onCreated(data)
      onClose()
      setClientId(''); setMonth(''); setNotes('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">New Monthly Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month *</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="text-slate-300" required />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for this plan…" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating…</> : 'Create Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────

function AddItemDialog({
  open, onClose, plan, onAdded,
}: {
  open: boolean
  onClose: () => void
  plan: ContentPlan
  onAdded: (item: ContentPlanItem) => void
}) {
  const { toast } = useToast()
  const [contentType, setContentType] = useState<string>('')
  const [publishDate, setPublishDate] = useState('')
  const [platforms,   setPlatforms]   = useState<string[]>([])
  const [notes,       setNotes]       = useState('')
  const [loading,     setLoading]     = useState(false)

  const selectedType = CONTENT_TYPES.find(t => t.value === contentType)

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contentType) { toast('Select content type', 'error'); return }
    if (!publishDate) { toast('Set publish date', 'error'); return }

    setLoading(true)
    try {
      const res = await fetch(`/api/content-plans/${plan.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, publish_date: publishDate, platforms, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast(`Task auto-created: ${data.title}`, 'success')
      onAdded(data)
      onClose()
      setContentType(''); setPublishDate(''); setPlatforms([]); setNotes('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            Add Content Item — {plan.client?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Content Type */}
          <div className="space-y-2">
            <Label>Content Type *</Label>
            <div className="grid grid-cols-3 gap-2">
              {CONTENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setContentType(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                    contentType === t.value
                      ? `${t.bg} ${t.color} border-current`
                      : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  )}
                >
                  <t.icon className="h-5 w-5" />
                  <span className="text-center leading-tight">{t.label}</span>
                  <span className="text-[10px] opacity-70">SLA {t.sla}d</span>
                </button>
              ))}
            </div>
          </div>

          {/* Publish Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> Publish Date & Time *
            </Label>
            <Input
              type="datetime-local"
              value={publishDate}
              onChange={e => setPublishDate(e.target.value)}
              className="text-slate-300"
              required
            />
            {selectedType && publishDate && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Due Date (team): {formatDate(
                  new Date(new Date(publishDate).getTime() - selectedType.sla * 86400000).toISOString()
                )}
              </p>
            )}
          </div>

          {/* Platforms */}
          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                    platforms.includes(p.id)
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  )}
                >
                  <p.icon className={cn('h-3.5 w-3.5', platforms.includes(p.id) && p.color)} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Brief for the team…" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating…</>
                : <><Plus className="h-4 w-4 mr-1" /> Add & Generate Task</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan, onSelect, selected,
}: {
  plan: ContentPlan
  onSelect: () => void
  selected: boolean
}) {
  const byType = CONTENT_TYPES.map(t => ({
    ...t,
    items: plan.items.filter(i => i.content_type === t.value),
  }))

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-all hover:border-indigo-500/50',
        selected ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 bg-slate-900'
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-100 text-sm">{plan.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(plan.month).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', PLAN_STATUS_STYLE[plan.status])}>
              {plan.status}
            </span>
            <ChevronRight className={cn('h-4 w-4 text-slate-600 transition-transform', selected && 'rotate-90 text-indigo-400')} />
          </div>
        </div>

        <div className="flex gap-3">
          {byType.map(t => (
            <div key={t.value} className={cn('flex-1 rounded-lg border p-2 text-center', t.bg)}>
              <t.icon className={cn('h-4 w-4 mx-auto mb-1', t.color)} />
              <p className={cn('text-lg font-bold', t.color)}>{t.items.length}</p>
              <p className="text-[10px] text-slate-500">{t.label.split(' ')[0]}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, onDelete }: { item: ContentPlanItem; onDelete: () => void }) {
  const typeMeta = CONTENT_TYPES.find(t => t.value === item.content_type)!
  const TypeIcon = typeMeta.icon

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
      {/* Type icon */}
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', typeMeta.bg)}>
        <TypeIcon className={cn('h-4 w-4', typeMeta.color)} />
      </div>

      {/* Title + dates */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{item.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Publish: {formatDateTime(item.publish_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Due: {formatDate(item.internal_due_date)}
          </span>
        </div>
      </div>

      {/* Task status */}
      {item.task ? (
        <div className="flex items-center gap-2 shrink-0">
          {item.task.assignee ? (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Users className="h-3 w-3" /> {item.task.assignee.display_name}
            </span>
          ) : (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Unassigned
            </span>
          )}
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', TASK_STATUS_STYLE[item.task.status])}>
            {item.task.status.replace('_', ' ')}
          </span>
        </div>
      ) : (
        <span className="text-xs text-slate-600 shrink-0">No task</span>
      )}

      {/* Delete — only pending_production */}
      {item.status === 'pending_production' && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContentPlansPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [plans,        setPlans]        = useState<ContentPlan[]>([])
  const [clients,      setClients]      = useState<Client[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<ContentPlan | null>(null)
  const [newPlanOpen,  setNewPlanOpen]  = useState(false)
  const [addItemOpen,  setAddItemOpen]  = useState(false)
  const [filterClient, setFilterClient] = useState('')

  // Role guard
  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || !['admin', 'media_buyer'].includes(p.role)) {
        router.replace('/dashboard')
      }
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    const [plansRes, clientsRes] = await Promise.all([
      fetch('/api/content-plans'),
      fetch('/api/clients'),
    ])
    if (plansRes.ok)   setPlans(await plansRes.json())
    if (clientsRes.ok) setClients(await clientsRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const visiblePlans = plans.filter(p =>
    !filterClient || p.client_id === filterClient
  )

  function handleItemAdded(item: ContentPlanItem) {
    setPlans(prev => prev.map(p => {
      if (p.id !== selectedPlan?.id) return p
      const updated = { ...p, items: [...p.items, item] }
      setSelectedPlan(updated)
      return updated
    }))
  }

  async function handleDeleteItem(planId: string, itemId: string) {
    const res = await fetch(`/api/content-plans/${planId}/items/${itemId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      toast(d.error ?? 'Delete failed', 'error')
      return
    }
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p
      const updated = { ...p, items: p.items.filter(i => i.id !== itemId) }
      setSelectedPlan(updated)
      return updated
    }))
    toast('Item removed', 'success')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Monthly Content Plans</h1>
          <p className="text-sm text-slate-500 mt-0.5">Plan content → tasks are auto-generated with SLA deadlines</p>
        </div>
        <Button onClick={() => setNewPlanOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Plan
        </Button>
      </div>

      {/* SLA legend */}
      <div className="flex flex-wrap gap-3">
        {CONTENT_TYPES.map(t => (
          <div key={t.value} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs', t.bg)}>
            <t.icon className={cn('h-3.5 w-3.5', t.color)} />
            <span className={t.color}>{t.label}</span>
            <span className="text-slate-500">→ due {t.sla} days before publish</span>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">{visiblePlans.length} plan{visiblePlans.length !== 1 ? 's' : ''}</span>
      </div>

      {visiblePlans.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No plans yet</p>
          <p className="text-sm mt-1">Create a monthly plan to start generating content tasks</p>
          <Button className="mt-4" onClick={() => setNewPlanOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Create First Plan
          </Button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Plan list */}
          <div className="lg:col-span-2 space-y-3">
            {visiblePlans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan?.id === plan.id}
                onSelect={() => setSelectedPlan(plan)}
              />
            ))}
          </div>

          {/* Plan detail */}
          <div className="lg:col-span-3">
            {selectedPlan ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">{selectedPlan.title}</h2>
                    <p className="text-sm text-slate-500">{selectedPlan.items.length} items</p>
                  </div>
                  <Button size="sm" onClick={() => setAddItemOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add Content
                  </Button>
                </div>

                {/* Items by type */}
                {CONTENT_TYPES.map(t => {
                  const items = selectedPlan.items.filter(i => i.content_type === t.value)
                  return (
                    <div key={t.value}>
                      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-lg border-b', t.bg)}>
                        <t.icon className={cn('h-4 w-4', t.color)} />
                        <span className={cn('text-sm font-medium', t.color)}>{t.label}</span>
                        <span className="text-xs text-slate-500 ml-auto">{items.length} items</span>
                      </div>
                      <div className="space-y-2 pt-2">
                        {items.length === 0 ? (
                          <p className="text-xs text-slate-600 px-3 pb-2">No {t.label.toLowerCase()} items yet</p>
                        ) : (
                          items.map(item => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              onDelete={() => handleDeleteItem(selectedPlan.id, item.id)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-600 border border-slate-800 rounded-2xl">
                <ChevronRight className="h-10 w-10 mb-3 opacity-30" />
                <p>Select a plan to view its content</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewPlanDialog
        open={newPlanOpen}
        onClose={() => setNewPlanOpen(false)}
        clients={clients}
        onCreated={plan => { setPlans(prev => [plan, ...prev]); setSelectedPlan(plan) }}
      />

      {selectedPlan && (
        <AddItemDialog
          open={addItemOpen}
          onClose={() => setAddItemOpen(false)}
          plan={selectedPlan}
          onAdded={handleItemAdded}
        />
      )}
    </div>
  )
}
