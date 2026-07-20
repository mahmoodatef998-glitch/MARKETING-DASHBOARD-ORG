'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  ArrowLeft, Plus, Trash2, Loader2, RefreshCw, Pencil, X,
  Wrench, Megaphone, Building2, Users, MoreHorizontal, TrendingDown,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, ExpenseCategory } from '@/types'

const CATEGORIES: { value: ExpenseCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'salary',     label: 'Salary',     icon: <Users className="h-3.5 w-3.5" />,         color: 'text-violet-400 bg-violet-500/15 border-violet-500/25' },
  { value: 'tools',      label: 'Tools',      icon: <Wrench className="h-3.5 w-3.5" />,         color: 'text-blue-400 bg-blue-500/15 border-blue-500/25' },
  { value: 'ads',        label: 'Ads',        icon: <Megaphone className="h-3.5 w-3.5" />,      color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' },
  { value: 'office',     label: 'Office',     icon: <Building2 className="h-3.5 w-3.5" />,      color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25' },
  { value: 'freelancer', label: 'Freelancer', icon: <Users className="h-3.5 w-3.5" />,          color: 'text-pink-400 bg-pink-500/15 border-pink-500/25' },
  { value: 'other',      label: 'Other',      icon: <MoreHorizontal className="h-3.5 w-3.5" />, color: 'text-slate-400 bg-slate-500/15 border-slate-500/25' },
]

function catMeta(cat?: string) {
  if (cat === 'team_payouts') {
    return { label: 'Team Payouts', icon: <Users className="h-3.5 w-3.5" />, color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' }
  }
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[5]
}

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  return { from, to }
}

interface TeamPayout {
  id: string
  amount: number
  paid_at: string
  description?: string
  member_id: string
}

function ExpenseForm({ initial, onSave, onCancel }: {
  initial?: Partial<Expense>
  onSave: (data: Partial<Expense>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    amount: initial?.amount != null ? String(initial.amount) : '',
    category: (initial?.category ?? '') as ExpenseCategory | '',
    date: initial?.date ?? new Date().toISOString().split('T')[0],
    notes: initial?.notes ?? '',
    recurring: initial?.recurring ?? false,
  })
  const [saving, setSaving] = useState(false)
  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      title: form.title,
      amount: Number(form.amount),
      category: (form.category as ExpenseCategory) || undefined,
      date: form.date,
      notes: form.notes || undefined,
      recurring: form.recurring,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Title *</Label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Amount (AED) *</Label>
          <Input type="number" min={0.01} step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date *</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={form.category || '_none'} onValueChange={v => set('category', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={form.recurring} onChange={e => set('recurring', e.target.checked)} className="rounded" />
        Recurring monthly
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

export default function ExpensesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const now = new Date()

  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [payouts, setPayouts]   = useState<TeamPayout[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Expense | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || p.role !== 'admin') router.replace('/dashboard')
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = monthBounds(year, month)
    const [expRes, payRes] = await Promise.all([
      fetch(`/api/expenses?from=${from}&to=${to}`).then(r => r.json()),
      fetch('/api/team-payouts').then(r => r.json()),
    ])
    setExpenses(Array.isArray(expRes) ? expRes : [])
    const pays = (Array.isArray(payRes) ? payRes : []) as TeamPayout[]
    setPayouts(pays.filter(p => p.paid_at >= from && p.paid_at <= to + 'T23:59:59Z'))
    setLoading(false)
  }, [year, month])

  useEffect(() => { void load() }, [load])

  const opsTotal    = expenses.reduce((s, e) => s + e.amount, 0)
  const payoutTotal = payouts.reduce((s, p) => s + p.amount, 0)
  const grandTotal  = opsTotal + payoutTotal

  async function addExpense(data: Partial<Expense>) {
    const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { toast('Expense added ✓', 'success'); setShowForm(false); void load() }
    else toast('Failed to add expense', 'error')
  }

  async function updateExpense(id: string, data: Partial<Expense>) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { toast('Updated ✓', 'success'); setEditing(null); void load() }
    else toast('Failed to update', 'error')
  }

  async function deleteExpense(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Deleted ✓', 'success'); setEditing(null); void load() }
    else toast('Failed to delete', 'error')
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/finance" className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Expenses · المصروفات</h1>
            <p className="text-sm text-slate-500 mt-0.5">All operational expenses + team payouts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1.5">
            {showForm ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> Add Expense</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Month picker + totals */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={String(m)}>
                {new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1 min-w-[200px] flex flex-wrap gap-4 text-sm ml-auto">
          <div><span className="text-slate-500">Ops: </span><span className="text-red-400 font-semibold">{formatCurrency(opsTotal)}</span></div>
          <div><span className="text-slate-500">Payouts: </span><span className="text-orange-400 font-semibold">{formatCurrency(payoutTotal)}</span></div>
          <div><span className="text-slate-500">Total: </span><span className="text-red-300 font-bold">{formatCurrency(grandTotal)}</span></div>
        </div>
      </div>

      {showForm && <ExpenseForm onSave={addExpense} onCancel={() => setShowForm(false)} />}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="space-y-6">
          {/* Operational expenses */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-400" /> Operational Expenses
                <span className="text-slate-600 font-normal">({expenses.length})</span>
              </p>
            </div>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No expenses this month</p>
            ) : (
              <div className="space-y-1.5">
                {expenses.map(exp => {
                  const meta = catMeta(exp.category)
                  return (
                    <div key={exp.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${meta.color}`}>{meta.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{exp.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(exp.date)}{exp.recurring ? ' · Recurring' : ''}{exp.notes ? ` · ${exp.notes}` : ''}</p>
                      </div>
                      <p className="text-sm font-bold text-red-400 shrink-0">{formatCurrency(exp.amount)}</p>
                      <button onClick={() => setEditing(exp)} className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-400 hover:bg-slate-800 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Team payouts (read-only) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-400" /> Team Payouts
                <span className="text-slate-600 font-normal">({payouts.length})</span>
              </p>
              <Link href="/salary" className="text-xs text-indigo-400 hover:underline">Manage in Salary →</Link>
            </div>
            {payouts.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No team payouts this month</p>
            ) : (
              <div className="space-y-1.5">
                {payouts.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 text-orange-400 bg-orange-500/15 border-orange-500/25">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{p.description ?? 'Team payout'}</p>
                      <p className="text-xs text-slate-500">{formatDate(p.paid_at.split('T')[0])}</p>
                    </div>
                    <p className="text-sm font-bold text-orange-400 shrink-0">{formatCurrency(p.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
            <ExpenseForm
              initial={editing}
              onSave={async data => updateExpense(editing.id, data)}
              onCancel={() => setEditing(null)}
            />
            <button onClick={() => { if (confirm(`Delete "${editing.title}"?`)) void deleteExpense(editing.id) }}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 mt-2">
              <Trash2 className="h-3.5 w-3.5" /> Delete expense
            </button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
