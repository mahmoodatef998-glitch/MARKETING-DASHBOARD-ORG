'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, Trash2, Zap, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { BillingPlan, Client } from '@/types'

type PlanWithClient = BillingPlan & { client: Pick<Client, 'id' | 'name' | 'email'> | null }

const CYCLE_OPTIONS = [
  { value: 'monthly',       label: 'Monthly' },
  { value: 'biweekly',      label: 'Every 2 Weeks' },
  { value: 'every_10_days', label: 'Every 10 Days' },
  { value: 'custom_days',   label: 'Custom (every N days)' },
  { value: 'manual',        label: 'Manual Only' },
]

const CURRENCY_OPTIONS = ['USD', 'EGP', 'EUR', 'GBP', 'SAR', 'AED']

const cycleLabel = (p: BillingPlan) => {
  const opt = CYCLE_OPTIONS.find((o) => o.value === p.cycle_type)?.label ?? p.cycle_type
  if (p.cycle_type === 'custom_days' && p.custom_days) return `Every ${p.custom_days} days`
  return opt
}

function PlanForm({
  initial, clients, onSave, onCancel,
}: {
  initial?: Partial<BillingPlan>
  clients: Client[]
  onSave: (d: Partial<BillingPlan>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    client_id:         initial?.client_id ?? '',
    cycle_type:        initial?.cycle_type ?? 'monthly',
    amount:            String(initial?.amount ?? ''),
    currency:          initial?.currency ?? 'USD',
    custom_days:       String(initial?.custom_days ?? '30'),
    next_invoice_date: initial?.next_invoice_date ?? new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      client_id:         form.client_id,
      cycle_type:        form.cycle_type as BillingPlan['cycle_type'],
      amount:            Number(form.amount),
      currency:          form.currency,
      custom_days:       form.cycle_type === 'custom_days' ? Number(form.custom_days) : undefined,
      next_invoice_date: form.next_invoice_date,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Client *</Label>
        <Select value={form.client_id} onValueChange={(v) => set('client_id', v)} required>
          <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Billing Cycle *</Label>
          <Select value={form.cycle_type} onValueChange={(v) => set('cycle_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CYCLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {form.cycle_type === 'custom_days' && (
          <div className="space-y-2">
            <Label>Every N days *</Label>
            <Input
              type="number" min="1" max="365"
              value={form.custom_days}
              onChange={(e) => set('custom_days', e.target.value)}
              placeholder="e.g. 45"
              required
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input
            type="number" min="0.01" step="0.01"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="e.g. 1500"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>First Invoice Date *</Label>
        <Input
          type="date"
          value={form.next_invoice_date}
          onChange={(e) => set('next_invoice_date', e.target.value)}
          className="text-slate-300"
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial?.id ? 'Update Plan' : 'Create Plan'}
        </Button>
      </div>
    </form>
  )
}

export default function BillingPage() {
  const { toast } = useToast()
  const [plans, setPlans] = useState<PlanWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PlanWithClient | null>(null)

  async function load() {
    const [pr, cr] = await Promise.all([
      fetch('/api/billing-plans').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
    ])
    setPlans(Array.isArray(pr) ? pr : [])
    setClients(Array.isArray(cr) ? cr : [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleSave(data: Partial<BillingPlan>) {
    if (editing) {
      const res = await fetch(`/api/billing-plans/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Plan updated', 'success'); setOpen(false); load() }
      else toast('Failed to update', 'error')
    } else {
      const res = await fetch('/api/billing-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (res.ok) { toast('Plan created', 'success'); setOpen(false); load() }
      else toast('Failed to create', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this billing plan?')) return
    const res = await fetch(`/api/billing-plans/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Plan deleted', 'success'); load() }
    else toast('Failed to delete', 'error')
  }

  async function toggleActive(plan: PlanWithClient) {
    const res = await fetch(`/api/billing-plans/${plan.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !plan.is_active }),
    })
    if (res.ok) { toast(plan.is_active ? 'Plan paused' : 'Plan activated', 'success'); load() }
    else toast('Failed to update', 'error')
  }

  async function generateNow() {
    setGenerating(true)
    try {
      const res = await fetch('/api/cron/daily')
      const json = await res.json() as { processed?: number }
      toast(`Generated invoices for ${json.processed ?? 0} item(s)`, 'success')
      load()
    } catch {
      toast('Failed to generate invoices', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const duePlans = plans.filter((p) => p.is_active && p.next_invoice_date <= today)

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-slate-400">
            {plans.length} plan{plans.length !== 1 ? 's' : ''} &middot; {duePlans.length} due today
          </p>
        </div>

        {duePlans.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={generateNow}
            disabled={generating}
            className="gap-1.5 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400"
          >
            {generating
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
              : <><Zap className="h-4 w-4" /> Generate {duePlans.length} Invoice{duePlans.length !== 1 ? 's' : ''}</>}
          </Button>
        )}

        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {/* Plans list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-slate-400 text-sm">No billing plans yet.</p>
            <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus className="h-4 w-4" /> Create First Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isDue = plan.is_active && plan.next_invoice_date <= today
            return (
              <Card key={plan.id} className={`transition-colors ${isDue ? 'border-indigo-500/40' : 'hover:border-slate-600'}`}>
                <CardContent className="py-4 flex items-center gap-4">
                  {/* Active toggle */}
                  <button onClick={() => toggleActive(plan)} className="shrink-0">
                    {plan.is_active
                      ? <CheckCircle className="h-5 w-5 text-green-400 hover:text-green-300 transition-colors" />
                      : <XCircle className="h-5 w-5 text-slate-600 hover:text-slate-400 transition-colors" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-100 text-sm">
                        {plan.client?.name ?? 'Unknown client'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                        {cycleLabel(plan)}
                      </span>
                      {!plan.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Paused</span>
                      )}
                      {isDue && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium animate-pulse">
                          Due today
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      {plan.client?.email && <span>{plan.client.email}</span>}
                      <span>Next invoice: {formatDate(plan.next_invoice_date)}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-100 text-sm">
                      {formatCurrency(plan.amount, plan.currency)}
                    </p>
                    <p className="text-xs text-slate-500">{plan.currency}</p>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(plan); setOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Billing Plan' : 'New Billing Plan'}</DialogTitle>
          </DialogHeader>
          <PlanForm
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
