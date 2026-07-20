'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Sparkles,
  Plus, Trash2, Loader2, RefreshCw, CheckCircle2, X, Settings,
  Banknote, Wrench, Megaphone, Building2, Users, MoreHorizontal, Zap, Pencil,
  Wallet, ArrowDownLeft, ArrowUpRight, Scale,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, ExpenseCategory, FinancialAnalysis, FinancialSettings } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: ExpenseCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'salary',     label: 'Salary',     icon: <Users className="h-3.5 w-3.5" />,     color: 'text-violet-400 bg-violet-500/15 border-violet-500/25' },
  { value: 'tools',      label: 'Tools',      icon: <Wrench className="h-3.5 w-3.5" />,     color: 'text-blue-400 bg-blue-500/15 border-blue-500/25' },
  { value: 'ads',        label: 'Ads',        icon: <Megaphone className="h-3.5 w-3.5" />,  color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' },
  { value: 'office',     label: 'Office',     icon: <Building2 className="h-3.5 w-3.5" />,  color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25' },
  { value: 'freelancer', label: 'Freelancer', icon: <Users className="h-3.5 w-3.5" />,      color: 'text-pink-400 bg-pink-500/15 border-pink-500/25' },
  { value: 'other',      label: 'Other',      icon: <MoreHorizontal className="h-3.5 w-3.5" />, color: 'text-slate-400 bg-slate-500/15 border-slate-500/25' },
]

function catMeta(cat?: string) {
  if (cat === 'team_payouts') {
    return { value: 'other' as ExpenseCategory, label: 'Team Payouts', icon: <Users className="h-3.5 w-3.5" />, color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' }
  }
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[5]
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, growth, color, icon, href }: {
  label: string; value: string; sub?: string; growth?: number; color: string; icon: React.ReactNode; href?: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider leading-tight">{label}</span>
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl flex items-center justify-center bg-slate-800/80 shrink-0">{icon}</div>
      </div>
      <div className="min-w-0">
        <p className="text-lg sm:text-2xl font-bold text-slate-100 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{sub}</p>}
      </div>
      {growth !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${growth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {growth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(growth)}% vs last month
        </div>
      )}
    </>
  )
  const cls = `rounded-2xl border p-3 sm:p-4 space-y-2 sm:space-y-3 bg-slate-900 ${color}${href ? ' hover:bg-slate-800/80 hover:border-opacity-60 cursor-pointer transition-colors' : ''}`
  if (href) return <Link href={href} className={cls}>{inner}</Link>
  return <div className={cls}>{inner}</div>
}

// ── Mini Bar Chart (pure CSS) ─────────────────────────────────────────────────

function CashFlowChart({ data }: { data: Array<{ month: string; revenue: number; expenses: number; profit: number }> }) {
  const maxVal = Math.max(...data.flatMap(d => [d.revenue, d.expenses]), 1)
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex gap-0.5 items-end h-24">
              <div className="flex-1 rounded-t-sm bg-indigo-500/70 transition-all duration-500"
                style={{ height: `${(d.revenue / maxVal) * 100}%` }} />
              <div className="flex-1 rounded-t-sm bg-red-500/50 transition-all duration-500"
                style={{ height: `${(d.expenses / maxVal) * 100}%` }} />
            </div>
            <span className="text-[9px] text-slate-600 text-center leading-tight">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/70 inline-block" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/50 inline-block" />Expenses</span>
      </div>
    </div>
  )
}

// ── Health Score Ring ─────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'
  const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Caution' : 'Critical'
  return (
    <div className="flex items-center gap-3">
      <div className={`text-3xl font-black ${color}`}>{score}</div>
      <div>
        <p className={`text-sm font-bold ${color}`}>{label}</p>
        <p className="text-xs text-slate-500">Financial Health</p>
      </div>
    </div>
  )
}

// ── Priority Badge ────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, string> = {
  high:   'bg-red-500/15 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  low:    'bg-slate-700/50 text-slate-400 border-slate-600/30',
}
const INSIGHT_STYLE: Record<string, string> = {
  warning: 'border-l-amber-400 bg-amber-500/5',
  info:    'border-l-blue-400 bg-blue-500/5',
  success: 'border-l-green-400 bg-green-500/5',
}
const INSIGHT_ICON: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
  info:    <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />,
  success: <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />,
}

// ── Add Expense Form ──────────────────────────────────────────────────────────

function AddExpenseForm({ onSave, onCancel }: { onSave: (e: Partial<Expense>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: '', amount: '', category: '' as ExpenseCategory | '', date: new Date().toISOString().split('T')[0], notes: '', recurring: false,
  })
  const [saving, setSaving] = useState(false)
  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await onSave({ ...form, amount: Number(form.amount), category: (form.category as ExpenseCategory) || undefined })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-200">Add Expense</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Title *</Label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Adobe CC Subscription" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Amount *</Label>
          <Input type="number" min={0.01} step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date *</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="text-slate-300" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={form.category || '_none'} onValueChange={v => set('category', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional note" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="recurring" checked={form.recurring} onChange={e => set('recurring', e.target.checked)} className="rounded" />
        <label htmlFor="recurring" className="text-xs text-slate-400">Recurring monthly expense</label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Plus className="h-3.5 w-3.5" /> Add Expense</>}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Edit Expense Modal ────────────────────────────────────────────────────────

function EditExpenseModal({ expense, onSave, onDelete, onClose }: {
  expense: Expense
  onSave: (id: string, updates: Partial<Expense>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    title:     expense.title,
    amount:    String(expense.amount),
    category:  (expense.category ?? '') as ExpenseCategory | '',
    date:      expense.date,
    notes:     expense.notes ?? '',
    recurring: expense.recurring,
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await onSave(expense.id, {
      ...form,
      amount:   Number(form.amount),
      category: (form.category as ExpenseCategory) || undefined,
    })
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`حذف "${expense.title}"؟`)) return
    setDeleting(true)
    await onDelete(expense.id)
    setDeleting(false)
  }

  const catMeta2 = CATEGORIES.find(c => c.value === expense.category) ?? CATEGORIES[5]

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full mx-2 sm:mx-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-slate-400" /> تفاصيل المصروف
          </DialogTitle>
        </DialogHeader>

        {/* Summary strip */}
        <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${catMeta2.color}`}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center border shrink-0">
            {catMeta2.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{expense.title}</p>
            <p className="text-xs opacity-70">{catMeta2.label} · {expense.date}</p>
          </div>
          <p className="text-sm font-bold shrink-0">{formatCurrency(expense.amount)}</p>
        </div>

        <form onSubmit={submit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount *</Label>
              <Input type="number" min={0.01} step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="text-slate-300" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category || '_none'} onValueChange={v => set('category', v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit-recurring" checked={form.recurring}
              onChange={e => set('recurring', e.target.checked)} className="rounded" />
            <label htmlFor="edit-recurring" className="text-xs text-slate-400">Recurring monthly expense</label>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors px-2 py-1.5 rounded hover:bg-red-500/10">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete Expense
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving} size="sm">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface FinancialData {
  revenue:   { thisMonth: number; lastMonth: number; ytd: number; allTime?: number; growth: number }
  expenses:  { thisMonth: number; lastMonth: number; ytd: number; allTime?: number; operational?: number; teamPayouts?: number; byCategory: Record<string, number> }
  profit:    { thisMonth: number; lastMonth: number; margin: number }
  summary: {
    totalIncome: number
    totalOutflow: number
    cashBalance: number
    receivables: number
    payables: number
    thisMonthIncome: number
    thisMonthOutflow: number
    thisMonthBalance: number
  }
  outstanding: { total: number; count: number; overdueTotal: number; overdueCount: number }
  payables: { total: number; earned: number; paid: number }
  mrr:       number
  arr:       number
  collectionRate: number
  cashFlow:  Array<{ month: string; revenue: number; expenses: number; profit: number }>
  topClients: Array<{ id: string; name: string; revenue: number }>
  overdueInvoices: Array<{ id?: string; invoice_number: string; client: string; total: number; due_date: string }>
  recentExpenses: Expense[]
  pnl: {
    revenue: number
    designCost: number
    mediaBuyerCost: number
    operationalExpenses: number
    teamPayouts: number
    totalCosts: number
    netProfit: number
    designTaskCount: number
    activeClientCount: number
    partnerDistribution: { name: string; share: number; amount: number }[]
  }
}

// ── Financial Settings Modal ──────────────────────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<FinancialSettings>({
    cost_per_design: 15,
    media_buyer_rate_per_client: 150,
    partner1_name: 'Partner 1', partner1_share: 50,
    partner2_name: 'Partner 2', partner2_share: 30,
    partner3_name: 'Partner 3', partner3_share: 20,
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/settings/financial')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setForm(f => ({ ...f, ...d })) })
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof FinancialSettings, v: string | number) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/settings/financial', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { toast('Settings saved ✓', 'success'); onClose() }
    else toast('Failed to save', 'error')
    setSaving(false)
  }

  const totalShare = form.partner1_share + form.partner2_share + form.partner3_share

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full mx-2 sm:mx-auto max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-400" /> Financial Settings
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : (
          <div className="space-y-5">
            {/* Cost rates */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cost Rates</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cost per Design (AED)</Label>
                  <Input type="number" min={0} step="0.01" value={form.cost_per_design}
                    onChange={e => set('cost_per_design', Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Media Buyer / Client (AED)</Label>
                  <Input type="number" min={0} step="0.01" value={form.media_buyer_rate_per_client}
                    onChange={e => set('media_buyer_rate_per_client', Number(e.target.value))} />
                </div>
              </div>
            </div>
            {/* Partners */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Profit Distribution
                <span className={`ml-2 font-bold ${totalShare === 100 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalShare}% {totalShare !== 100 && '⚠ must equal 100%'}
                </span>
              </p>
              {([
                ['partner1_name', 'partner1_share'],
                ['partner2_name', 'partner2_share'],
                ['partner3_name', 'partner3_share'],
              ] as [keyof FinancialSettings, keyof FinancialSettings][]).map(([nameKey, shareKey], i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Partner {i + 1} name</Label>
                    <Input value={String(form[nameKey])} onChange={e => set(nameKey, e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Share %</Label>
                    <Input type="number" min={0} max={100} value={Number(form[shareKey])}
                      onChange={e => set(shareKey, Number(e.target.value))} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={saving || totalShare !== 100}
                className="bg-indigo-600 hover:bg-indigo-500 text-white">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : 'Save Settings'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function FinancePage() {
  const router   = useRouter()
  const { toast } = useToast()

  const [data,         setData]         = useState<FinancialData | null>(null)
  const [expenses,     setExpenses]     = useState<Expense[]>([])
  const [analysis,     setAnalysis]     = useState<FinancialAnalysis | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [aiLoading,    setAiLoading]    = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [showSettings,  setShowSettings]  = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [generating,   setGenerating]   = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || p.role !== 'admin') router.replace('/dashboard')
    })
  }, [router])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [finRes, expRes] = await Promise.all([
      fetch('/api/analytics/financial').then(r => r.json()),
      fetch('/api/expenses').then(r => r.json()),
    ])
    if (finRes?.error) {
      toast(finRes.error, 'error')
      setData(null)
    } else {
      setData(finRes)
    }
    setExpenses(Array.isArray(expRes) ? expRes : [])
    setLoading(false)
  }, [toast])

  useEffect(() => { void loadData() }, [loadData])

  async function runAiAnalysis() {
    setAiLoading(true)
    try {
      const res  = await fetch('/api/ai/financial-agent', { method: 'POST' })
      const json = await res.json()
      if (res.ok) setAnalysis(json)
      else toast(json.error ?? 'AI analysis failed', 'error')
    } catch {
      toast('Failed to run analysis', 'error')
    }
    setAiLoading(false)
  }

  async function handleAddExpense(exp: Partial<Expense>) {
    const res = await fetch('/api/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exp),
    })
    if (res.ok) { toast('Expense added', 'success'); setShowForm(false); void loadData() }
    else toast('Failed to add expense', 'error')
  }

  async function handleDeleteExpense(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Expense deleted', 'success'); setEditingExpense(null); void loadData() }
    else toast('Failed to delete', 'error')
  }

  async function handleEditExpense(id: string, updates: Partial<Expense>) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    })
    if (res.ok) { toast('Expense updated ✓', 'success'); setEditingExpense(null); void loadData() }
    else toast('Failed to update expense', 'error')
  }

  async function handleAction(rec: FinancialAnalysis['recommendations'][0], idx: number) {
    if (rec.action_type === 'none') return
    setActionLoading(String(idx))
    try {
      if (rec.action_type === 'send_payment_reminders') {
        const overdueIds = (data?.overdueInvoices ?? [])
        let sent = 0
        for (const inv of overdueIds) {
          const invoiceKey = inv.id || inv.invoice_number
          const res = await fetch(`/api/invoices/${invoiceKey}/send`, { method: 'POST' }).catch(() => null)
          if (res?.ok) sent++
        }
        toast(`Sent ${sent} reminder email${sent !== 1 ? 's' : ''}`, 'success')
      }
    } catch {
      toast('Action failed', 'error')
    }
    setActionLoading(null)
  }

  async function handleDeleteClient(id: string, name: string) {
    if (!confirm(`Delete client "${name}"? This will soft-delete the client record.`)) return
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    if (res.ok) { toast(`Client "${name}" deleted`, 'success'); void loadData() }
    else toast('Failed to delete client', 'error')
  }

  async function handleZeroRate(field: 'cost_per_design' | 'media_buyer_rate_per_client', label: string) {
    if (!confirm(`Remove "${label}" from P&L? Sets the rate to 0. Can be restored in Financial Settings.`)) return
    const res = await fetch('/api/settings/financial', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: 0 }),
    })
    if (res.ok) { toast(`${label} removed from P&L`, 'success'); void loadData() }
    else toast('Failed to update', 'error')
  }

  async function generateDueInvoices() {
    setGenerating(true)
    const res = await fetch('/api/invoices/auto-generate', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      if (data.created > 0) {
        toast(`${data.created} invoice(s) generated ✓`, 'success')
        void loadData()
      } else {
        toast('No invoices due today', 'success')
      }
    } else {
      toast('Failed to generate invoices', 'error')
    }
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!data?.summary || !data?.pnl) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-slate-400">Failed to load financial data</p>
        <Button size="sm" onClick={loadData} variant="outline">Retry</Button>
      </div>
    )
  }

  const d = data

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Financial Intelligence</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 flex flex-wrap gap-x-1.5">
            <span title="3-month average of actual paid revenue">MRR <span className="text-indigo-400 font-semibold">{formatCurrency(d.mrr)}</span></span>
            <span className="text-slate-700">·</span>
            <span title="MRR × 12">ARR <span className="text-indigo-400 font-semibold">{formatCurrency(d.arr)}</span></span>
            <span className="text-slate-700">·</span>
            <span title="Paid invoices ÷ (Paid + Outstanding)">Collection <span className={`font-semibold ${d.collectionRate >= 80 ? 'text-green-400' : d.collectionRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{d.collectionRate}%</span></span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={generateDueInvoices} disabled={generating} variant="outline" size="sm" className="gap-1.5 text-xs flex-1 sm:flex-none">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-400" />}
            Generate Invoices
          </Button>
          <Button onClick={() => setShowSettings(true)} variant="ghost" size="sm" title="Financial Settings">
            <Settings className="h-4 w-4" />
          </Button>
          <Button onClick={loadData} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          onSave={handleEditExpense}
          onDelete={handleDeleteExpense}
          onClose={() => setEditingExpense(null)}
        />
      )}

      {/* ── Full accounts snapshot: دخل / مصروف / باقي / ليا / عليا ── */}
      {d.summary && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Scale className="h-4 w-4 text-slate-400" />
              Accounts Overview
            </h2>
            <span className="text-[10px] text-slate-600">All-time cash position</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Link href="/income" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors cursor-pointer">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                <ArrowDownLeft className="h-3 w-3" /> Income · دخل
              </div>
              <p className="text-lg sm:text-xl font-bold text-emerald-400 truncate">{formatCurrency(d.summary.totalIncome)}</p>
              <p className="text-[10px] text-slate-500">This month: {formatCurrency(d.summary.thisMonthIncome)} · View all →</p>
            </Link>
            <Link href="/expenses" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-1 hover:bg-red-500/10 hover:border-red-500/30 transition-colors cursor-pointer">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-400/80">
                <ArrowUpRight className="h-3 w-3" /> Outflow · مصروف
              </div>
              <p className="text-lg sm:text-xl font-bold text-red-400 truncate">{formatCurrency(d.summary.totalOutflow)}</p>
              <p className="text-[10px] text-slate-500">This month: {formatCurrency(d.summary.thisMonthOutflow)} · View all →</p>
            </Link>
            <div className={`rounded-xl border p-3 space-y-1 ${d.summary.cashBalance >= 0 ? 'border-indigo-500/20 bg-indigo-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400/80">
                <Wallet className="h-3 w-3" /> Balance · باقي
              </div>
              <p className={`text-lg sm:text-xl font-bold truncate ${d.summary.cashBalance >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
                {formatCurrency(d.summary.cashBalance)}
              </p>
              <p className="text-[10px] text-slate-500">Income − Outflow</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                <Banknote className="h-3 w-3" /> Receivable · ليا
              </div>
              <p className="text-lg sm:text-xl font-bold text-amber-400 truncate">{formatCurrency(d.summary.receivables)}</p>
              <p className="text-[10px] text-slate-500">{d.outstanding.count} open · {d.outstanding.overdueCount} overdue</p>
            </div>
            <Link href="/salary" className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-1 hover:bg-orange-500/10 hover:border-orange-500/30 transition-colors cursor-pointer col-span-2 lg:col-span-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">
                <Users className="h-3 w-3" /> Payable · عليا
              </div>
              <p className="text-lg sm:text-xl font-bold text-orange-400 truncate">{formatCurrency(d.summary.payables)}</p>
              <p className="text-[10px] text-slate-500">
                Earned {formatCurrency(d.payables?.earned ?? 0)} · Paid {formatCurrency(d.payables?.paid ?? 0)} · View →
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI Cards (this month) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Revenue (Month)"
          value={formatCurrency(d.revenue.thisMonth)}
          sub={`YTD: ${formatCurrency(d.revenue.ytd)}`}
          growth={d.revenue.growth}
          color="border-indigo-500/20"
          icon={<TrendingUp className="h-4 w-4 text-indigo-400" />}
          href="/income"
        />
        <KpiCard
          label="Outflow (Month)"
          value={formatCurrency(d.expenses.thisMonth)}
          sub={[
            d.expenses.operational != null ? `Ops ${formatCurrency(d.expenses.operational)}` : null,
            (d.expenses.teamPayouts ?? 0) > 0 ? `Payouts ${formatCurrency(d.expenses.teamPayouts!)}` : null,
            `YTD: ${formatCurrency(d.expenses.ytd)}`,
          ].filter(Boolean).join(' · ')}
          color="border-red-500/20"
          icon={<TrendingDown className="h-4 w-4 text-red-400" />}
          href="/expenses"
        />
        <KpiCard
          label="Net Profit"
          value={formatCurrency(d.pnl.netProfit)}
          sub={`Margin: ${d.pnl.revenue > 0 ? Math.round((d.pnl.netProfit / d.pnl.revenue) * 100) : 0}%`}
          color={d.pnl.netProfit >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
          icon={<DollarSign className={`h-4 w-4 ${d.pnl.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} />}
        />
        <KpiCard
          label="Outstanding · ليا"
          value={formatCurrency(d.outstanding.total)}
          sub={`${d.outstanding.overdueCount} overdue · ${d.outstanding.count} open`}
          color={d.outstanding.overdueCount > 0 ? 'border-amber-500/20' : 'border-slate-700'}
          icon={<AlertTriangle className={`h-4 w-4 ${d.outstanding.overdueCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />}
        />
      </div>

      {/* ── Chart + AI Panel ── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Cash Flow Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-300">Revenue vs Expenses — 6 Months</p>
          <CashFlowChart data={d.cashFlow} />
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
            {d.cashFlow.slice(-1).map(m => (
              <div key={m.month} className="col-span-3 grid grid-cols-3 gap-2 text-xs">
                <div className="text-center"><p className="text-slate-500">Revenue</p><p className="font-semibold text-indigo-400">{formatCurrency(m.revenue)}</p></div>
                <div className="text-center"><p className="text-slate-500">Expenses</p><p className="font-semibold text-red-400">{formatCurrency(m.expenses)}</p></div>
                <div className="text-center"><p className="text-slate-500">Profit</p><p className={`font-semibold ${m.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(m.profit)}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Analysis Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <p className="text-sm font-semibold text-slate-300">AI Financial Agent</p>
            </div>
            <Button size="sm" onClick={runAiAnalysis} disabled={aiLoading}
              className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white gap-1">
              {aiLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</>
                : <><Sparkles className="h-3 w-3" /> {analysis ? 'Re-analyze' : 'Analyze Now'}</>}
            </Button>
          </div>

          {!analysis && !aiLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
              <Sparkles className="h-8 w-8 text-violet-500/40" />
              <p className="text-sm text-slate-500">Click Analyze Now to get AI financial insights</p>
              <p className="text-xs text-slate-600">Gemini 2.5 Flash will analyze your revenue, expenses, profit, and outstanding payments</p>
            </div>
          )}

          {aiLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-500">Analyzing financial data…</p>
            </div>
          )}

          {analysis && !aiLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-3 py-2.5">
                <HealthRing score={analysis.health_score} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{analysis.summary}</p>

              {/* Insights */}
              {analysis.insights.map((ins, i) => (
                <div key={i} className={`border-l-2 pl-3 py-1.5 rounded-r-lg ${INSIGHT_STYLE[ins.type]}`}>
                  <div className="flex items-start gap-2">
                    {INSIGHT_ICON[ins.type]}
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{ins.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ins.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── P&L Breakdown ── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">This Month — P&L Breakdown</h2>

        {/* Revenue row */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Revenue</span>
            <span className="text-green-400 font-semibold">{formatCurrency(d.pnl.revenue)}</span>
          </div>

          {/* Cost rows */}
          <div className="border-l-2 border-red-500/30 ml-2 pl-3 space-y-1.5">
            {d.pnl.designCost > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="min-w-0 flex items-center gap-1.5">
                  Design costs ({d.pnl.designTaskCount} designs × AED {d.pnl.designTaskCount > 0 ? Math.round(d.pnl.designCost / d.pnl.designTaskCount) : 0})
                  <button onClick={() => setShowSettings(true)}
                    title="Edit rate in Financial Settings"
                    className="p-0.5 rounded text-slate-700 hover:text-indigo-400 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleZeroRate('cost_per_design', 'Design costs')}
                    title="Remove from P&L"
                    className="p-0.5 rounded text-slate-700 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
                <span className="text-red-400 shrink-0">− {formatCurrency(d.pnl.designCost)}</span>
              </div>
            )}
            {d.pnl.mediaBuyerCost > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="min-w-0 flex items-center gap-1.5">
                  Media buyer ({d.pnl.activeClientCount} clients × AED {d.pnl.activeClientCount > 0 ? Math.round(d.pnl.mediaBuyerCost / d.pnl.activeClientCount) : 0})
                  <button onClick={() => setShowSettings(true)}
                    title="Edit rate in Financial Settings"
                    className="p-0.5 rounded text-slate-700 hover:text-indigo-400 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleZeroRate('media_buyer_rate_per_client', 'Media buyer')}
                    title="Remove from P&L"
                    className="p-0.5 rounded text-slate-700 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
                <span className="text-red-400 shrink-0">− {formatCurrency(d.pnl.mediaBuyerCost)}</span>
              </div>
            )}
            {d.pnl.operationalExpenses > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  Operational expenses
                  <button
                    onClick={() => { setShowForm(true); document.getElementById('expenses-section')?.scrollIntoView({ behavior: 'smooth' }) }}
                    title="Add or edit expenses below"
                    className="p-0.5 rounded text-slate-700 hover:text-indigo-400 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
                <span className="text-red-400 shrink-0">− {formatCurrency(d.pnl.operationalExpenses)}</span>
              </div>
            )}
            {(d.pnl.teamPayouts ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="min-w-0">
                  Team payouts
                  <span className="text-slate-600 ml-1">(cash · in outflow, not in P&amp;L)</span>
                </span>
                <span className="text-slate-400 shrink-0">{formatCurrency(d.pnl.teamPayouts)}</span>
              </div>
            )}
          </div>

          {/* Net profit */}
          <div className={`flex justify-between text-sm font-bold border-t border-slate-700 pt-2 ${d.pnl.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            <span>Net Profit</span>
            <span>{formatCurrency(d.pnl.netProfit)}</span>
          </div>
        </div>

        {/* Partner distribution — always show shares; amounts follow net profit */}
        {d.pnl.partnerDistribution?.length > 0 && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider">
              Profit Distribution · تقسيم النسبة
              {d.pnl.netProfit <= 0 && <span className="ml-2 normal-case text-slate-600">(no profit this month)</span>}
            </p>
            {d.pnl.partnerDistribution.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">{p.name}</span>
                  <span className="text-slate-500">{p.share}%</span>
                </div>
                <span className={`font-semibold text-sm w-28 text-right ${p.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Recommendations ── */}
      {analysis && analysis.recommendations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-300">Recommended Actions</p>
          <div className="space-y-2">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 bg-slate-800/40 border border-slate-700/60 rounded-xl px-3 sm:px-4 py-3">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 mt-0.5 ${PRIORITY_STYLE[rec.priority]}`}>
                    {rec.priority.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200">{rec.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{rec.detail}</p>
                  </div>
                </div>
                {rec.action_type !== 'none' && rec.action_label && (
                  <Button size="sm" disabled={actionLoading === String(i)}
                    onClick={() => handleAction(rec, i)}
                    className="h-7 text-xs shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white self-start sm:self-auto">
                    {actionLoading === String(i)
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : rec.action_label}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Expenses ── */}
      <div id="expenses-section" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Expenses This Month</p>
          <Button size="sm" onClick={() => setShowForm(v => !v)}
            className="h-7 text-xs gap-1">
            {showForm ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Expense</>}
          </Button>
        </div>

        {showForm && <AddExpenseForm onSave={handleAddExpense} onCancel={() => setShowForm(false)} />}

        {/* Category breakdown */}
        {Object.keys(d.expenses.byCategory).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(d.expenses.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => {
                const meta = catMeta(cat)
                return (
                  <div key={cat} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${meta.color}`}>
                    {meta.icon}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{meta.label}</p>
                      <p className="text-xs opacity-80">{formatCurrency(amt)}</p>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Expenses list */}
        <div className="space-y-1.5">
          {expenses
            .filter(exp => {
              const now = new Date()
              const d = new Date(exp.date)
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
            })
            .slice(0, 15)
            .map(exp => {
            const meta = catMeta(exp.category)
            return (
              <div key={exp.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${meta.color}`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{exp.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(exp.date)}{exp.recurring ? ' · Recurring' : ''}</p>
                </div>
                <p className="text-sm font-bold text-red-400 shrink-0">{formatCurrency(exp.amount)}</p>
                <button onClick={() => setEditingExpense(exp)}
                  title="Edit / Delete"
                  className="p-1.5 rounded text-slate-400 hover:text-indigo-400 transition-colors shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          {expenses.filter(exp => {
            const now = new Date()
            const d = new Date(exp.date)
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
          }).length === 0 && (
            <div className="text-center py-8 text-sm text-slate-600 border border-dashed border-slate-800 rounded-xl">
              No expenses recorded this month yet.
            </div>
          )}
        </div>

        {/* Top clients */}
        {d.topClients.length > 0 && (
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Top Clients by Revenue</p>
            {d.topClients.map((c, i) => {
              const maxRev = d.topClients[0].revenue
              return (
                <div key={c.id || i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300 truncate">{c.name}</span>
                      <span className="text-xs text-green-400 font-semibold">{formatCurrency(c.revenue)}</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500/60 rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%` }} />
                    </div>
                  </div>
                  {c.id && (
                    <button onClick={() => handleDeleteClient(c.id, c.name)}
                      title={`Delete ${c.name}`}
                      className="p-1 rounded text-slate-700 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
