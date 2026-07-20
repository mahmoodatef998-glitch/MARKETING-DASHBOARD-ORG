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
  ArrowLeft, Trash2, Loader2, RefreshCw, Pencil, X,
  TrendingUp, FileText, HandCoins, ExternalLink,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { IncomeItem, IncomeCategory } from '@/types'

const CATEGORIES: { value: IncomeCategory; label: string }[] = [
  { value: 'services',   label: 'Services' },
  { value: 'refund',     label: 'Refund' },
  { value: 'grant',      label: 'Grant' },
  { value: 'investment', label: 'Investment' },
  { value: 'other',      label: 'Other' },
]

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  return { from, to }
}

function IncomeForm({ initial, onSave, onCancel }: {
  initial?: Partial<IncomeItem>
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    amount: initial?.amount != null ? String(initial.amount) : '',
    category: (initial?.category ?? '') as IncomeCategory | '',
    date: initial?.date ?? new Date().toISOString().split('T')[0],
    notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      title: form.title,
      amount: Number(form.amount),
      category: form.category || undefined,
      date: form.date,
      notes: form.notes || undefined,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Title *</Label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Consulting fee" required />
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
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

export default function IncomePage() {
  const router = useRouter()
  const { toast } = useToast()
  const now = new Date()

  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [filter, setFilter]   = useState<'all' | 'invoice' | 'manual'>('all')
  const [items, setItems]     = useState<IncomeItem[]>([])
  const [totals, setTotals]   = useState({ total: 0, invoiceTotal: 0, manualTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<IncomeItem | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || p.role !== 'admin') router.replace('/dashboard')
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = monthBounds(year, month)
    const source = filter === 'all' ? '' : `&source=${filter}`
    const res = await fetch(`/api/income?from=${from}&to=${to}${source}`)
    const data = await res.json()
    if (res.ok) {
      setItems(data.items ?? [])
      setTotals({ total: data.total ?? 0, invoiceTotal: data.invoiceTotal ?? 0, manualTotal: data.manualTotal ?? 0 })
    }
    setLoading(false)
  }, [year, month, filter])

  useEffect(() => { void load() }, [load])

  async function addManual(data: Record<string, unknown>) {
    const res = await fetch('/api/income', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { toast('Income added ✓', 'success'); setShowForm(false); void load() }
    else toast('Failed to add income', 'error')
  }

  async function updateManual(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/income/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { toast('Updated ✓', 'success'); setEditing(null); void load() }
    else toast('Failed to update', 'error')
  }

  async function deleteManual(id: string) {
    const res = await fetch(`/api/income/${id}`, { method: 'DELETE' })
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
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Income · الدخل</h1>
            <p className="text-sm text-slate-500 mt-0.5">Invoice payments + manual entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowForm(v => !v)} variant="outline" className="gap-1.5">
            {showForm ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><HandCoins className="h-3.5 w-3.5" /> Manual Income</>}
          </Button>
          <Link href="/invoices">
            <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white">
              <FileText className="h-3.5 w-3.5" /> Via Invoice
            </Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Filters + totals */}
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
        <div className="flex rounded-xl border border-slate-700 overflow-hidden text-xs">
          {(['all', 'invoice', 'manual'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              {f === 'all' ? 'All' : f === 'invoice' ? 'Invoices' : 'Manual'}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] flex flex-wrap gap-4 text-sm ml-auto">
          <div><span className="text-slate-500">Invoices: </span><span className="text-indigo-400 font-semibold">{formatCurrency(totals.invoiceTotal)}</span></div>
          <div><span className="text-slate-500">Manual: </span><span className="text-emerald-400 font-semibold">{formatCurrency(totals.manualTotal)}</span></div>
          <div><span className="text-slate-500">Total: </span><span className="text-green-300 font-bold">{formatCurrency(totals.total)}</span></div>
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
          <p className="text-sm font-semibold text-slate-200 mb-3">Add Manual Income · دخل يدوي</p>
          <IncomeForm onSave={addManual} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <TrendingUp className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">No income recorded this month</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => setShowForm(true)} variant="outline">Add Manual Income</Button>
            <Link href="/invoices"><Button size="sm">Create Invoice</Button></Link>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2.5">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${
                item.source === 'invoice'
                  ? 'text-indigo-400 bg-indigo-500/15 border-indigo-500/25'
                  : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25'
              }`}>
                {item.source === 'invoice' ? <FileText className="h-3.5 w-3.5" /> : <HandCoins className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-200 truncate">{item.title}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                    item.source === 'invoice'
                      ? 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
                      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                  }`}>
                    {item.source === 'invoice' ? 'Invoice' : 'Manual'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {formatDate(item.date)}
                  {item.client_name ? ` · ${item.client_name}` : ''}
                  {item.payment_method ? ` · ${item.payment_method}` : ''}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
              <p className="text-sm font-bold text-green-400 shrink-0">{formatCurrency(item.amount)}</p>
              {item.source === 'invoice' && item.invoice_id && (
                <Link href="/invoices" className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-400 hover:bg-slate-800 transition-colors" title="View invoices">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
              {item.editable && (
                <button onClick={() => setEditing(item)} className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-400 hover:bg-slate-800 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Edit Manual Income</DialogTitle></DialogHeader>
            <IncomeForm
              initial={editing}
              onSave={async data => updateManual(editing.id, data)}
              onCancel={() => setEditing(null)}
            />
            <button onClick={() => { if (confirm(`Delete "${editing.title}"?`)) void deleteManual(editing.id) }}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 mt-2">
              <Trash2 className="h-3.5 w-3.5" /> Delete entry
            </button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
