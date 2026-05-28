'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Search, Pencil, Trash2, Download, Loader2, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { printInvoicePDF } from '@/lib/pdf'
import type { Invoice, Client, InvoiceItem } from '@/types'

function InvoiceForm({
  initial, clients, onSave, onCancel,
}: {
  initial?: Partial<Invoice>
  clients: Client[]
  onSave: (d: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? '',
    status: initial?.status ?? 'draft',
    due_date: initial?.due_date ?? '',
    tax: initial?.tax ?? 0,
    notes: initial?.notes ?? '',
  })
  const [items, setItems] = useState<Partial<InvoiceItem>[]>(
    initial?.items ?? [{ description: '', quantity: 1, unit_price: 0 }]
  )
  const [loading, setLoading] = useState(false)

  function setField(k: string, v: any) { setForm((f) => ({ ...f, [k]: v })) }
  function setItem(i: number, k: string, v: any) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  }
  function addItem() { setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]) }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)) }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const total = subtotal + subtotal * (Number(form.tax) / 100)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSave({ ...form, items, subtotal, total })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Client *</Label>
          <Select value={form.client_id} onValueChange={(v) => setField('client_id', v)} required>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setField('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['draft', 'sent', 'paid', 'overdue'].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
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

      {/* Items */}
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
                ${((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toFixed(0)}
              </div>
              <div className="col-span-1 flex justify-end">
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="p-1.5 rounded text-slate-500 hover:text-red-400 mt-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </div>

      {/* Totals */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {Number(form.tax) > 0 && <div className="flex justify-between text-slate-400"><span>Tax ({form.tax}%)</span><span>{formatCurrency(subtotal * Number(form.tax) / 100)}</span></div>}
        <div className="flex justify-between font-bold text-slate-100 pt-1 border-t border-slate-700"><span>Total</span><span>{formatCurrency(total)}</span></div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Payment terms, thank you note…" rows={2} />
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

const statusColors: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  sent: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-green-500/20 text-green-400',
  overdue: 'bg-red-500/20 text-red-400',
}

function downloadInvoice(invoice: Invoice) {
  printInvoicePDF(invoice)
}

export default function InvoicesPage() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)

  async function load() {
    const [ir, cr] = await Promise.all([
      fetch('/api/invoices?limit=200').then((r) => r.json()),
      fetch('/api/clients?page=all').then((r) => r.json()),
    ])
    setInvoices(Array.isArray(ir) ? ir : (ir.data ?? []))
    setClients(Array.isArray(cr) ? cr : (cr.data ?? []))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSave(data: any) {
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

  const filtered = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.client as any)?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const pendingRevenue = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  return (
    <div className="space-y-5">
      {/* Revenue summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', value: invoices.length, color: 'text-slate-100' },
          { label: 'Paid Revenue', value: formatCurrency(totalRevenue), color: 'text-green-400' },
          { label: 'Pending', value: formatCurrency(pendingRevenue), color: 'text-yellow-400' },
          { label: 'Overdue', value: invoices.filter((i) => i.status === 'overdue').length, color: 'text-red-400' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search invoices…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const client = inv.client as any
            return (
              <Card key={inv.id} className="hover:border-slate-600 transition-colors">
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-indigo-400">#{inv.invoice_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status]}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                      {client?.name && <span>{client.name}</span>}
                      {inv.due_date && <span>Due {formatDate(inv.due_date)}</span>}
                      <span>{inv.items?.length ?? 0} items</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-100">{formatCurrency(inv.total)}</p>
                    {inv.tax ? <p className="text-xs text-slate-500">incl. {inv.tax}% tax</p> : null}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Download" onClick={() => downloadInvoice({ ...inv, client })}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(inv); setOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {filtered.length === 0 && (
            <Card><CardContent className="py-16 text-center">
              <p className="text-slate-400 text-sm">No invoices found.</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true) }}>
                <Plus className="h-4 w-4" /> Create First Invoice
              </Button>
            </CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
          </DialogHeader>
          <InvoiceForm initial={editing ?? undefined} clients={clients} onSave={handleSave} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
