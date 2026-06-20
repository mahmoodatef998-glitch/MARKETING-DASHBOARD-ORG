'use client'
import { useEffect, useState } from 'react'
import {
  Plus, Loader2, Pencil, Trash2, X, Zap, Package, User,
  ChevronRight, ChevronLeft, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BillingCycle } from '@/types'

type UserRole = 'video_maker' | 'designer' | 'ai_video' | 'media_buyer' | 'client'

interface AppUser {
  id: string
  role: UserRole
  display_name?: string
  email?: string
  client_id?: string
  client?: { id: string; name: string; email: string }
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
  client:      'Client',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  designer:    'bg-pink-500/10 text-pink-400 border-pink-500/20',
  ai_video:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  media_buyer: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  client:      'bg-green-500/10 text-green-400 border-green-500/20',
}

const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'manual',        label: 'Manual (no auto-billing)' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'biweekly',      label: 'Every 2 Weeks' },
  { value: 'every_10_days', label: 'Every 10 Days' },
  { value: 'custom_days',   label: 'Custom (specify days)' },
]

const TASK_TYPES = [
  { value: 'reel_video', label: 'Reel Videos' },
  { value: 'design',     label: 'Designs'     },
  { value: 'ai_video',   label: 'AI Videos'   },
  { value: 'post',       label: 'Posts'        },
  { value: 'custom',     label: 'Custom'       },
]

const TEAM_ROLES: UserRole[] = ['video_maker', 'designer', 'ai_video', 'media_buyer']
const ALL_ROLES:  UserRole[] = ['video_maker', 'designer', 'ai_video', 'media_buyer', 'client']

type PkgItemForm = { task_type: string; label: string; total_quantity: string }

const DEFAULT_PKG_ITEMS: PkgItemForm[] = TASK_TYPES.map(t => ({
  task_type: t.value, label: t.label, total_quantity: '',
}))

const EMPTY_FORM = {
  display_name: '', email: '', password: '',
  role: 'designer' as UserRole,
  phone: '', country: '', notes: '',
  billing_cycle:       'manual' as BillingCycle,
  billing_amount:      '',
  billing_currency:    'AED',
  billing_custom_days: '',
  billing_start_date:    new Date().toISOString().split('T')[0],
  payment_policy_type:   'single' as 'single' | 'split',
  payment_final_days:    30,
  advance_amount:        '',
  advance_method:        '' as string,
  advance_date:          new Date().toISOString().split('T')[0],
}

const EMPTY_PKG = {
  name: '', renewal_type: 'monthly' as 'monthly' | 'one_time',
  price: '', notes: '',
  items: DEFAULT_PKG_ITEMS,
}

export default function UsersPage() {
  const [users,          setUsers]          = useState<AppUser[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showForm,       setShowForm]       = useState(false)
  const [editing,        setEditing]        = useState<AppUser | null>(null)
  const [formLoading,    setFormLoading]    = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [deleting,       setDeleting]       = useState<string | null>(null)
  const [error,          setError]          = useState('')
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [pkg,            setPkg]            = useState(EMPTY_PKG)
  const [step,           setStep]           = useState(1)
  const [editingPkgId,   setEditingPkgId]   = useState<string | null>(null)
  const [editingBillId,  setEditingBillId]  = useState<string | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setPkg(EMPTY_PKG)
    setEditingPkgId(null)
    setEditingBillId(null)
    setError('')
    setStep(1)
    setShowForm(true)
  }

  async function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ ...EMPTY_FORM, display_name: u.display_name ?? '', email: u.email ?? u.client?.email ?? '', role: u.role })
    setPkg(EMPTY_PKG)
    setEditingPkgId(null)
    setEditingBillId(null)
    setError('')
    setStep(1)
    setShowForm(true)

    if (u.role === 'client' && u.client_id) {
      setFormLoading(true)
      try {
        const [pkgRes, billRes] = await Promise.all([
          fetch(`/api/packages?clientId=${u.client_id}`),
          fetch(`/api/billing-plans?clientId=${u.client_id}`),
        ])
        if (pkgRes.ok) {
          const pkgs = await pkgRes.json()
          const activePkg = (pkgs as Array<{
            id: string; name: string; renewal_type: string; price: number; notes?: string;
            items: Array<{ task_type: string; label: string; total_quantity: number }>
          }>).find(p => p) // take the most recent
          if (activePkg) {
            setEditingPkgId(activePkg.id)
            // Merge DB items into default items list
            const merged = DEFAULT_PKG_ITEMS.map(def => {
              const found = activePkg.items.find(i => i.task_type === def.task_type)
              return found
                ? { ...def, label: found.label, total_quantity: String(found.total_quantity) }
                : def
            })
            // Append any custom items not in defaults
            const extraItems = activePkg.items
              .filter(i => !TASK_TYPES.find(t => t.value === i.task_type))
              .map(i => ({ task_type: i.task_type, label: i.label, total_quantity: String(i.total_quantity) }))
            setPkg({
              name:         activePkg.name,
              renewal_type: (activePkg.renewal_type as 'monthly' | 'one_time') ?? 'monthly',
              price:        String(activePkg.price ?? ''),
              notes:        activePkg.notes ?? '',
              items:        [...merged, ...extraItems],
            })
          }
        }
        if (billRes.ok) {
          const bills = await billRes.json()
          const activeBill = (bills as Array<{
            id: string; cycle_type: string; amount: number; currency: string; custom_days?: number
          }>).find(b => b)
          if (activeBill) {
            setEditingBillId(activeBill.id)
            setForm(prev => ({
              ...prev,
              billing_cycle:       activeBill.cycle_type as BillingCycle,
              billing_amount:      String(activeBill.amount ?? ''),
              billing_currency:    activeBill.currency ?? 'AED',
              billing_custom_days: activeBill.cycle_type === 'custom_days' ? String(activeBill.custom_days ?? '') : '',
            }))
          }
        }
      } catch (_) { /* non-critical, form still works */ }
      setFormLoading(false)
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError('')
    setStep(1)
  }

  const isClient   = form.role === 'client'
  const totalSteps = isClient ? 3 : 1
  const hasAutoBill = isClient && form.billing_cycle !== 'manual'

  function nextStep() {
    setError('')
    // Auto-fill billing amount from package price when entering billing step
    if (step === 2 && !form.billing_amount && pkg.price) {
      setForm(p => ({ ...p, billing_amount: pkg.price }))
    }
    setStep(s => Math.min(s + 1, totalSteps))
  }
  function prevStep() { setError(''); setStep(s => Math.max(s - 1, 1)) }

  // ── Create ──────────────────────────────────────────────────────────────────
  async function createUser() {
    setSaving(true); setError('')
    const filteredItems = pkg.items
      .filter(i => Number(i.total_quantity) > 0)
      .map(i => ({ task_type: i.task_type, label: i.label, total_quantity: Number(i.total_quantity) }))
    // Send package payload if name provided OR if any item has a quantity
    const pkgPayload = (pkg.name.trim() || filteredItems.length > 0)
      ? {
          name:         pkg.name.trim() || 'Custom Package',
          renewal_type: pkg.renewal_type,
          price:        pkg.price ? Number(pkg.price) : 0,
          notes:        pkg.notes || undefined,
          items:        filteredItems,
        }
      : undefined

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        billing_custom_days: form.billing_custom_days ? Number(form.billing_custom_days) : undefined,
        billing_start_date:  form.billing_start_date || undefined,
        payment_policy_type: form.payment_policy_type,
        payment_advance_pct: form.billing_amount && form.advance_amount && Number(form.billing_amount) > 0
          ? Math.round((Number(form.advance_amount) / Number(form.billing_amount)) * 100)
          : 50,
        payment_final_days:  form.payment_final_days,
        advance_amount:      Number(form.advance_amount) > 0 ? Number(form.advance_amount) : undefined,
        advance_method:      form.advance_method || undefined,
        advance_date:        form.advance_date || undefined,
        package:             pkgPayload,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    await loadUsers()
    closeForm()
    setSaving(false)
  }

  // ── Update (client — 3 sections) ───────────────────────────────────────────
  async function updateClient() {
    if (!editing) return
    setSaving(true); setError('')

    // 1. Account
    const accountRes = await fetch(`/api/users/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: form.display_name,
        role:         form.role,
        phone:        form.phone,
        country:      form.country,
        notes:        form.notes,
        email:        form.email || undefined,
      }),
    })
    if (!accountRes.ok) {
      const d = await accountRes.json(); setError(d.error); setSaving(false); return
    }

    // 2. Package
    if (pkg.name.trim()) {
      const pkgPayload = {
        name:         pkg.name.trim(),
        renewal_type: pkg.renewal_type,
        price:        pkg.price ? Number(pkg.price) : 0,
        notes:        pkg.notes || null,
        start_date:   new Date().toISOString().split('T')[0],
        is_active:    true,
        items: pkg.items
          .filter(i => Number(i.total_quantity) > 0)
          .map(i => ({ task_type: i.task_type, label: i.label, total_quantity: Number(i.total_quantity) })),
      }
      if (editingPkgId) {
        await fetch(`/api/packages/${editingPkgId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pkgPayload),
        })
      } else if (editing.client_id) {
        await fetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...pkgPayload, client_id: editing.client_id }),
        })
      }
    }

    // 3. Billing plan
    if (form.billing_cycle !== 'manual') {
      const billPayload = {
        cycle_type:        form.billing_cycle,
        amount:            Number(form.billing_amount),
        currency:          form.billing_currency,
        custom_days:       form.billing_cycle === 'custom_days' ? Number(form.billing_custom_days) : null,
        next_invoice_date: new Date().toISOString().split('T')[0],
        is_active:         true,
        client_id:         editing.client_id,
      }
      if (editingBillId) {
        await fetch(`/api/billing-plans/${editingBillId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(billPayload),
        })
      } else if (editing.client_id) {
        await fetch('/api/billing-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(billPayload),
        })
      }
    }

    await loadUsers()
    closeForm()
    setSaving(false)
  }

  // ── Update (team member — step 1 only) ────────────────────────────────────
  async function updateTeam() {
    if (!editing) return
    setSaving(true); setError('')
    const res = await fetch(`/api/users/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: form.display_name, role: form.role, phone: form.phone, country: form.country, notes: form.notes }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    await loadUsers()
    closeForm()
    setSaving(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function deleteUser(id: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return
    setDeleting(id)
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id))
    setDeleting(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step < totalSteps) { nextStep(); return }
    if (editing) {
      if (isClient) updateClient(); else updateTeam()
    } else {
      createUser()
    }
  }

  function updatePkgItem(idx: number, qty: string) {
    setPkg(p => { const items = [...p.items]; items[idx] = { ...items[idx], total_quantity: qty }; return { ...p, items } })
  }

  const teamUsers   = users.filter(u => TEAM_ROLES.includes(u.role))
  const clientUsers = users.filter(u => u.role === 'client')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-slate-400 text-sm mt-1">Manage team & client portal accounts</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl my-8">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
              <div>
                <h3 className="font-semibold text-white text-lg">
                  {editing ? `Edit — ${editing.display_name ?? editing.id}` : 'New User'}
                </h3>
                {isClient && (
                  <p className="text-xs text-slate-500 mt-0.5">Step {step} of {totalSteps}</p>
                )}
              </div>
              <button onClick={closeForm} className="text-slate-400 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step indicator (clients only) */}
            {isClient && (
              <div className="flex items-center gap-0 px-6 pt-4">
                {[
                  { n: 1, icon: User,    label: 'Account' },
                  { n: 2, icon: Package, label: 'Package' },
                  { n: 3, icon: Zap,     label: 'Billing'  },
                ].map(({ n, icon: Icon, label }, idx) => (
                  <div key={n} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        step > n
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : step === n
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}>
                        {step > n ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                      </div>
                      <span className={`text-[10px] font-medium ${step === n ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                    </div>
                    {idx < 2 && (
                      <div className={`flex-1 h-0.5 mb-5 mx-1 ${step > n ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Form loading overlay for edit prefill */}
            {formLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                <span className="ml-3 text-slate-400 text-sm">Loading client data…</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-5">

                {/* ── Step 1: Account ────────────────────────────────────────── */}
                {step === 1 && (
                  <>
                    <div>
                      <Label className="mb-2 block">Role</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {ALL_ROLES.map(r => (
                          <button
                            key={r} type="button"
                            disabled={!!editing && (editing.role === 'client') !== (r === 'client')}
                            onClick={() => setForm(p => ({ ...p, role: r }))}
                            className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              form.role === r
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            {ROLE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>{isClient ? 'Client Name' : 'Display Name'}</Label>
                        <Input
                          placeholder={isClient ? 'Dr. Hazem Ahmed' : 'Ahmed Ali'}
                          value={form.display_name}
                          onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          Email
                          {editing && <span className="text-slate-500 font-normal ml-1 text-xs">(leave to keep current)</span>}
                        </Label>
                        <Input
                          type="email" placeholder="user@example.com"
                          value={form.email}
                          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          required={!editing}
                        />
                      </div>
                      {!editing && (
                        <div className="space-y-1.5">
                          <Label>Password</Label>
                          <Input type="password" placeholder="min 6 characters"
                            value={form.password}
                            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                            required minLength={6}
                          />
                        </div>
                      )}
                      {isClient && (
                        <>
                          <div className="space-y-1.5">
                            <Label>Phone <span className="text-slate-500">(optional)</span></Label>
                            <Input placeholder="+20 1xx xxx xxxx"
                              value={form.phone}
                              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Country <span className="text-slate-500">(optional)</span></Label>
                            <Input placeholder="Egypt"
                              value={form.country}
                              onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label>Notes <span className="text-slate-500">(optional)</span></Label>
                            <Input placeholder="Any notes about this client…"
                              value={form.notes}
                              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {!editing && isClient && (
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-3 text-sm text-indigo-300">
                        ✓ A client record will be created automatically and linked to this portal account
                      </div>
                    )}
                  </>
                )}

                {/* ── Step 2: Package ────────────────────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="h-4 w-4 text-indigo-400" />
                      <span className="text-sm font-semibold text-white">Package Setup</span>
                      {!editingPkgId && <span className="text-xs text-slate-500 ml-1">— optional, can be skipped</span>}
                      {editingPkgId && <span className="text-xs text-emerald-400 ml-1">— editing existing package</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5 col-span-2">
                        <Label>Package Name</Label>
                        <Input placeholder="e.g. Social Media Growth"
                          value={pkg.name}
                          onChange={e => setPkg(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Type</Label>
                        <select
                          value={pkg.renewal_type}
                          onChange={e => setPkg(p => ({ ...p, renewal_type: e.target.value as 'monthly' | 'one_time' }))}
                          className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="monthly">↻ Monthly</option>
                          <option value="one_time">⊙ One-Time</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Price <span className="text-slate-500">(optional)</span></Label>
                        <Input type="number" min="0" step="0.01" placeholder="0"
                          value={pkg.price}
                          onChange={e => setPkg(p => ({ ...p, price: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="block">Deliverable Quantities <span className="text-slate-500">(leave 0 to skip)</span></Label>
                      <div className="space-y-2">
                        {pkg.items.map((item, idx) => (
                          <div key={item.task_type} className="flex items-center gap-3">
                            <div className="flex-1 text-sm text-slate-300">{item.label}</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updatePkgItem(idx, String(Math.max(0, (Number(item.total_quantity) || 0) - 1)))}
                                className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold flex items-center justify-center transition-colors"
                              >−</button>
                              <input
                                type="number" min="0" max="999"
                                value={item.total_quantity}
                                onChange={e => updatePkgItem(idx, e.target.value)}
                                className="w-14 text-center bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => updatePkgItem(idx, String((Number(item.total_quantity) || 0) + 1))}
                                className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold flex items-center justify-center transition-colors"
                              >+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Package Notes <span className="text-slate-500">(optional)</span></Label>
                      <Input placeholder="e.g. Includes 2 revisions per piece"
                        value={pkg.notes}
                        onChange={e => setPkg(p => ({ ...p, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* ── Step 3: Billing ────────────────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm font-semibold text-white">Auto-Billing</span>
                      {editingBillId && <span className="text-xs text-emerald-400 ml-1">— editing existing plan</span>}
                    </div>

                    {/* Billing cycle */}
                    <div className="space-y-1.5">
                      <Label>Billing Cycle</Label>
                      <select
                        value={form.billing_cycle}
                        onChange={e => setForm(p => ({ ...p, billing_cycle: e.target.value as BillingCycle }))}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      >
                        {BILLING_CYCLES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {hasAutoBill && (
                      <>
                        {/* Amount + Currency */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2 space-y-1.5">
                            <Label>Amount</Label>
                            <Input type="number" min="1" step="0.01" placeholder="3000"
                              value={form.billing_amount}
                              onChange={e => setForm(p => ({ ...p, billing_amount: e.target.value }))}
                              required={hasAutoBill}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Currency</Label>
                            <select
                              value={form.billing_currency}
                              onChange={e => setForm(p => ({ ...p, billing_currency: e.target.value }))}
                              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                            >
                              <option value="USD">USD $</option>
                              <option value="EGP">EGP</option>
                              <option value="EUR">EUR €</option>
                              <option value="GBP">GBP £</option>
                              <option value="AED">AED</option>
                            </select>
                          </div>
                        </div>

                        {form.billing_cycle === 'custom_days' && (
                          <div className="space-y-1.5">
                            <Label>Every how many days?</Label>
                            <Input type="number" min="1" max="365" placeholder="e.g. 21"
                              value={form.billing_custom_days}
                              onChange={e => setForm(p => ({ ...p, billing_custom_days: e.target.value }))}
                              required
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Manual billing note */}
                    {!hasAutoBill && (
                      <p className="text-xs text-slate-500">
                        Set to manual — you can send invoices from the Billing section at any time.
                      </p>
                    )}

                    {/* ── Advance Payment — always visible for clients ── */}
                    {(() => {
                      const advAmt    = Number(form.advance_amount) || 0
                      const total     = Number(form.billing_amount) || 0
                      const remaining = Math.max(0, total - advAmt)
                      return (
                        <div className="space-y-3 pt-1 border-t border-slate-800">
                          <Label className="text-xs text-slate-400 uppercase tracking-wider">Advance Payment (عربون)</Label>

                          {/* Due date for remaining — when manual billing, show it here */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">Remaining Balance Due Date</Label>
                            <Input type="date" value={form.billing_start_date} className="text-slate-300"
                              onChange={e => setForm(p => ({ ...p, billing_start_date: e.target.value }))}
                            />
                            <p className="text-xs text-slate-500">Advance recorded immediately; remaining due on this date.</p>
                          </div>

                          <div className="space-y-3 bg-slate-800/40 rounded-xl p-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Advance Received</Label>
                                <Input type="number" min={0} step="0.01" placeholder="0"
                                  value={form.advance_amount}
                                  onChange={e => setForm(p => ({ ...p, advance_amount: e.target.value }))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Remaining (auto)</Label>
                                <div className="h-9 flex items-center px-3 bg-slate-900 border border-slate-700 rounded-lg">
                                  <span className={`text-sm font-bold ${remaining > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {form.billing_currency} {total > 0 ? remaining.toLocaleString() : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {remaining > 0 && form.billing_start_date && (
                              <div className="text-xs text-slate-400 bg-slate-900/60 rounded-lg px-3 py-2">
                                💡 Remaining <strong className="text-amber-300">{form.billing_currency} {remaining.toLocaleString()}</strong> will be due on <strong className="text-white">{form.billing_start_date}</strong>
                              </div>
                            )}

                            {!editing && (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Payment Date</Label>
                                  <Input type="date" value={form.advance_date} className="text-slate-300"
                                    onChange={e => setForm(p => ({ ...p, advance_date: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Payment Method</Label>
                                  <select value={form.advance_method}
                                    onChange={e => setForm(p => ({ ...p, advance_method: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500">
                                    <option value="">— Select —</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="instapay">InstaPay</option>
                                    <option value="vodafone_cash">Vodafone Cash</option>
                                    <option value="cash">Cash</option>
                                    <option value="credit_card">Credit Card</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    {step > 1 && (
                      <Button type="button" variant="outline" onClick={prevStep} className="gap-1.5">
                        <ChevronLeft className="h-4 w-4" /> Back
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                    <Button type="submit" disabled={saving}>
                      {saving
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{editing ? 'Saving…' : 'Creating…'}</>
                        : editing
                          ? step < totalSteps
                            ? <span className="flex items-center gap-1.5">Next <ChevronRight className="h-4 w-4" /></span>
                            : 'Save Changes'
                          : step < totalSteps
                            ? <span className="flex items-center gap-1.5">Next <ChevronRight className="h-4 w-4" /></span>
                            : isClient
                              ? 'Create Client Account'
                              : 'Create Team Account'
                      }
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Lists ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* Team Members */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Team Members ({teamUsers.length})
            </h3>
            {teamUsers.length === 0
              ? <p className="text-slate-600 text-sm">No team accounts yet.</p>
              : (
                <div className="grid gap-2">
                  {teamUsers.map(u => (
                    <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                          {(u.display_name ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm">{u.display_name ?? '—'}</p>
                          <p className="text-xs text-slate-500">
                            {u.email ? `${u.email} · ` : ''}{new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteUser(u.id)} disabled={deleting === u.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          {deleting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Clients */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Client Portals ({clientUsers.length})
            </h3>
            {clientUsers.length === 0
              ? <p className="text-slate-600 text-sm">No client accounts yet.</p>
              : (
                <div className="grid gap-2">
                  {clientUsers.map(u => (
                    <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 font-bold text-sm">
                          {(u.display_name ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm">{u.display_name ?? '—'}</p>
                          <p className="text-xs text-slate-500">
                            {u.client?.email ?? ''} · {new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-green-500/10 text-green-400 border-green-500/20">
                          Client Portal
                        </span>
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteUser(u.id)} disabled={deleting === u.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          {deleting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}
