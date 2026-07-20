'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  ArrowLeft, Banknote, Loader2, RefreshCw, Plus, X, Users,
  DollarSign, AlertTriangle, ExternalLink, ImagePlus, Trash2, History,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { SalaryMemberSummary } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  designer:    'bg-pink-500/20 text-pink-400 border-pink-500/30',
  ai_video:    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  media_buyer: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

interface PayoutRow {
  id: string
  member_id: string
  member_name: string
  amount: number
  currency: string
  description?: string
  proof_url?: string
  paid_at: string
}

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  return { from, to }
}

function ProofUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Upload failed')
      const data = await presignRes.json()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', data.apiKey)
      fd.append('timestamp', String(data.timestamp))
      fd.append('signature', data.signature)
      fd.append('public_id', data.publicId)
      if (data.eager) fd.append('eager', data.eager)
      const upRes = await fetch(data.uploadUrl, { method: 'POST', body: fd })
      if (!upRes.ok) throw new Error('Upload failed')
      const uploaded = await upRes.json()
      onChange(uploaded.secure_url ?? data.publicUrl)
    } catch {
      // user can retry
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
        <ImagePlus className="h-3.5 w-3.5 text-slate-400" /> Payment Proof <span className="text-slate-500 font-normal">(optional)</span>
      </label>
      {value ? (
        <div className="flex items-center gap-2">
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> View proof
          </a>
          <button type="button" onClick={() => onChange('')} className="text-xs text-red-400 hover:underline">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full border border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl py-3 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          {uploading ? 'Uploading…' : 'Upload transfer screenshot'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

function RecordPayoutModal({
  members,
  initialMemberId,
  onClose,
  onSaved,
}: {
  members: SalaryMemberSummary[]
  initialMemberId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [memberId, setMemberId] = useState(initialMemberId ?? members[0]?.id ?? '')
  const [amount, setAmount]     = useState('')
  const [description, setDesc]  = useState('')
  const [paidAt, setPaidAt]     = useState(new Date().toISOString().split('T')[0])
  const [proofUrl, setProofUrl] = useState('')
  const [saving, setSaving]     = useState(false)

  const member = members.find(m => m.id === memberId)

  useEffect(() => {
    if (member && member.pending > 0) setAmount(String(member.pending))
  }, [member])

  async function save() {
    const amt = Number(amount)
    if (!memberId || !amt || amt <= 0) { toast('Enter a valid amount', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/team-payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: memberId,
        amount: amt,
        currency: member?.currency ?? 'AED',
        description: description || `Salary — ${member?.name ?? 'Team member'}`,
        proof_url: proofUrl || null,
        paid_at: new Date(paidAt).toISOString(),
      }),
    })
    if (res.ok) {
      toast('Salary recorded ✓', 'success')
      onSaved()
      onClose()
    } else {
      const err = await res.json().catch(() => ({}))
      toast(err.error ?? 'Failed to save', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="font-semibold text-white text-sm">Record Salary · تسجيل راتب</p>
              <p className="text-xs text-slate-400">Log payment to team member</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Team Member *</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.pending > 0 ? `(pending ${formatCurrency(m.pending)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {member && member.pending > 0 && (
            <div className="flex justify-between px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
              <span className="text-amber-300">Pending · عليه</span>
              <span className="text-amber-400 font-bold">{formatCurrency(member.pending)}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (AED) *</Label>
              <Input type="number" min={0.01} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date *</Label>
              <Input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={e => setDesc(e.target.value)} placeholder="e.g. March salary" />
          </div>
          <ProofUpload value={proofUrl} onChange={setProofUrl} />
          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Payment'}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SalaryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const now = new Date()

  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth() + 1)
  const [members, setMembers]   = useState<SalaryMemberSummary[]>([])
  const [payouts, setPayouts]   = useState<PayoutRow[]>([])
  const [totals, setTotals]     = useState({ earned: 0, paid: 0, pending: 0, periodPaid: 0, payoutCount: 0 })
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalMemberId, setModalMemberId] = useState<string | undefined>()

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || p.role !== 'admin') router.replace('/dashboard')
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = monthBounds(year, month)
    const res = await fetch(`/api/salary?from=${from}&to=${to}`)
    const data = await res.json()
    if (res.ok) {
      setMembers(data.members ?? [])
      setPayouts(data.payouts ?? [])
      setTotals(data.totals ?? { earned: 0, paid: 0, pending: 0, periodPaid: 0, payoutCount: 0 })
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { void load() }, [load])

  function openPayout(memberId?: string) {
    setModalMemberId(memberId)
    setShowModal(true)
  }

  async function deletePayout(id: string) {
    if (!confirm('Delete this salary record?')) return
    const res = await fetch(`/api/team-payouts/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Deleted ✓', 'success'); void load() }
    else toast('Failed to delete', 'error')
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/finance" className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Salary · الرواتب</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track and record team member payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => openPayout()} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white">
            <Plus className="h-3.5 w-3.5" /> Record Salary
          </Button>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

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
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-300 mb-1">How to use Salary</p>
        <p>- Record every real payout paid to team members here.</p>
        <p>- Essam&apos;s execution cost is covered by the monthly media buyer rate in Finance settings.</p>
        <p>- Designers&apos; execution cost is covered by the per-design rate in Finance settings.</p>
        <p>- If you pay someone extra manually, log it here so your cash outflow stays accurate.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Paid This Month', value: formatCurrency(totals.periodPaid), color: 'text-emerald-400', border: 'border-emerald-500/20', icon: Banknote },
          { label: 'Total Pending · عليا', value: formatCurrency(totals.pending), color: 'text-amber-400', border: 'border-amber-500/20', icon: AlertTriangle },
          { label: 'Total Earned', value: formatCurrency(totals.earned), color: 'text-indigo-400', border: 'border-indigo-500/20', icon: DollarSign },
          { label: 'Total Paid (all time)', value: formatCurrency(totals.paid), color: 'text-slate-200', border: 'border-slate-700', icon: History },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border ${k.border} bg-slate-900 p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" /> Team ({members.length})
            </h2>
            {members.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No team members found</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {members.map(m => (
                  <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/team/${m.id}`} className="text-sm font-semibold text-slate-100 hover:text-indigo-400 transition-colors">
                          {m.name}
                        </Link>
                        <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[m.role] ?? 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={() => openPayout(m.id)}>
                        <Banknote className="h-3 w-3" /> Pay
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-slate-800/50 rounded-lg py-2">
                        <p className="text-slate-500 mb-0.5">Earned</p>
                        <p className="font-semibold text-green-400">{formatCurrency(m.earned)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg py-2">
                        <p className="text-slate-500 mb-0.5">Paid</p>
                        <p className="font-semibold text-indigo-400">{formatCurrency(m.paid)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg py-2">
                        <p className="text-slate-500 mb-0.5">Pending</p>
                        <p className={`font-semibold ${m.pending > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{formatCurrency(m.pending)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                Payment History
                <span className="text-slate-600 font-normal">({payouts.length})</span>
              </h2>
            </div>
            {payouts.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">No payments recorded this month</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {payouts.map(p => (
                  <li key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Banknote className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{p.member_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {p.description ?? 'Salary payment'} · {formatDate(p.paid_at.split('T')[0])}
                      </p>
                    </div>
                    {p.proof_url && (
                      <a href={p.proof_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 transition-colors" title="View proof">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <p className="text-sm font-bold text-emerald-400 shrink-0">{formatCurrency(p.amount)}</p>
                    <button onClick={() => deletePayout(p.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {showModal && members.length > 0 && (
        <RecordPayoutModal
          members={members}
          initialMemberId={modalMemberId}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
