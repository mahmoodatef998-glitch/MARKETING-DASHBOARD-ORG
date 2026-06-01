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
  sent:    'bg-blue-500/20 text-blue-400',
  paid:    'bg-green-500/20 text-green-400',
  overdue: 'bg-red-500/20 text-red-400',
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

function InvoiceRow({
  inv, onEdit, onDelete,
}: { inv: Invoice; onEdit: () => void; onDelete: () => void }) {
  const client = inv.client as { name?: string } | null
  return (
    <Card className="hover:border-slate-600 transition-colors">
      <CardContent className="py-3.5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-violet-400">#{inv.invoice_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status]}`}>
              {inv.status}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            {client?.name && <span>{client.name}</span>}
            {inv.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatDate(inv.due_date)}
              </span>
            )}
            <span>{inv.items?.length ?? 0} items</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-slate-100">{formatCurrency(inv.total)}</p>
          {inv.tax ? <p className="text-xs text-slate-500">incl. {inv.tax}% tax</p> : null}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Download"
            onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
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

function BillingCard({
  client, tasks,
}: { client: Client; tasks: Task[] }) {
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
        {/* Header */}
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

        {/* Next invoice */}
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

        {/* Package progress */}
        {total > 0 ? (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Package Progress
              </span>
              <span className="text-slate-300 font-medium">{done}/{total} tasks · {pct}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
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
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients,  setClients]  = useState<Client[]>([])
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [open,     setOpen]     = useState(false)
  const [editing,  setEditing]  = useState<Invoice | null>(null)

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
      if (res.ok) { toast('Invoice updated', 'success'); setOpen(false); load() }
      else toast('Failed to update', 'error')
    } else {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Invoice created', 'success'); setOpen(false); load() }
      else toast('Failed to create', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Invoice deleted', 'success'); load() }
    else toast('Failed to delete', 'error')
  }

  // Split invoices
  const matches = (inv: Invoice) => {
    const client = inv.client as { name?: string } | null
    const q = search.toLowerCase()
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      client?.name?.toLowerCase().includes(q) ||
      !q
    )
  }

  const activeInvoices = invoices.filter((i) => i.status !== 'paid' && matches(i))
  const doneInvoices   = invoices.filter((i) => i.status === 'paid'  && matches(i))

  // Clients with active billing plans (scheduled)
  const billingClients = clients.filter((c) =>
    c.billing_plans?.some((p) => p.is_active && p.cycle_type !== 'manual') &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  )

  // Stats
  const totalRevenue   = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const pendingRevenue = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', value: invoices.length,                                color: 'text-slate-100' },
          { label: 'Paid Revenue',   value: formatCurrency(totalRevenue),                   color: 'text-green-400' },
          { label: 'Pending',        value: formatCurrency(pendingRevenue),                  color: 'text-yellow-400' },
          { label: 'Overdue',        value: invoices.filter((i) => i.status === 'overdue').length, color: 'text-red-400' },
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
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
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
          {/* ── ACTIVE SECTION ───────────────────────────────────────── */}
          <div>
            <SectionRibbon
              label="ACTIVE"
              color="violet"
              icon={<Clock className="h-3.5 w-3.5 animate-pulse" />}
              count={billingClients.length + activeInvoices.length}
            />

            {/* Billing schedule cards */}
            {billingClients.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
                {billingClients.map((client) => (
                  <BillingCard key={client.id} client={client} tasks={tasks} />
                ))}
              </div>
            )}

            {/* Existing active invoices */}
            {activeInvoices.length > 0 ? (
              <div className="space-y-2">
                {activeInvoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    onEdit={() => { setEditing(inv); setOpen(true) }}
                    onDelete={() => handleDelete(inv.id)}
                  />
                ))}
              </div>
            ) : billingClients.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-slate-400 text-sm">No active invoices.</p>
                  <Button className="mt-3" onClick={() => { setEditing(null); setOpen(true) }}>
                    <Plus className="h-4 w-4" /> Create Invoice
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* ── DONE SECTION ─────────────────────────────────────────── */}
          {doneInvoices.length > 0 && (
            <div>
              <SectionRibbon
                label="DONE"
                color="green"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                count={doneInvoices.length}
              />
              <div className="space-y-2">
                {doneInvoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    onEdit={() => { setEditing(inv); setOpen(true) }}
                    onDelete={() => handleDelete(inv.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
          </DialogHeader>
          <InvoiceForm
            initial={editing ?? undefined}
            clients={clients}
            onSave={handleSave}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
