'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CreditCard } from 'lucide-react'
import type { Client, BillingPlan } from '@/types'

export interface BillingFormData {
  cycle_type: string
  amount: number
  currency: string
  custom_days?: number
  next_invoice_date: string
}

export interface PackageFormData {
  name: string
  total: number
}

interface Props {
  initial?: Partial<Client>
  onSave: (data: Partial<Client>, billing?: BillingFormData, pkg?: PackageFormData) => Promise<void>
  onCancel: () => void
}

const CYCLE_OPTIONS = [
  { value: '',              label: 'None (no auto-billing)' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'every_15_days', label: 'Every 15 Days' },
  { value: 'every_10_days', label: 'Every 10 Days' },
  { value: 'manual',        label: 'After Package Completion' },
  { value: 'custom_days',   label: 'Custom (every N days)' },
]

const CURRENCIES = ['USD', 'EGP', 'EUR', 'GBP', 'SAR', 'AED']

function getInitialBilling(p?: BillingPlan) {
  if (!p) return { cycle: '', amount: '', currency: 'USD', custom_days: '30', first_date: new Date().toISOString().split('T')[0] }
  // Map custom_days=15 back to the "every_15_days" UI value
  const cycle = (p.cycle_type === 'custom_days' && p.custom_days === 15) ? 'every_15_days' : p.cycle_type
  return {
    cycle,
    amount:      String(p.amount ?? ''),
    currency:    p.currency ?? 'USD',
    custom_days: String(p.custom_days ?? '30'),
    first_date:  p.next_invoice_date ?? new Date().toISOString().split('T')[0],
  }
}

export default function ClientForm({ initial, onSave, onCancel }: Props) {
  const existingPlan = initial?.billing_plans?.[0]
  const [form, setForm] = useState({
    name:    initial?.name    ?? '',
    email:   initial?.email   ?? '',
    phone:   initial?.phone   ?? '',
    status:  initial?.status  ?? 'pending',
    country: initial?.country ?? '',
    notes:   initial?.notes   ?? '',
  })
  const [billing, setBilling] = useState(getInitialBilling(existingPlan))
  const [pkg, setPkg] = useState({ name: '', total: '' })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }
  function setB(k: string, v: string) { setBilling((b) => ({ ...b, [k]: v })) }
  function setP(k: string, v: string) { setPkg((p) => ({ ...p, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    let billingData: BillingFormData | undefined
    if (billing.cycle && billing.amount) {
      const cycle_type  = billing.cycle === 'every_15_days' ? 'custom_days' : billing.cycle
      const custom_days = billing.cycle === 'every_15_days' ? 15
                        : billing.cycle === 'custom_days'   ? Number(billing.custom_days)
                        : undefined
      billingData = {
        cycle_type,
        amount:           Number(billing.amount),
        currency:         billing.currency,
        custom_days,
        next_invoice_date: billing.first_date,
      }
    }

    const pkgData: PackageFormData | undefined = pkg.name && pkg.total
      ? { name: pkg.name, total: Number(pkg.total) }
      : undefined

    await onSave(form as Partial<Client>, billingData, pkgData)
    setLoading(false)
  }

  const showCustomDays  = billing.cycle === 'custom_days'
  const showDateAndAmt  = billing.cycle !== '' && billing.cycle !== 'manual'
  const showManualNote  = billing.cycle === 'manual'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ── Client Info ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Corp" required />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@acme.com" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1 234 567 890" />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Country</Label>
        <Input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="United States" />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Additional notes…" rows={2} />
      </div>

      {/* ── Payment Terms ── */}
      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-300">Payment Terms</span>
          <span className="text-xs text-slate-500">(auto-generates invoices)</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Billing Cycle</Label>
            <Select value={billing.cycle} onValueChange={(v) => setB('cycle', v)}>
              <SelectTrigger><SelectValue placeholder="Select cycle…" /></SelectTrigger>
              <SelectContent>
                {CYCLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {billing.cycle !== '' && (
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={billing.currency} onValueChange={(v) => setB('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {showCustomDays && (
          <div className="space-y-2">
            <Label>Every N Days</Label>
            <Input type="number" min={1} value={billing.custom_days} onChange={(e) => setB('custom_days', e.target.value)} placeholder="30" />
          </div>
        )}

        {showDateAndAmt && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Invoice Amount</Label>
              <Input type="number" min={0} step="0.01" value={billing.amount} onChange={(e) => setB('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>First Invoice Date</Label>
              <Input type="date" value={billing.first_date} onChange={(e) => setB('first_date', e.target.value)} />
            </div>
          </div>
        )}

        {showManualNote && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Invoice Amount</Label>
              <Input type="number" min={0} step="0.01" value={billing.amount} onChange={(e) => setB('amount', e.target.value)} placeholder="0.00" />
            </div>
            <p className="text-xs text-slate-500 self-end pb-1">Invoices are created manually — no auto-send.</p>
          </div>
        )}
      </div>

      {/* ── Package (optional) ── */}
      {!initial?.id && (
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-300">Package</span>
            <span className="text-xs text-slate-500">(optional — for payment progress tracking)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Package Name</Label>
              <Input
                value={pkg.name}
                onChange={(e) => setP('name', e.target.value)}
                placeholder="e.g. Social Media Q3"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Contract Value</Label>
              <Input
                type="number" min={0} step="0.01"
                value={pkg.total}
                onChange={(e) => setP('total', e.target.value)}
                placeholder={billing.amount ? `e.g. ${billing.amount}` : '0.00'}
              />
            </div>
          </div>
          {pkg.name && pkg.total && (
            <p className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
              Payment progress will be tracked — mark each invoice as received to update the progress bar.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial?.id ? 'Update Client' : 'Create Client'}
        </Button>
      </div>
    </form>
  )
}
