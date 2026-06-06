'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Search, Pencil, Trash2, Download, Loader2, X,
  Calendar, CheckCircle2, Clock, CreditCard, TrendingUp,
  AlertTriangle, BadgeCheck, ChevronRight, FileText,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, Client, InvoiceItem, Task, BillingPlan } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const CYCLE_LABELS: Record<string, string> = {
  monthly:       'Monthly',
  biweekly:      'Every 2 Weeks',
  every_10_days: 'Every 10 Days',
  custom_days:   'Custom',
  manual:        'Manual',
}

function cycleLabel(plan: BillingPlan) {
  if (plan.cycle_type === 'custom_days' && plan.custom_days) return `Every ${plan.custom_days} Days`
  return CYCLE_LABELS[plan.cycle_type] ?? plan.cycle_type
}

function currSym(currency: string) {
  const m: Record<string, string> = { EGP: 'EGP ', EUR: '€', GBP: '£', AED: 'AED ', USD: '$' }
  return m[currency] ?? currency + ' '
}

const statusColors: Record<string, string> = {
  draft:   'bg-slate-700 text-slate-300',
  sent:    'bg-blue-500/20 text-blue-300 border border-blue-500/20',
  paid:    'bg-green-500/20 text-green-300 border border-green-500/20',
  overdue: 'bg-red-500/20 text-red-300 border border-red-500/20',
}

const statusIcons: Record<string, React.ReactNode> = {
  draft:   <FileText className="h-3 w-3" />,
  sent:    <Clock className="h-3 w-3" />,
  paid:    <BadgeCheck className="h-3 w-3" />,
  overdue: <AlertTriangle className="h-3 w-3" />,
}

// ── Invoice Details Modal ──────────────────────────────────────────────────────

function InvoiceDetailsModal({
  inv, onClose, onUpdate, onEdit, onDelete,
}: {
  inv: Invoice
  onClose: () => void
  onUpdate: (updated: Invoice) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { toast }      = useToast()
  const [loading, setLoading] = useState<'paid' | 'overdue' | null>(null)
  const [nextDate, setNextDate] = useState<string | null>(null)

  const client    = inv.client as { name?: string; email?: string } | null
  const isOverdue = inv.status === 'overdue'
  const isSent    = inv.status === 'sent'
  const isPaid    = inv.status === 'paid'
  const pastDue   = inv.due_date && new Date(inv.due_date) < new Date() && !isPaid

  async function markPaid() {
    setLoading('paid')
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'mark_paid' }),
    })
    if (res.ok) {
      const data = await res.json()
      setNextDate(data.nextInvoiceDate ?? null)
      onUpdate({ ...inv, status: 'paid' })
      toast('Invoice marked as paid ✓', 'success')
    } else {
      toast('Failed to update', 'error')
    }
    setLoading(null)
  }

  async function markOverdue() {
    setLoading('overdue')
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'mark_overdue' }),
    })
    if (res.ok) {
      onUpdate({ ...inv, status: 'overdue' })
      toast('Marked as overdue', 'success')
    } else {
      toast('Failed to update', 'error')
    }
    setLoading(null)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ── Header ── */}
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold text-violet-400">#{inv.invoice_number}</span>
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[inv.status]}`}>
                {statusIcons[inv.status]}
                {inv.status.toUpperCase()}
              </span>
              {pastDue && !isPaid && (
                <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" /> PAST DUE
                </span>
              )}
            </div>
            <DialogTitle className="sr-only">Invoice {inv.invoice_number}</DialogTitle>
          </div>
        </DialogHeader>

        {/* ── Paid success banner ── */}
        {nextDate && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-300 text-sm">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            <span>Paid! Next invoice scheduled for <strong>{formatDate(nextDate)}</strong></span>
          </div>
        )}

        {/* ── Client & dates ── */}
        <div className="grid grid-cols-2 gap-4 py-1">
          <div className="bg-slate-800/50 rounded-xl p-3 space-y-0.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Client</p>
            <p className="text-white font-semibold text-sm">{client?.name ?? '—'}</p>
            {client?.email && <p className="text-xs text-slate-400">{client.email}</p>}
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Dates</p>
            {inv.issued_date && (
              <p className="text-xs text-slate-300 flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-slate-500" />
                Issued: {formatDate(inv.issued_date)}
              </p>
            )}
            {inv.due_date && (
              <p className={`text-xs flex items-center gap-1.5 font-medium ${pastDue && !isPaid ? 'text-red-400' : 'text-slate-300'}`}>
                <Clock className={`h-3 w-3 ${pastDue && !isPaid ? 'text-red-400' : 'text-slate-500'}`} />
                Due: {formatDate(inv.due_date)}
                {pastDue && !isPaid && ' ⚠️'}
              </p>
            )}
          </div>
        </div>

        {/* ── Line items ── */}
        {inv.items && inv.items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Line Items</p>
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Description</th>
                    <th className="text-center px-3 py-2.5 text-slate-400 font-medium text-xs w-16">Qty</th>
                    <th className="text-right px-4 py-2.5 text-slate-400 font-medium text-xs w-28">Price</th>
                    <th className="text-right px-4 py-2.5 text-slate-400 font-medium text-xs w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((item, i) => (
                    <tr key={i} className="border-t border-slate-700/60">
                      <td className="px-4 py-3 text-slate-200">{item.description || '—'}</td>
                      <td className="px-3 py-3 text-center text-slate-400">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-100 font-medium">{formatCurrency(item.total ?? item.quantity * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Totals ── */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Subtotal</span><span>{formatCurrency(inv.subtotal ?? inv.total)}</span>
          </div>
          {inv.tax && inv.tax > 0 && (
            <div className="flex justify-between text-sm text-slate-400">
              <span>Tax ({inv.tax}%)</span>
              <span>{formatCurrency((inv.subtotal ?? inv.total) * inv.tax / 100)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-white border-t border-slate-700 pt-2">
            <span>Total</span>
            <span className="text-violet-300">{formatCurrency(inv.total)}</span>
          </div>
        </div>

        {/* ── Notes ── */}
        {inv.notes && (
          <div className="bg-slate-800/30 rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-slate-300">{inv.notes}</p>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
          {/* Mark as Paid */}
          {(isSent || isOverdue) && (
            <Button onClick={markPaid} disabled={!!loading}
              className="gap-2 bg-green-600 hover:bg-green-500 text-white">
              {loading === 'paid'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Marking…</>
                : <><BadgeCheck className="h-4 w-4" /> Mark as Paid</>}
            </Button>
          )}

          {/* Mark as Overdue */}
          {isSent && pastDue && (
            <Button onClick={markOverdue} disabled={!!loading} variant="outline"
              className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10">
              {loading === 'overdue'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
                : <><AlertTriangle className="h-4 w-4" /> Mark Overdue</>}
            </Button>
          )}

          {/* Download PDF */}
          <Button variant="outline" className="gap-2"
            onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>
            <Download className="h-4 w-4" /> PDF
          </Button>

          {/* Edit */}
          {!isPaid && (
            <Button variant="ghost" className="gap-2" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}

          {/* Delete */}
          <Button variant="ghost" className="gap-2 hover:text-red-400 ml-auto" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Invoice Form ───────────────────────────────────────────────────────────────

function InvoiceForm({
  initial, clients, onSave, onCancel,
}: {
  initial?: Partial<Invoice>
  clients: Client[]
  onSave: (d: Omit<Partial<Invoice>, 'items'> & { items: Partial<InvoiceItem>[]; subtotal: number; total: number }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? '',
    status:    initial?.status ?? 'draft',
    due_date:  initial?.due_date ?? '',
    tax:       initial?.tax ?? 0,
    notes:     initial?.notes ?? '',
  })
  const [items, setItems] = useState<Partial<InvoiceItem>[]>(
    initial?.items ?? [{ description: '', quantity: 1, unit_price: 0 }]
  )
  const [loading, setLoading] = useState(false)

  function setField(k: string, v: string | number) { setForm((f) => ({ ...f, [k]: v })) }
  function setItem(i: number, k: string, v: string | number) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const total    = subtotal + subtotal * (Number(form.tax) / 100)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    await onSave({ ...form, items, subtotal, total })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Client *</Label>
          <Select value={form.client_id} onValueChange={(v) => setField('client_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setField('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['draft','sent','paid','overdue'].map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} className="text-slate-300" />
        </div>
        <div className="space-y-2">
          <Label>Tax (%)</Label>
          <Input type="number" min="0" max="100" value={form.tax} onChange={(e) => setField('tax', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Line Items</Label>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-5">
                <Input value={item.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Description" />
              </div>
              <div className="col-span-2">
                <Input type="number" min="1" value={item.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} placeholder="Qty" />
              </div>
              <div className="col-span-3">
                <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} placeholder="Price" />
              </div>
              <div className="col-span-1 text-xs text-slate-400 pt-2.5 text-right">
                {((Number(item.quantity)||0)*(Number(item.unit_price)||0)).toFixed(0)}
              </div>
              <div className="col-span-1 flex justify-end">
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(p => p.filter((_,idx) => idx !== i))}
                    className="p-1.5 rounded text-slate-500 hover:text-red-400 mt-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm"
          onClick={() => setItems(p => [...p, { description:'', quantity:1, unit_price:0 }])}>
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {Number(form.tax) > 0 && (
          <div className="flex justify-between text-slate-400">
            <span>Tax ({form.tax}%)</span><span>{formatCurrency(subtotal * Number(form.tax) / 100)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-slate-100 pt-1 border-t border-slate-700">
          <span>Total</span><span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)}
          placeholder="Payment terms, thank you note…" rows={2} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial?.id ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  )
}

// ── Invoice Row ────────────────────────────────────────────────────────────────

function InvoiceRow({ inv, onClick }: { inv: Invoice; onClick: () => void }) {
  const client  = inv.client as { name?: string } | null
  const pastDue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid'

  return (
    <Card
      className={`cursor-pointer hover:border-slate-500 transition-all duration-150 group ${
        inv.status === 'overdue' || pastDue ? 'border-red-500/30 bg-red-500/5' : ''
      } ${inv.status === 'paid' ? 'opacity-75' : ''}`}
      onClick={onClick}
    >
      <CardContent className="py-3.5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-violet-400">#{inv.invoice_number}</span>
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status]}`}>
              {statusIcons[inv.status]}
              {inv.status}
            </span>
            {pastDue && inv.status !== 'paid' && inv.status !== 'overdue' && (
              <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20">
                PAST DUE
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            {client?.name && <span>{client.name}</span>}
            {inv.due_date && (
              <span className={`flex items-center gap-1 ${pastDue && inv.status !== 'paid' ? 'text-red-400' : ''}`}>
                <Calendar className="h-3 w-3" /> {formatDate(inv.due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-slate-100">{formatCurrency(inv.total)}</p>
          <p className="text-xs text-slate-500">{inv.status}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
      </CardContent>
    </Card>
  )
}

// ── Section Ribbon ─────────────────────────────────────────────────────────────

function SectionRibbon({ label, color, icon, count }: {
  label: string; color: 'violet' | 'green'; icon: React.ReactNode; count: number
}) {
  const styles = {
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
    green:  'bg-green-500/10  border-green-500/30  text-green-400',
  }
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`flex items-center gap-2 border rounded-full px-4 py-1.5 ${styles[color]}`}>
        {icon}
        <span className="text-sm font-bold tracking-wide">{label}</span>
        <span className="text-xs opacity-70 font-medium">{count}</span>
      </div>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  )
}

// ── Billing Schedule Card ──────────────────────────────────────────────────────

function BillingCard({ client, tasks }: { client: Client; tasks: Task[] }) {
  const plan = client.billing_plans?.find((p) => p.is_active)
  if (!plan || plan.cycle_type === 'manual') return null

  const today  = new Date().toISOString().split('T')[0]
  const clientTasks = tasks.filter((t) => t.client_id === client.id)
  const done   = clientTasks.filter((t) => t.status === 'done').length
  const total  = clientTasks.length
  const pct    = total > 0 ? Math.round((done / total) * 100) : 0
  const sym    = currSym(plan.currency)
  const isDue  = plan.next_invoice_date <= today

  const barColor =
    pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-violet-500' : pct >= 25 ? 'bg-orange-400' : 'bg-red-500'

  return (
    <Card className="border-violet-500/20 bg-violet-950/10 hover:border-violet-500/40 transition-colors">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-slate-100 text-sm">{client.name}</p>
            <p className="text-xs text-violet-400 mt-0.5 flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              {cycleLabel(plan)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-slate-100">{sym}{plan.amount.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{plan.currency}</p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 text-xs mb-3 px-2.5 py-1.5 rounded-lg ${
          isDue
            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
            : 'bg-slate-800/50 text-slate-400'
        }`}>
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>
            {isDue
              ? 'Invoice generating soon…'
              : `Next invoice: ${formatDate(plan.next_invoice_date)}`}
          </span>
        </div>

        {total > 0 ? (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Package Progress
              </span>
              <span className="text-slate-300 font-medium">{done}/{total} tasks · {pct}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic">No tasks linked to this client yet</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { toast } = useToast()
  const [invoices,  setInvoices]  = useState<Invoice[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [formOpen,  setFormOpen]  = useState(false)
  const [editing,   setEditing]   = useState<Invoice | null>(null)
  const [detailInv, setDetailInv] = useState<Invoice | null>(null)

  async function load() {
    try {
      const [ir, cr, tr] = await Promise.all([
        fetch('/api/invoices?limit=200').then((r) => r.json()),
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/tasks').then((r) => r.json()),
      ])
      setInvoices(Array.isArray(ir) ? ir : (ir.data ?? []))
      setClients(Array.isArray(cr) ? cr : (cr.data ?? []))
      setTasks(Array.isArray(tr) ? tr : [])
    } catch {
      setInvoices([]); setClients([]); setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleSave(
    data: Omit<Partial<Invoice>, 'items'> & { items: Partial<InvoiceItem>[]; subtotal: number; total: number }
  ) {
    if (editing) {
      const res = await fetch(`/api/invoices/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Invoice updated', 'success'); setFormOpen(false); load() }
      else toast('Failed to update', 'error')
    } else {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Invoice created', 'success'); setFormOpen(false); load() }
      else toast('Failed to create', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast('Invoice deleted', 'success')
      setDetailInv(null)
      load()
    } else {
      toast('Failed to delete', 'error')
    }
  }

  const matches = (inv: Invoice) => {
    const client = inv.client as { name?: string } | null
    const q = search.toLowerCase()
    return inv.invoice_number.toLowerCase().includes(q) || client?.name?.toLowerCase().includes(q) || !q
  }

  const activeInvoices = invoices.filter((i) => i.status !== 'paid' && matches(i))
  const doneInvoices   = invoices.filter((i) => i.status === 'paid'  && matches(i))

  const billingClients = clients.filter((c) =>
    c.billing_plans?.some((p) => p.is_active && p.cycle_type !== 'manual') &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  )

  const totalRevenue   = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const pendingRevenue = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', value: invoices.length,                                          color: 'text-slate-100' },
          { label: 'Paid Revenue',   value: formatCurrency(totalRevenue),                             color: 'text-green-400' },
          { label: 'Pending',        value: formatCurrency(pendingRevenue),                           color: 'text-yellow-400' },
          { label: 'Overdue',        value: invoices.filter((i) => i.status === 'overdue').length,    color: 'text-red-400' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search invoices or clients…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => window.open('/api/export?type=invoices', '_blank')}
          className="gap-1.5 text-slate-400 hover:text-slate-100">
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── ACTIVE ── */}
          <div>
            <SectionRibbon
              label="ACTIVE"
              color="violet"
              icon={<Clock className="h-3.5 w-3.5 animate-pulse" />}
              count={billingClients.length + activeInvoices.length}
            />
            {billingClients.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
                {billingClients.map((client) => (
                  <BillingCard key={client.id} client={client} tasks={tasks} />
                ))}
              </div>
            )}
            {activeInvoices.length > 0 ? (
              <div className="space-y-2">
                {activeInvoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} onClick={() => setDetailInv(inv)} />
                ))}
              </div>
            ) : billingClients.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-slate-400 text-sm">No active invoices.</p>
                  <Button className="mt-3" onClick={() => { setEditing(null); setFormOpen(true) }}>
                    <Plus className="h-4 w-4" /> Create Invoice
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* ── PAID ── */}
          {doneInvoices.length > 0 && (
            <div>
              <SectionRibbon
                label="PAID"
                color="green"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                count={doneInvoices.length}
              />
              <div className="space-y-2">
                {doneInvoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} onClick={() => setDetailInv(inv)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Invoice Details Modal */}
      {detailInv && (
        <InvoiceDetailsModal
          inv={detailInv}
          onClose={() => setDetailInv(null)}
          onUpdate={(updated) => {
            setDetailInv(updated)
            setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
          }}
          onEdit={() => { setEditing(detailInv); setDetailInv(null); setFormOpen(true) }}
          onDelete={() => handleDelete(detailInv.id)}
        />
      )}

      {/* Create / Edit Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
          </DialogHeader>
          <InvoiceForm
            initial={editing ?? undefined}
            clients={clients}
            onSave={handleSave}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
