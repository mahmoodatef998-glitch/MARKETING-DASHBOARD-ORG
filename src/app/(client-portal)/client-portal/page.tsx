'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  CheckSquare, Clock, AlertTriangle, Loader2, FileText,
  ExternalLink, CheckCircle2, RefreshCw, Star, CalendarDays,
  Package, TrendingUp, RotateCcw, Zap, CreditCard, ChevronDown, ChevronUp,
  Receipt, Calendar, DollarSign, Repeat2,
} from 'lucide-react'
import PackageProgress from '@/components/clients/PackageProgress'
import TaskDetailModal from '@/components/tasks/TaskDetailModal'
import { CalendarView } from '@/components/calendar/CalendarView'
import { getSupabaseClient } from '@/lib/supabase'
import type { Task, Invoice, ClientPackage } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo:        { label: 'To Do',              color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  in_progress: { label: 'In Progress',        color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  review:      { label: 'Awaiting Approval',  color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  done:        { label: 'Done',               color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  overdue:     { label: 'Overdue',            color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft:   { label: 'Draft',   color: 'bg-slate-500/10 text-slate-400' },
  sent:    { label: 'Sent',    color: 'bg-blue-500/10 text-blue-400' },
  paid:    { label: 'Paid',    color: 'bg-green-500/10 text-green-400' },
  overdue: { label: 'Overdue', color: 'bg-red-500/10 text-red-400' },
}

// ─── Approval Card ────────────────────────────────────────────────────────────
function ApprovalCard({ task, onAction }: { task: Task; onAction: () => void }) {
  const [reviseOpen, setReviseOpen] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [notes,      setNotes]      = useState('')
  const [rating,     setRating]     = useState(0)
  const [ratingNote, setRatingNote] = useState('')
  const [loading,    setLoading]    = useState<'approve' | 'revise' | null>(null)

  async function approve() {
    setLoading('approve')
    await fetch(`/api/tasks/${task.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: rating || null, rating_note: ratingNote }),
    })
    onAction()
    setLoading(null)
  }

  async function revise() {
    if (!notes.trim()) return
    setLoading('revise')
    await fetch(`/api/tasks/${task.id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    onAction()
    setLoading(null)
  }

  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">⏳ Awaiting Your Approval</span>
            {task.task_type && <span className="text-xs text-slate-500 capitalize">{task.task_type.replace('_', ' ')}</span>}
          </div>
          <h3 className="font-semibold text-white text-sm">{task.title}</h3>
          {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>}
        </div>
      </div>

      {task.delivery_url && (
        <div className="mx-4 mb-3 flex items-center gap-3 bg-slate-800/60 rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 font-medium mb-0.5">Delivery ready for review</p>
            <p className="text-xs text-slate-500 truncate">{task.delivery_url}</p>
          </div>
          <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      )}

      {ratingOpen && (
        <div className="mx-4 mb-3 p-3 bg-slate-800/60 rounded-xl space-y-2">
          <p className="text-xs font-medium text-slate-300">Rate this delivery (optional)</p>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(s => (
              <button key={s} onClick={() => setRating(r => r === s ? 0 : s)}
                className={`text-xl transition-transform hover:scale-110 ${s <= rating ? 'text-yellow-400' : 'text-slate-600'}`}>★</button>
            ))}
          </div>
          {rating > 0 && (
            <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)}
              placeholder="Any comments? (optional)" rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500 resize-none" />
          )}
          <div className="flex gap-2">
            <button onClick={approve} disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
              {loading === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {rating > 0 ? 'Approve & Submit Rating' : 'Approve without rating'}
            </button>
            <button onClick={() => setRatingOpen(false)} className="px-3 text-xs text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {!reviseOpen && !ratingOpen ? (
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={() => setRatingOpen(true)} disabled={!!loading}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
            {loading === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve & Done
          </button>
          <button onClick={() => setReviseOpen(true)} disabled={!!loading}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-slate-200 text-sm font-semibold py-2.5 rounded-xl transition-colors">
            <RefreshCw className="h-4 w-4" /> Request Revision
          </button>
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-2">
          <textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Describe what needs to be changed…" rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex gap-2">
            <button onClick={revise} disabled={!notes.trim() || !!loading}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
              {loading === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Send Revision Request
            </button>
            <button onClick={() => { setReviseOpen(false); setNotes('') }}
              className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Completed Card ───────────────────────────────────────────────────────────
function CompletedCard({ task, onAction }: { task: Task; onAction: () => void }) {
  const [rating,     setRating]     = useState(task.client_rating ?? 0)
  const [ratingNote, setRatingNote] = useState(task.client_rating_note ?? '')
  const [open,       setOpen]       = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [submitted,  setSubmitted]  = useState(!!task.client_rating)

  async function submitRating() {
    setLoading(true)
    await fetch(`/api/tasks/${task.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: rating || null, rating_note: ratingNote }),
    })
    setSubmitted(true)
    setOpen(false)
    setLoading(false)
    onAction()
  }

  return (
    <div className={`rounded-xl overflow-hidden border ${submitted ? 'border-green-500/20 bg-green-500/5' : 'border-slate-700/60 bg-slate-900'}`}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </span>
            {task.task_type && <span className="text-xs text-slate-500 capitalize">{task.task_type.replace('_', ' ')}</span>}
          </div>
          <h3 className="font-semibold text-white text-sm">{task.title}</h3>
          {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>}
        </div>
        <div className="flex gap-0.5 shrink-0">
          {[1,2,3,4,5].map(s => (
            <Star key={s} className={`h-3.5 w-3.5 ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
          ))}
        </div>
      </div>

      {task.delivery_url && (
        <div className="mx-4 mb-3 flex items-center gap-3 bg-slate-800/60 rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 font-medium mb-0.5">Delivered file</p>
            <p className="text-xs text-slate-500 truncate">{task.delivery_url}</p>
          </div>
          <a href={task.delivery_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      )}

      {submitted && task.client_rating_note && (
        <p className="mx-4 mb-3 text-xs text-slate-400 italic">"{task.client_rating_note}"</p>
      )}

      {open && !submitted && (
        <div className="mx-4 mb-3 p-3 bg-slate-800/60 rounded-xl space-y-2">
          <p className="text-xs font-medium text-slate-300">Rate this delivery</p>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(s => (
              <button key={s} onClick={() => setRating(r => r === s ? 0 : s)}
                className={`text-xl transition-transform hover:scale-110 ${s <= rating ? 'text-yellow-400' : 'text-slate-600'}`}>★</button>
            ))}
          </div>
          <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)}
            placeholder="Leave a comment (optional)" rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500 resize-none" />
          <div className="flex gap-2">
            <button onClick={submitRating} disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {rating > 0 ? 'Submit Approval' : 'Approve without rating'}
            </button>
            <button onClick={() => setOpen(false)} className="px-3 text-xs text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        {submitted ? (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {rating > 0 ? `You rated this ${rating}/5` : 'Approved'}
          </div>
        ) : !open ? (
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve & Rate
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─── Package Tab ──────────────────────────────────────────────────────────────
function PackageTab({ pkgs, doneTasks, totalTasks }: {
  pkgs: ClientPackage[]
  doneTasks: number
  totalTasks: number
}) {
  if (pkgs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p className="font-medium text-slate-400">No active package</p>
        <p className="text-sm mt-1">Your service package will appear here once it's set up.</p>
      </div>
    )
  }

  // Overall summary across all packages
  const totalItems  = pkgs.reduce((s, p) => s + p.items.reduce((si, i) => si + i.total_quantity, 0), 0)
  const totalUsed   = pkgs.reduce((s, p) => {
    const itemsUsed = p.items.reduce((si, i) => si + (i.used ?? 0), 0)
    return s + (p.items.length > 0 ? itemsUsed : (p.total_done ?? 0))
  }, 0)
  const overallPct  = totalItems > 0 ? Math.round((totalUsed / totalItems) * 100) : 0
  const totalRem    = Math.max(totalItems - totalUsed, 0)

  const now         = new Date()
  const monthName   = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Overall summary card */}
      {pkgs.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-600/15 to-purple-600/10 border border-indigo-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Overall Package Progress</span>
            {pkgs.some(p => p.renewal_type === 'monthly') && (
              <span className="text-xs text-slate-400 ml-auto">{monthName}</span>
            )}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total',     value: totalItems > 0 ? totalItems : '—', color: 'text-slate-200' },
              { label: 'Completed', value: totalUsed,                          color: 'text-emerald-400' },
              { label: 'Remaining', value: totalRem > 0 ? totalRem : '—',     color: 'text-amber-400' },
              { label: 'Progress',  value: totalItems > 0 ? `${overallPct}%` : `${doneTasks} done`, color: overallPct >= 100 ? 'text-red-400' : overallPct >= 80 ? 'text-amber-400' : 'text-indigo-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
                <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalItems > 0 && (
            <div className="space-y-1.5">
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                  style={{ width: `${Math.min(overallPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{totalUsed} deliverables completed</span>
                <span>{totalRem} remaining</span>
              </div>
            </div>
          )}

          {/* Task completion line */}
          {totalTasks > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/40 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {doneTasks} of {totalTasks} tasks completed
              </span>
              <span className={`font-semibold ${doneTasks === totalTasks && totalTasks > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                {totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Per-package breakdown */}
      {pkgs.map((p, idx) => (
        <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Package type + period badge */}
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              {pkgs.length > 1 && (
                <span className="text-xs text-slate-500">Package {idx + 1}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {p.renewal_type === 'monthly' ? (
                <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                  <RotateCcw className="h-3 w-3" /> Monthly · {monthName}
                </span>
              ) : (
                <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">
                  ⊙ One-Time
                </span>
              )}
            </div>
          </div>

          <div className="p-5">
            <PackageProgress pkg={p} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────
type BillingPlan = {
  id: string
  cycle_type: string
  amount: number
  currency: string
  custom_days?: number | null
  next_invoice_date: string
  is_active: boolean
  created_at: string
}

const CYCLE_LABEL: Record<string, string> = {
  monthly:       'Monthly',
  biweekly:      'Every 2 Weeks',
  every_10_days: 'Every 10 Days',
  custom_days:   'Custom Cycle',
  manual:        'Manual',
}

const INVOICE_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  paid:    { bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-400'  },
  sent:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-400'   },
  overdue: { bg: 'bg-red-500/10',    text: 'text-red-400',    dot: 'bg-red-400'    },
  draft:   { bg: 'bg-slate-500/10',  text: 'text-slate-400',  dot: 'bg-slate-500'  },
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const [open, setOpen] = useState(false)
  const col = INVOICE_COLOR[inv.status] ?? INVOICE_COLOR.draft

  return (
    <div className={`rounded-xl border transition-colors ${open ? 'border-slate-700 bg-slate-800/60' : 'border-slate-800 bg-slate-900'}`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${col.bg}`}>
            <Receipt className={`h-4 w-4 ${col.text}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm">{inv.invoice_number}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Issued {new Date(inv.issued_date ?? inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {inv.due_date && ` · Due ${new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="font-bold text-white text-sm">{inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {(inv as any).currency ?? 'USD'}</p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${col.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
            </span>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {/* Expanded items */}
      {open && (
        <div className="border-t border-slate-700/60 px-4 pb-4 pt-3 space-y-2">
          {inv.notes && (
            <p className="text-xs text-slate-400 italic mb-3">"{inv.notes}"</p>
          )}
          {(inv.items ?? []).length > 0 ? (
            <>
              <div className="space-y-1.5">
                {inv.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex-1 min-w-0 truncate">{item.description}</span>
                    <span className="text-slate-500 mx-3">{item.quantity} × {item.unit_price.toLocaleString()}</span>
                    <span className="font-semibold text-white">{item.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-700/40 flex justify-between text-xs text-slate-400">
                <span>Subtotal</span>
                <span>{inv.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {inv.tax && inv.tax > 0 && (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Tax ({inv.tax}%)</span>
                  <span>{(inv.subtotal * inv.tax / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-1">
                <span>Total</span>
                <span>{inv.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} {(inv as any).currency ?? 'USD'}</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500 py-1">No line items on record.</p>
          )}
        </div>
      )}
    </div>
  )
}

function InvoicesTab({
  billingPlan,
  pkgs,
  invoices,
}: {
  billingPlan: BillingPlan | null
  pkgs: ClientPackage[]
  invoices: Invoice[]
}) {
  const now = new Date()
  const daysUntil = billingPlan?.next_invoice_date
    ? Math.max(0, Math.ceil((new Date(billingPlan.next_invoice_date).getTime() - now.getTime()) / 86_400_000))
    : null

  // Collect all deliverables done this period across all packages
  const deliverableLines: { label: string; used: number; total: number }[] = []
  for (const pkg of pkgs) {
    for (const item of pkg.items) {
      if ((item.used ?? 0) > 0 || item.total_quantity > 0) {
        const existing = deliverableLines.find(d => d.label === item.label)
        if (existing) {
          existing.used  += item.used ?? 0
          existing.total += item.total_quantity
        } else {
          deliverableLines.push({ label: item.label, used: item.used ?? 0, total: item.total_quantity })
        }
      }
    }
    // fallback: if no items configured but total_done > 0
    if (pkg.items.length === 0 && (pkg.total_done ?? 0) > 0) {
      deliverableLines.push({ label: 'Tasks completed', used: pkg.total_done ?? 0, total: 0 })
    }
  }

  const totalDeliverablesDone  = deliverableLines.reduce((s, d) => s + d.used, 0)
  const totalDeliverablesTotal = deliverableLines.reduce((s, d) => s + d.total, 0)

  const paidInvoices    = invoices.filter(i => i.status === 'paid')
  const totalPaid       = paidInvoices.reduce((s, i) => s + i.total, 0)
  const pendingInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')

  return (
    <div className="space-y-5">

      {/* ── Billing Plan Card ──────────────────────────────────────────────── */}
      {billingPlan ? (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800/60 border border-slate-700/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Billing Plan</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${billingPlan.is_active ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              {billingPlan.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Plan KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <p className="text-lg font-extrabold text-white">
                {billingPlan.amount.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500">{billingPlan.currency} / cycle</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Repeat2 className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <p className="text-sm font-extrabold text-white">
                {CYCLE_LABEL[billingPlan.cycle_type] ?? billingPlan.cycle_type}
              </p>
              {billingPlan.cycle_type === 'custom_days' && billingPlan.custom_days && (
                <p className="text-[11px] text-slate-500">Every {billingPlan.custom_days} days</p>
              )}
              <p className="text-[11px] text-slate-500">Billing frequency</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <p className={`text-lg font-extrabold ${daysUntil !== null && daysUntil <= 3 ? 'text-amber-400' : 'text-white'}`}>
                {daysUntil !== null ? (daysUntil === 0 ? 'Today' : `${daysUntil}d`) : '—'}
              </p>
              <p className="text-[11px] text-slate-500">Until next invoice</p>
            </div>
          </div>

          {/* Total paid summary */}
          {paidInvoices.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/40">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                {paidInvoices.length} invoice{paidInvoices.length > 1 ? 's' : ''} paid
              </span>
              <span className="font-semibold text-white">
                {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} {billingPlan.currency} total
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3 text-slate-400">
          <CreditCard className="h-5 w-5 shrink-0" />
          <p className="text-sm">No billing plan configured yet. Contact your account manager to set one up.</p>
        </div>
      )}

      {/* ── Next Invoice Preview ───────────────────────────────────────────── */}
      {billingPlan && billingPlan.cycle_type !== 'manual' && billingPlan.next_invoice_date && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Next Invoice</span>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              daysUntil !== null && daysUntil <= 3
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20'
            }`}>
              {billingPlan.next_invoice_date
                ? new Date(billingPlan.next_invoice_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—'}
            </span>
          </div>

          {/* Amount */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-extrabold text-white">
                {billingPlan.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{billingPlan.currency} · {CYCLE_LABEL[billingPlan.cycle_type]}</p>
            </div>
            {daysUntil !== null && daysUntil > 0 && (
              <p className="text-xs text-slate-500">in {daysUntil} day{daysUntil !== 1 ? 's' : ''}</p>
            )}
          </div>

          {/* Deliverables summary for this period */}
          {deliverableLines.length > 0 && (
            <div className="border-t border-indigo-500/15 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-slate-500" />
                Deliverables completed this period
              </p>
              <div className="space-y-2">
                {deliverableLines.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${d.used > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span className="text-xs text-slate-300 truncate">{d.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">
                        <span className={`font-semibold ${d.used > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{d.used}</span>
                        {d.total > 0 && <span className="text-slate-600"> / {d.total}</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {totalDeliverablesTotal > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-indigo-500/15">
                  <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                      style={{ width: `${Math.min(Math.round(totalDeliverablesDone / totalDeliverablesTotal * 100), 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {totalDeliverablesDone} / {totalDeliverablesTotal} done
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Pending / Overdue alert ────────────────────────────────────────── */}
      {pendingInvoices.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            You have{' '}
            <span className="font-semibold">{pendingInvoices.length} pending invoice{pendingInvoices.length > 1 ? 's' : ''}</span>
            {' '}totalling{' '}
            <span className="font-semibold">
              {pendingInvoices.reduce((s, i) => s + i.total, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {billingPlan?.currency ?? 'USD'}
            </span>
          </p>
        </div>
      )}

      {/* ── Invoice history ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Invoice History ({invoices.length})
        </p>
        {invoices.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>No invoices issued yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientPortalPage() {
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [invoices,    setInvoices]    = useState<Invoice[]>([])
  const [pkgs,        setPkgs]        = useState<ClientPackage[]>([])
  const [billingPlan, setBillingPlan] = useState<BillingPlan | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<'package' | 'tasks' | 'completed' | 'calendar' | 'invoices'>('package')
  const [detailTask,  setDetailTask]  = useState<Task | null>(null)
  const [clientId,    setClientId]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const [tasksRes, invoicesRes, pkgRes, billRes] = await Promise.all([
      fetch('/api/tasks?limit=200'),
      fetch('/api/invoices?limit=200'),
      fetch('/api/packages/mine'),
      fetch('/api/billing-plans/mine'),
    ])
    const td = await tasksRes.json()
    const id = await invoicesRes.json()
    const pd = await pkgRes.json()
    const bd = await billRes.json()
    setTasks(Array.isArray(td) ? td : (td.data ?? []))
    setInvoices(Array.isArray(id) ? id : (id.data ?? []))
    setPkgs(Array.isArray(pd) ? pd : (pd && !pd.error ? [pd] : []))
    setBillingPlan(bd && !bd.error ? bd : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    fetch('/api/profile')
      .then(r => r.json())
      .then(p => { if (p?.client_id) setClientId(p.client_id) })
      .catch(() => {})
  }, [load])

  useEffect(() => {
    if (!clientId) return
    const supabase = getSupabaseClient()
    const ch = supabase
      .channel(`client-portal:tasks:${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `client_id=eq.${clientId}` }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [clientId, load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  const reviewTasks = tasks.filter(t => t.status === 'review')
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'review')
  const doneTasks   = tasks.filter(t => t.status === 'done')

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-0.5">Welcome to your portal 👋</h2>
          <p className="text-slate-400 text-sm">Review deliverables, track your package, and manage invoices.</p>
        </div>
        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {pkgs.length > 0 && (() => {
            const totalItems = pkgs.reduce((s, p) => s + p.items.reduce((si, i) => si + i.total_quantity, 0), 0)
            const totalUsed  = pkgs.reduce((s, p) => {
              const iu = p.items.reduce((si, i) => si + (i.used ?? 0), 0)
              return s + (p.items.length > 0 ? iu : (p.total_done ?? 0))
            }, 0)
            const pct = totalItems > 0 ? Math.round((totalUsed / totalItems) * 100) : 0
            return (
              <div className="text-center">
                <div className={`text-2xl font-extrabold ${pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-indigo-300'}`}>{pct}%</div>
                <div className="text-[11px] text-slate-500">Package done</div>
              </div>
            )
          })()}
          {reviewTasks.length > 0 && (
            <div className="text-center">
              <div className="text-2xl font-extrabold text-amber-400">{reviewTasks.length}</div>
              <div className="text-[11px] text-slate-500">Need review</div>
            </div>
          )}
        </div>
      </div>

      {/* Awaiting approval — always visible regardless of tab */}
      {reviewTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <h3 className="text-sm font-semibold text-amber-400">
              {reviewTasks.length} item{reviewTasks.length > 1 ? 's' : ''} awaiting your approval
            </h3>
          </div>
          {reviewTasks.map(task => (
            <ApprovalCard key={task.id} task={task} onAction={load} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {([
          { key: 'package',   label: 'My Package', icon: Package,      badge: pkgs.length,        badgeColor: 'bg-indigo-500/20 text-indigo-400' },
          { key: 'tasks',     label: 'Tasks',      icon: CheckSquare,  badge: activeTasks.length + reviewTasks.length, badgeColor: 'bg-slate-700 text-slate-300' },
          { key: 'completed', label: 'Completed',  icon: CheckCircle2, badge: doneTasks.length,   badgeColor: 'bg-green-500/20 text-green-400' },
          { key: 'calendar',  label: 'Calendar',   icon: CalendarDays, badge: 0,                  badgeColor: '' },
          { key: 'invoices',  label: 'Invoices',   icon: FileText,     badge: 0,                  badgeColor: '' },
        ] as const).map(({ key, label, icon: Icon, badge, badgeColor }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Package tab */}
      {tab === 'package' && (
        <PackageTab pkgs={pkgs} doneTasks={doneTasks.length} totalTasks={tasks.length} />
      )}

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {activeTasks.length === 0 && reviewTasks.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{doneTasks.length > 0 ? 'All tasks are completed! 🎉' : 'No tasks yet'}</p>
              {doneTasks.length > 0 && (
                <button onClick={() => setTab('completed')} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  View completed tasks →
                </button>
              )}
            </div>
          )}
          <div className="space-y-2.5">
            {activeTasks.map(task => {
              const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
              return (
                <div key={task.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-colors"
                  onClick={() => setDetailTask(task)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white text-sm">{task.title}</h3>
                      {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {task.due_date && (
                    <div className={`flex items-center gap-1 text-xs mt-2.5 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                      {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Completed tab */}
      {tab === 'completed' && (
        <div className="space-y-3">
          {doneTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No completed tasks yet</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {doneTasks.filter(t => !t.client_rating).length > 0
                  ? `${doneTasks.filter(t => !t.client_rating).length} task${doneTasks.filter(t => !t.client_rating).length > 1 ? 's' : ''} awaiting your approval`
                  : `All ${doneTasks.length} completed tasks have been approved`}
              </p>
              {doneTasks.map(task => (
                <CompletedCard key={task.id} task={task} onAction={load} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Calendar tab */}
      {tab === 'calendar' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Your project plan — all scheduled tasks. Tap any day to see details.</p>
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No tasks scheduled yet</p>
            </div>
          ) : (
            <CalendarView tasks={tasks} showAssignee={false} />
          )}
        </div>
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <InvoicesTab billingPlan={billingPlan} pkgs={pkgs} invoices={invoices} />
      )}

      <TaskDetailModal task={detailTask} open={!!detailTask} onClose={() => setDetailTask(null)} />
    </div>
  )
}
