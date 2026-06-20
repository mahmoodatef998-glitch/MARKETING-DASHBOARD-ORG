'use client'
import { useEffect, useState } from 'react'
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
  Plus, Search, Pencil, Trash2, Download, Loader2, X,
  Calendar, CheckCircle2, Clock, CreditCard, TrendingUp,
  AlertTriangle, BadgeCheck, ChevronRight, FileText, Send,
  Banknote, Wallet, Smartphone, Building2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, Client, InvoiceItem, Task, BillingPlan, InvoicePayment, PaymentMethod, PaymentStructureType, PaymentInstallmentInput } from '@/types'

// ── Payment schedule helpers ───────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function generateSchedule(
  type: PaymentStructureType,
  total: number,
  params: { single_due?: string; advance_pct?: number; advance_due?: string; final_due?: string; start_date?: string; custom?: { installment_no: number; amount: string; due_date: string }[] }
): PaymentInstallmentInput[] {
  if (!total || total <= 0) return []
  if (type === 'single' && params.single_due) {
    return [{ installment_no: 1, amount: total, due_date: params.single_due }]
  }
  if (type === 'split_50_50' && params.advance_due && params.final_due) {
    const pct = (params.advance_pct ?? 50) / 100
    const adv = Math.round(total * pct * 100) / 100
    return [
      { installment_no: 1, amount: adv, due_date: params.advance_due },
      { installment_no: 2, amount: Math.round((total - adv) * 100) / 100, due_date: params.final_due },
    ]
  }
  if (type === 'every_10_days' && params.start_date) {
    const part = Math.floor((total / 3) * 100) / 100
    const rem  = Math.round((total - part * 2) * 100) / 100
    return [
      { installment_no: 1, amount: part, due_date: params.start_date },
      { installment_no: 2, amount: part, due_date: addDays(params.start_date, 10) },
      { installment_no: 3, amount: rem,  due_date: addDays(params.start_date, 20) },
    ]
  }
  if (type === 'custom' && params.custom?.length) {
    return params.custom
      .filter(c => c.due_date && Number(c.amount) > 0)
      .map(c => ({ installment_no: c.installment_no, amount: Number(c.amount), due_date: c.due_date }))
  }
  return []
}

function daysRelative(dateStr: string): number {
  const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)
  return Math.ceil(diff / 86400000)
}

// ── Payment Structure Selector ─────────────────────────────────────────────────

function PaymentStructureSelector({ total, onChange }: { total: number; onChange: (s: PaymentInstallmentInput[]) => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [type, setType] = useState<PaymentStructureType | ''>('')
  const [params, setParams] = useState({
    single_due:   '',
    advance_pct:  50,
    advance_due:  today,
    final_due:    '',
    start_date:   today,
    custom: [{ installment_no: 1, amount: '', due_date: today }] as { installment_no: number; amount: string; due_date: string }[],
  })
  function setP(k: string, v: unknown) { setParams(p => ({ ...p, [k]: v })) }

  useEffect(() => {
    if (!type) { onChange([]); return }
    onChange(generateSchedule(type, total, params))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, total, JSON.stringify(params)])

  const preview = type ? generateSchedule(type, total, params) : []

  return (
    <div className="space-y-3 border-t border-slate-700 pt-4">
      <Label className="text-xs text-slate-400 uppercase tracking-wider">Payment Schedule (optional)</Label>
      <div className="grid grid-cols-2 gap-2">
        {([
          { value: 'single',        label: 'Single Payment'  },
          { value: 'split_50_50',   label: 'Advance + Final' },
          { value: 'every_10_days', label: 'Every 10 Days'   },
          { value: 'custom',        label: 'Custom'          },
        ] as { value: PaymentStructureType; label: string }[]).map(opt => (
          <button key={opt.value} type="button"
            onClick={() => setType(t => t === opt.value ? '' : opt.value)}
            className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              type === opt.value ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {type === 'single' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Due Date *</Label>
          <Input type="date" value={params.single_due} onChange={e => setP('single_due', e.target.value)} className="text-slate-300" />
        </div>
      )}

      {type === 'split_50_50' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Advance %</Label>
            <Input type="number" min={1} max={99} value={params.advance_pct} onChange={e => setP('advance_pct', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Advance Due Date</Label>
            <Input type="date" value={params.advance_due} onChange={e => setP('advance_due', e.target.value)} className="text-slate-300" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Final Payment Due Date</Label>
            <Input type="date" value={params.final_due} onChange={e => setP('final_due', e.target.value)} className="text-slate-300" />
          </div>
        </div>
      )}

      {type === 'every_10_days' && (
        <div className="space-y-1.5">
          <Label className="text-xs">First Payment Date</Label>
          <Input type="date" value={params.start_date} onChange={e => setP('start_date', e.target.value)} className="text-slate-300" />
        </div>
      )}

      {type === 'custom' && (
        <div className="space-y-2">
          {params.custom.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-1 text-xs text-slate-500 text-right">#{i+1}</span>
              <div className="col-span-5">
                <Input type="number" min={0.01} step="0.01" placeholder="Amount"
                  value={c.amount}
                  onChange={e => setP('custom', params.custom.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} />
              </div>
              <div className="col-span-5">
                <Input type="date" value={c.due_date} className="text-slate-300"
                  onChange={e => setP('custom', params.custom.map((x, idx) => idx === i ? { ...x, due_date: e.target.value } : x))} />
              </div>
              <div className="col-span-1">
                {params.custom.length > 1 && (
                  <button type="button" onClick={() => setP('custom', params.custom.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-600 hover:text-red-400"><X className="h-3 w-3" /></button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm"
            onClick={() => setP('custom', [...params.custom, { installment_no: params.custom.length + 1, amount: '', due_date: today }])}>
            <Plus className="h-3 w-3" /> Add Installment
          </Button>
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Schedule Preview</p>
          {preview.map(p => (
            <div key={p.installment_no} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Installment {p.installment_no}</span>
              <span className="font-medium text-slate-300">{formatCurrency(p.amount)}</span>
              <span className="text-slate-500">{formatDate(p.due_date)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-slate-700 text-slate-200">
            <span>Total</span>
            <span className={Math.abs(preview.reduce((s,p) => s+p.amount, 0) - total) > 0.5 ? 'text-red-400' : 'text-green-400'}>
              {formatCurrency(preview.reduce((s,p) => s+p.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer',   icon: <Building2 className="h-3.5 w-3.5" /> },
  { value: 'instapay',      label: 'InstaPay',         icon: <Smartphone className="h-3.5 w-3.5" /> },
  { value: 'vodafone_cash', label: 'Vodafone Cash',   icon: <Wallet className="h-3.5 w-3.5" /> },
  { value: 'cash',          label: 'Cash',             icon: <Banknote className="h-3.5 w-3.5" /> },
  { value: 'credit_card',   label: 'Credit Card',     icon: <CreditCard className="h-3.5 w-3.5" /> },
  { value: 'other',         label: 'Other',            icon: <Wallet className="h-3.5 w-3.5" /> },
]

function methodLabel(m?: string) {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m ?? 'Payment'
}
function methodIcon(m?: string) {
  return PAYMENT_METHODS.find((p) => p.value === m)?.icon ?? <Wallet className="h-3.5 w-3.5" />
}

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
  inv, allInvoices, onClose, onUpdate, onEdit, onDelete, onRenew,
}: {
  inv: Invoice
  allInvoices: Invoice[]
  onClose: () => void
  onUpdate: (updated: Invoice) => void
  onEdit: () => void
  onDelete: () => void
  onRenew: () => void
}) {
  const { toast } = useToast()
  const [loading,         setLoading]         = useState<'overdue' | 'send' | null>(null)
  const [nextDate,        setNextDate]        = useState<string | null>(null)
  const [payments,        setPayments]        = useState<InvoicePayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [showAddForm,     setShowAddForm]     = useState(false)
  const [expandedId,      setExpandedId]      = useState<string | null>(null)
  const [markingId,       setMarkingId]       = useState<string | null>(null)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [showRenew,       setShowRenew]       = useState(false)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [scheduleItems,   setScheduleItems]   = useState<PaymentInstallmentInput[]>([])
  const [savingSchedule,  setSavingSchedule]  = useState(false)
  const [activePkg,       setActivePkg]       = useState<{ name: string; price: number } | null>(null)

  const [addForm, setAddForm] = useState({
    amount: '', payment_method: '' as PaymentMethod | '', reference: '', notes: '',
    received_at: new Date().toISOString().split('T')[0],
  })
  const [markForm, setMarkForm] = useState({
    amount: '', payment_method: '' as PaymentMethod | '', reference: '',
    received_at: new Date().toISOString().split('T')[0],
  })
  const [savingPayment, setSavingPayment] = useState(false)

  const client  = inv.client as { name?: string; email?: string } | null
  const isSent  = inv.status === 'sent'
  const isPaid  = inv.status === 'paid'
  const pastDue = inv.due_date && new Date(inv.due_date) < new Date() && !isPaid

  const clientInvoices   = allInvoices.filter((i) => i.client_id === inv.client_id)
  const pkgTotalReceived = clientInvoices.reduce((s, i) => s + (i.received_amount ?? 0), 0)

  const hasSchedule  = payments.some(p => p.installment_no != null)
  const sortedPayments = [...payments].sort((a, b) => {
    if (a.installment_no != null && b.installment_no != null) return a.installment_no - b.installment_no
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    return new Date(a.received_at ?? a.created_at).getTime() - new Date(b.received_at ?? b.created_at).getTime()
  })
  const totalPaid  = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const balanceDue = Math.max(inv.total - totalPaid, 0)

  async function loadPayments() {
    setPaymentsLoading(true)
    const res = await fetch(`/api/invoices/${inv.id}/payments`)
    const data = await res.json()
    setPayments(Array.isArray(data) ? data : [])
    setPaymentsLoading(false)
  }

  useEffect(() => { void loadPayments() }, [inv.id])

  useEffect(() => {
    if (!inv.client_id) return
    fetch(`/api/packages?clientId=${inv.client_id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((pkgs: Array<{ name: string; price: number; is_active: boolean }>) => {
        const active = pkgs.find((p) => p.is_active)
        setActivePkg(active ? { name: active.name, price: active.price } : null)
      })
      .catch(() => {})
  }, [inv.client_id])

  async function addPayment() {
    const amount = Number(addForm.amount)
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return }
    setSavingPayment(true)
    const res = await fetch(`/api/invoices/${inv.id}/payments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        amount,
        payment_method: addForm.payment_method || null,
        reference:      addForm.reference || null,
        notes:          addForm.notes || null,
        received_at:    addForm.received_at ? new Date(addForm.received_at).toISOString() : undefined,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.nextInvoiceDate) setNextDate(data.nextInvoiceDate)
      onUpdate(data.invoice)
      await loadPayments()
      toast(data.invoice.status === 'paid' ? 'Fully paid — invoice closed ✓' : `${formatCurrency(amount)} recorded`, 'success')
      setShowAddForm(false)
      setAddForm({ amount: '', payment_method: '', reference: '', notes: '', received_at: new Date().toISOString().split('T')[0] })
    } else {
      const j = await res.json().catch(() => ({}))
      toast(j.error ?? 'Failed to record payment', 'error')
    }
    setSavingPayment(false)
  }

  async function deletePayment(paymentId: string) {
    if (!confirm('Delete this payment record?')) return
    setDeletingId(paymentId)
    const res = await fetch(`/api/invoice-payments/${paymentId}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      onUpdate(data.invoice)
      await loadPayments()
      toast('Payment removed', 'success')
    } else {
      toast('Failed to delete payment', 'error')
    }
    setDeletingId(null)
  }

  async function markReceived(paymentId: string) {
    const amount = Number(markForm.amount)
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return }
    setMarkingId(paymentId)
    const res = await fetch(`/api/invoices/${inv.id}/payments/${paymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_method: markForm.payment_method || null,
        reference:      markForm.reference || null,
        received_at:    markForm.received_at,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.nextInvoiceDate) setNextDate(data.nextInvoiceDate)
      onUpdate(data.invoice)
      await loadPayments()
      setExpandedId(null)
      toast(data.invoice.status === 'paid' ? '🎉 Invoice fully paid!' : 'Payment recorded ✓', 'success')
    } else {
      const j = await res.json().catch(() => ({}))
      toast(j.error ?? 'Failed to record', 'error')
    }
    setMarkingId(null)
  }

  async function saveSchedule() {
    if (!scheduleItems.length) { toast('Choose a payment structure first', 'error'); return }
    setSavingSchedule(true)
    const res = await fetch(`/api/invoices/${inv.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installments: scheduleItems }),
    })
    if (res.ok) {
      await loadPayments()
      setShowAddSchedule(false)
      setScheduleItems([])
      toast('Payment schedule added ✓', 'success')
    } else {
      const j = await res.json().catch(() => ({}))
      toast(j.error ?? 'Failed to save schedule', 'error')
    }
    setSavingSchedule(false)
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
      toast('Marked as overdue — reminder email sent to client', 'success')
    } else {
      toast('Failed to update', 'error')
    }
    setLoading(null)
  }

  async function sendInvoiceEmail() {
    setLoading('send')
    const res = await fetch(`/api/invoices/${inv.id}/send`, { method: 'POST' })
    if (res.ok) {
      if (inv.status === 'draft') onUpdate({ ...inv, status: 'sent' })
      toast('Invoice sent successfully ✓', 'success')
    } else {
      const data = await res.json().catch(() => ({}))
      toast(data.error ?? 'Failed to send email', 'error')
    }
    setLoading(null)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full mx-2 sm:mx-auto max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
            <div className="border border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
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

        {/* ── Package Progress ── */}
        {activePkg && activePkg.price > 0 && (
          <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium text-indigo-300">{activePkg.name}</span>
              </div>
              <span className="text-xs font-bold text-indigo-300">
                {Math.min(Math.round((pkgTotalReceived / activePkg.price) * 100), 100)}%
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                style={{ width: `${Math.min((pkgTotalReceived / activePkg.price) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Received: <span className="text-green-400 font-medium">{formatCurrency(pkgTotalReceived)}</span></span>
              <span>Remaining: <span className="text-amber-400 font-medium">{formatCurrency(Math.max(activePkg.price - pkgTotalReceived, 0))}</span></span>
              <span>Total: <span className="text-slate-300">{formatCurrency(activePkg.price)}</span></span>
            </div>
            {pkgTotalReceived >= activePkg.price && (
              <div className="flex items-center gap-2 text-green-400 text-xs font-semibold pt-1">
                <CheckCircle2 className="h-4 w-4" /> Package fully paid — ready for renewal
              </div>
            )}
          </div>
        )}

        {/* ── Payment summary bar ── */}
        <div className={`grid grid-cols-3 gap-3 rounded-xl p-4 border ${isPaid ? 'bg-green-950/30 border-green-500/20' : balanceDue > 0 ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800/50 border-slate-700'}`}>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total</p>
            <p className="font-bold text-slate-100 text-sm">{formatCurrency(inv.total)}</p>
          </div>
          <div className="text-center border-x border-slate-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Received</p>
            <p className="font-bold text-green-400 text-sm">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Balance</p>
            <p className={`font-bold text-sm ${balanceDue > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              {balanceDue > 0 ? formatCurrency(balanceDue) : '✓ Paid'}
            </p>
          </div>
        </div>

        {/* ── Payment Schedule / History ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
              {hasSchedule ? 'Payment Schedule' : 'Payment History'}
            </p>
            {!isPaid && !hasSchedule && !showAddForm && !showAddSchedule && (
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                  onClick={() => setShowAddSchedule(true)}>
                  <Calendar className="h-3 w-3" /> Add Schedule
                </Button>
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white gap-1"
                  onClick={() => setShowAddForm(true)}>
                  <Plus className="h-3 w-3" /> Add Payment
                </Button>
              </div>
            )}
          </div>

          {paymentsLoading ? (
            <div className="h-12 rounded-lg bg-slate-800/50 animate-pulse" />
          ) : sortedPayments.length === 0 ? (
            <div className="text-center py-4 text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl">
              No payments recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {sortedPayments.map((p) => {
                const overdue = p.status === 'pending' && p.due_date && new Date(p.due_date) < new Date()
                const days = p.due_date ? daysRelative(p.due_date) : null
                const isExpanded = expandedId === p.id

                return (
                  <div key={p.id} className={`rounded-xl border overflow-hidden transition-all ${
                    p.status === 'paid'   ? 'border-green-500/25 bg-green-500/5' :
                    overdue               ? 'border-red-500/30 bg-red-500/5' :
                                            'border-slate-700 bg-slate-800/30'
                  }`}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        p.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                        overdue             ? 'bg-red-500/20 text-red-400' :
                                              'bg-slate-700/80 text-slate-500'
                      }`}>
                        {p.status === 'paid' ? <CheckCircle2 className="h-4 w-4" /> :
                         overdue             ? <AlertTriangle className="h-4 w-4" /> :
                                               <Clock className="h-4 w-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.installment_no && (
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                              Installment {p.installment_no}
                            </span>
                          )}
                          <span className={`text-sm font-bold ${
                            p.status === 'paid' ? 'text-green-400' :
                            overdue             ? 'text-red-400'   : 'text-slate-200'
                          }`}>{formatCurrency(p.amount)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {p.status === 'paid' ? (
                            <>
                              {p.received_at && <span>{formatDate(p.received_at)}</span>}
                              <span>{methodLabel(p.payment_method)}</span>
                              {p.reference && <span className="font-mono text-slate-400">#{p.reference}</span>}
                            </>
                          ) : p.due_date ? (
                            <span className={overdue ? 'text-red-400 font-medium' : days === 0 ? 'text-amber-400 font-medium' : ''}>
                              {overdue
                                ? `${Math.abs(days!)} day${Math.abs(days!) !== 1 ? 's' : ''} late · Due ${formatDate(p.due_date)}`
                                : days === 0 ? `Due today · ${formatDate(p.due_date)}`
                                : `Due ${formatDate(p.due_date)} · in ${days} day${days !== 1 ? 's' : ''}`}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {p.status === 'pending' && !isPaid && (
                          <Button size="sm"
                            onClick={() => {
                              setMarkForm(f => ({ ...f, amount: String(p.amount) }))
                              setExpandedId(isExpanded ? null : p.id)
                            }}
                            className={`h-7 text-[11px] gap-1 ${overdue ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white`}>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                            {isExpanded ? 'Cancel' : 'Mark Received'}
                          </Button>
                        )}
                        <button onClick={() => deletePayment(p.id)} disabled={deletingId === p.id}
                          className="p-1.5 rounded text-slate-600 hover:text-red-400 transition-colors">
                          {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Inline mark-as-received form */}
                    {isExpanded && (
                      <div className="border-t border-slate-700 bg-slate-900/80 p-3 space-y-3">
                        <p className="text-xs font-semibold text-slate-300">
                          Record Payment — Installment {p.installment_no ?? ''}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Amount Received *</Label>
                            <Input type="number" min={0.01} step="0.01"
                              value={markForm.amount}
                              onChange={e => setMarkForm(f => ({ ...f, amount: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Date</Label>
                            <Input type="date" value={markForm.received_at} className="text-slate-300"
                              onChange={e => setMarkForm(f => ({ ...f, received_at: e.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Payment Method</Label>
                            <Select value={markForm.payment_method || undefined}
                              onValueChange={v => setMarkForm(f => ({ ...f, payment_method: v as PaymentMethod }))}>
                              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                              <SelectContent>
                                {PAYMENT_METHODS.map(m => (
                                  <SelectItem key={m.value} value={m.value}>
                                    <span className="flex items-center gap-2">{m.icon}{m.label}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Reference #</Label>
                            <Input value={markForm.reference}
                              onChange={e => setMarkForm(f => ({ ...f, reference: e.target.value }))}
                              placeholder="e.g. TRF-12345" />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => markReceived(p.id)} disabled={markingId === p.id}
                            className="bg-green-600 hover:bg-green-500 text-white gap-1">
                            {markingId === p.id
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                              : <><CheckCircle2 className="h-3 w-3" /> Confirm Received</>}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpandedId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add schedule to existing invoice */}
          {showAddSchedule && !hasSchedule && (
            <div className="bg-slate-800/60 border border-indigo-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-200">Add Payment Schedule</p>
              <PaymentStructureSelector total={inv.total} onChange={setScheduleItems} />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveSchedule} disabled={savingSchedule || !scheduleItems.length}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1">
                  {savingSchedule
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                    : <><CheckCircle2 className="h-3 w-3" /> Confirm Schedule</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAddSchedule(false); setScheduleItems([]) }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Ad-hoc add payment form (only for invoices without a schedule) */}
          {showAddForm && !hasSchedule && (
            <div className="bg-slate-800/60 border border-green-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-200">Record Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount *</Label>
                  <Input type="number" min={0.01} step="0.01" value={addForm.amount}
                    onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder={`Max ${formatCurrency(balanceDue)}`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={addForm.received_at} className="text-slate-300"
                    onChange={e => setAddForm(f => ({ ...f, received_at: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={addForm.payment_method || undefined}
                    onValueChange={v => setAddForm(f => ({ ...f, payment_method: v as PaymentMethod }))}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <span className="flex items-center gap-2">{m.icon}{m.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference #</Label>
                  <Input value={addForm.reference}
                    onChange={e => setAddForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder="e.g. TRF-12345" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={addPayment} disabled={savingPayment}
                  className="gap-2 bg-green-600 hover:bg-green-500 text-white">
                  {savingPayment
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                    : <><BadgeCheck className="h-4 w-4" /> Confirm</>}
                </Button>
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        {inv.notes && (
          <div className="bg-slate-800/30 rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-slate-300">{inv.notes}</p>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800 [&>*]:min-h-[44px] sm:[&>*]:min-h-0">
          {isSent && pastDue && (
            <Button onClick={markOverdue} disabled={!!loading} variant="outline"
              className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10">
              {loading === 'overdue'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
                : <><AlertTriangle className="h-4 w-4" /> Mark Overdue</>}
            </Button>
          )}
          {!isPaid && (
            <Button onClick={sendInvoiceEmail} disabled={!!loading}
              className="gap-2 bg-violet-600 hover:bg-violet-500 text-white">
              {loading === 'send'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send Email</>}
            </Button>
          )}
          {isPaid && (
            <Button onClick={() => setShowRenew(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
              <RefreshCw className="h-4 w-4" /> Renew Invoice
            </Button>
          )}
          <Button variant="outline" className="gap-2"
            onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          {!isPaid && (
            <Button variant="ghost" className="gap-2" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="ghost" className="gap-2 hover:text-red-400 ml-auto" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>

        {/* ── Renew Modal ── */}
        {showRenew && (
          <RenewInvoiceModal
            inv={inv}
            onClose={() => setShowRenew(false)}
            onSuccess={() => { setShowRenew(false); onRenew() }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Renew Invoice Modal ────────────────────────────────────────────────────────

function RenewInvoiceModal({ inv, onClose, onSuccess }: {
  inv: Invoice
  onClose: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const clientName = (inv.client as { name?: string } | null)?.name ?? 'Client'
  const defaultDesc = (inv.items?.[0]?.description ?? 'Service') + ' — Renewal'

  const [form, setForm] = useState({ total: inv.total, description: defaultDesc, tax: inv.tax ?? 0 })
  const [schedule, setSchedule] = useState<PaymentInstallmentInput[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.total || form.total <= 0) { toast('Total amount required', 'error'); return }
    setLoading(true)
    const res = await fetch(`/api/invoices/${inv.id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total:            form.total,
        description:      form.description,
        tax:              form.tax,
        payment_schedule: schedule.length > 0 ? schedule : undefined,
      }),
    })
    if (res.ok) {
      toast('Invoice renewed!', 'success')
      onSuccess()
    } else {
      const j = await res.json().catch(() => ({}))
      toast(j.error ?? 'Failed to renew', 'error')
    }
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-400" />
            Renew for {clientName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Total Amount *</Label>
              <Input type="number" min={0.01} step="0.01" value={form.total}
                onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax (%)</Label>
              <Input type="number" min={0} max={100} value={form.tax}
                onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))} />
            </div>
          </div>
          <PaymentStructureSelector total={form.total} onChange={setSchedule} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                : <><RefreshCw className="h-4 w-4" /> Create Renewal Invoice</>}
            </Button>
          </div>
        </form>
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
  onSave: (d: Omit<Partial<Invoice>, 'items'> & { items: Partial<InvoiceItem>[]; subtotal: number; total: number; payment_schedule?: PaymentInstallmentInput[] }) => Promise<void>
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
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentInstallmentInput[]>([])
  const [loading, setLoading] = useState(false)

  function setField(k: string, v: string | number) { setForm((f) => ({ ...f, [k]: v })) }
  function setItem(i: number, k: string, v: string | number) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const total    = subtotal + subtotal * (Number(form.tax) / 100)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    await onSave({
      ...form,
      items: items.map(i => ({
        ...i,
        quantity:   Number(i.quantity)   || 0,
        unit_price: Number(i.unit_price) || 0,
      })),
      subtotal,
      total,
      payment_schedule: paymentSchedule.length > 0 ? paymentSchedule : undefined,
    })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Client *</Label>
          <Select value={form.client_id || undefined} onValueChange={(v) => setField('client_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>{clients.filter(c => c.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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

      {/* Payment structure — only for new invoices */}
      {!initial?.id && (
        <PaymentStructureSelector total={total} onChange={setPaymentSchedule} />
      )}

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
  label: string; color: 'violet' | 'green' | 'red'; icon: React.ReactNode; count: number
}) {
  const styles = {
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
    green:  'bg-green-500/10  border-green-500/30  text-green-400',
    red:    'bg-red-500/10    border-red-500/30    text-red-400',
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
  const router = useRouter()
  const [invoices,  setInvoices]  = useState<Invoice[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [formOpen,  setFormOpen]  = useState(false)
  const [editing,   setEditing]   = useState<Invoice | null>(null)
  const [detailInv, setDetailInv] = useState<Invoice | null>(null)
  const [guardReady, setGuardReady] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      const role = p?.role ?? ''
      if (role !== 'admin') { router.replace('/dashboard'); return }
      setGuardReady(true)
    })
  }, [router])

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

  useEffect(() => { if (guardReady) void load() }, [guardReady])

  async function handleSave(
    data: Omit<Partial<Invoice>, 'items'> & { items: Partial<InvoiceItem>[]; subtotal: number; total: number; payment_schedule?: PaymentInstallmentInput[] }
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

  if (!guardReady) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
    </div>
  )

  const doneInvoices    = invoices.filter((i) => i.status === 'paid'    && matches(i))
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue' && matches(i))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const activeInvoices  = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'overdue' && matches(i))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input className="pl-9 w-full" placeholder="Search invoices or clients…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => window.open('/api/export?type=invoices', '_blank')}
            className="gap-1.5 text-slate-400 hover:text-slate-100 flex-1 sm:flex-none">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0">
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── OVERDUE ── */}
          {overdueInvoices.length > 0 && (
            <div>
              <SectionRibbon
                label="OVERDUE"
                color="red"
                icon={<AlertTriangle className="h-3.5 w-3.5 animate-pulse" />}
                count={overdueInvoices.length}
              />
              <div className="space-y-2">
                {overdueInvoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} onClick={() => setDetailInv(inv)} />
                ))}
              </div>
            </div>
          )}

          {/* ── PENDING / UPCOMING ── */}
          <div>
            <SectionRibbon
              label="PENDING"
              color="violet"
              icon={<Clock className="h-3.5 w-3.5 animate-pulse" />}
              count={activeInvoices.length}
            />
            {activeInvoices.length > 0 ? (
              <div className="space-y-2">
                {activeInvoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} onClick={() => setDetailInv(inv)} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-slate-400 text-sm">No pending invoices.</p>
                  <Button className="mt-3" onClick={() => { setEditing(null); setFormOpen(true) }}>
                    <Plus className="h-4 w-4" /> Create Invoice
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── DONE ── */}
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
          allInvoices={invoices}
          onClose={() => setDetailInv(null)}
          onUpdate={(updated) => {
            setDetailInv(updated)
            setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
          }}
          onEdit={() => { setEditing(detailInv); setDetailInv(null); setFormOpen(true) }}
          onDelete={() => handleDelete(detailInv.id)}
          onRenew={() => { setDetailInv(null); void load() }}
        />
      )}

      {/* Create / Edit Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl w-full mx-2 sm:mx-auto max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
