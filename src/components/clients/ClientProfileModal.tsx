'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Pencil, Trash2, X, Loader2, Package, CheckCircle2,
  Mail, Phone, Globe, CalendarDays, DollarSign, RefreshCw, FileText,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Client, ClientPackage, PackageItem } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_TASK_TYPES = [
  { value: 'reel_video', label: 'Reels & Short Videos' },
  { value: 'design',     label: 'Designs' },
  { value: 'ai_video',   label: 'AI Videos' },
  { value: 'post',       label: 'Social Media Posts' },
  { value: 'custom',     label: 'Custom / Other' },
]

const typeColor: Record<string, string> = {
  reel_video: 'from-purple-500 to-indigo-500',
  design:     'from-pink-500 to-rose-500',
  ai_video:   'from-cyan-500 to-blue-500',
  post:       'from-green-500 to-emerald-500',
  custom:     'from-orange-500 to-amber-500',
}

// ─── Package Form ─────────────────────────────────────────────────────────────

interface PackageFormData {
  name: string
  price: string
  renewal_type: 'monthly' | 'one_time'
  start_date: string
  end_date: string
  notes: string
  items: Partial<PackageItem>[]
}

const DEFAULT_ITEMS: Partial<PackageItem>[] = [
  { label: 'Reels & Short Videos', task_type: 'reel_video', total_quantity: 0, sort_order: 0 },
  { label: 'Designs',              task_type: 'design',     total_quantity: 0, sort_order: 1 },
  { label: 'AI Videos',            task_type: 'ai_video',   total_quantity: 0, sort_order: 2 },
  { label: 'Social Media Posts',   task_type: 'post',       total_quantity: 0, sort_order: 3 },
]

function PackageForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ClientPackage
  onSave: (data: PackageFormData) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<PackageFormData>({
    name:         initial?.name ?? 'Custom Package',
    price:        String(initial?.price ?? ''),
    renewal_type: initial?.renewal_type ?? 'monthly',
    start_date:   initial?.start_date ?? new Date().toISOString().split('T')[0],
    end_date:     initial?.end_date ?? '',
    notes:        initial?.notes ?? '',
    items: initial?.items?.length
      ? initial.items.map((i) => ({ ...i }))
      : DEFAULT_ITEMS.map((i) => ({ ...i })),
  })
  const [loading, setLoading] = useState(false)

  function setField(k: keyof PackageFormData, v: any) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function setItem(idx: number, k: keyof PackageItem, v: any) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => i === idx ? { ...item, [k]: v } : item),
    }))
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [...f.items, { label: '', task_type: 'custom', total_quantity: 0, sort_order: f.items.length }],
    }))
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSave(form)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Package info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Package Name</Label>
          <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Price</Label>
          <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} placeholder="0.00" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Renewal Type</Label>
          <Select value={form.renewal_type} onValueChange={(v) => setField('renewal_type', v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly (auto-renews)</SelectItem>
              <SelectItem value="one_time">One-Time Package</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} className="text-slate-300" />
        </div>
      </div>

      {form.renewal_type === 'one_time' && (
        <div className="space-y-1.5">
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} className="text-slate-300" />
        </div>
      )}

      {/* Deliverable items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Package Items (deliverables)</Label>
          <button type="button" onClick={addItem} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add item
          </button>
        </div>
        <div className="space-y-2">
          {form.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-800/40 rounded-lg p-2">
              {/* Label */}
              <div className="col-span-4">
                <Input
                  value={item.label ?? ''}
                  onChange={(e) => setItem(idx, 'label', e.target.value)}
                  placeholder="Item name"
                  className="h-8 text-sm"
                  required
                />
              </div>
              {/* Type */}
              <div className="col-span-4">
                <Select value={item.task_type ?? 'custom'} onValueChange={(v) => setItem(idx, 'task_type', v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASE_TASK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Quantity */}
              <div className="col-span-3">
                <Input
                  type="number" min="0"
                  value={item.total_quantity ?? 0}
                  onChange={(e) => setItem(idx, 'total_quantity', Number(e.target.value))}
                  placeholder="Qty"
                  className="h-8 text-sm"
                />
              </div>
              {/* Remove */}
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 text-slate-600 hover:text-red-400 rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} placeholder="Package details, terms…" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial ? 'Update Package' : 'Create Package'}
        </Button>
      </div>
    </form>
  )
}

// ─── Package Card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  onEdit,
  onDelete,
}: {
  pkg: ClientPackage
  onEdit: () => void
  onDelete: () => void
}) {
  const totalItems = pkg.items.reduce((s, i) => s + i.total_quantity, 0)
  const totalUsed  = pkg.items.reduce((s, i) => s + (i.used ?? 0), 0)
  const overallPct = totalItems > 0 ? Math.round((totalUsed / totalItems) * 100) : 0

  return (
    <div className="border border-slate-700 rounded-xl p-4 space-y-4 bg-slate-800/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-100">{pkg.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              pkg.renewal_type === 'monthly'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}>
              {pkg.renewal_type === 'monthly' ? 'Monthly' : 'One-Time'}
            </span>
            {pkg.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">Active</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            {pkg.price > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(pkg.price)} / {pkg.renewal_type === 'monthly' ? 'month' : 'package'}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Since {formatDate(pkg.start_date)}
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-red-400" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Overall progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">Overall Progress</span>
          <span className="text-xs font-semibold text-slate-300">
            {totalUsed} / {totalItems} delivered ({overallPct}%)
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
            style={{ width: `${Math.min(overallPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Per-item progress */}
      {pkg.items.length > 0 && (
        <div className="space-y-2.5">
          {pkg.items.map((item) => {
            const used  = item.used ?? 0
            const total = item.total_quantity
            const pct   = total > 0 ? Math.round((used / total) * 100) : 0
            const remaining = Math.max(total - used, 0)
            const gradient = typeColor[item.task_type] ?? 'from-slate-400 to-slate-500'

            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-br ${gradient}`} />
                    <span className="text-xs text-slate-300 truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-slate-500">
                      {used}/{total}
                    </span>
                    <span className={`text-xs font-bold ${
                      pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {pct}%
                    </span>
                    <span className="text-xs text-slate-500 w-16 text-right">
                      {remaining > 0 ? `${remaining} left` : <span className="text-red-400">Done!</span>}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pkg.notes && (
        <p className="text-xs text-slate-500 pt-2 border-t border-slate-700">{pkg.notes}</p>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  client: Client | null
  open: boolean
  onClose: () => void
}

export default function ClientProfileModal({ client, open, onClose }: Props) {
  const { toast } = useToast()
  const [packages, setPackages]       = useState<ClientPackage[]>([])
  const [loading, setLoading]         = useState(false)
  const [pkgOpen, setPkgOpen]         = useState(false)
  const [editingPkg, setEditingPkg]   = useState<ClientPackage | null>(null)

  async function loadPackages() {
    if (!client) return
    setLoading(true)
    const res = await fetch(`/api/packages?clientId=${client.id}`)
    const data = await res.json()
    setPackages(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    if (open && client) loadPackages()
    else setPackages([])
  }, [open, client?.id])

  async function handleSavePackage(form: any) {
    const url = editingPkg ? `/api/packages/${editingPkg.id}` : '/api/packages'
    const method = editingPkg ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, client_id: client!.id }),
    })
    if (res.ok) {
      toast(editingPkg ? 'Package updated' : 'Package created', 'success')
      setPkgOpen(false)
      setEditingPkg(null)
      loadPackages()
    } else {
      toast('Failed to save package', 'error')
    }
  }

  async function handleDeletePackage(id: string) {
    if (!confirm('Delete this package?')) return
    const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Package deleted', 'success'); loadPackages() }
    else toast('Failed to delete', 'error')
  }

  if (!client) return null

  const activePackages   = packages.filter((p) => p.is_active)
  const inactivePackages = packages.filter((p) => !p.is_active)

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-base">{client.name}</div>
                <div className="text-xs text-slate-400 font-normal">{client.email}</div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Client info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { icon: Mail,         label: 'Email',   value: client.email },
                { icon: Phone,        label: 'Phone',   value: client.phone ?? '—' },
                { icon: Globe,        label: 'Country', value: client.country ?? '—' },
                { icon: CalendarDays, label: 'Member Since', value: formatDate(client.created_at) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2 text-slate-400">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="text-slate-500 text-xs">{label}:</span>
                  <span className="text-slate-300 text-xs truncate">{value}</span>
                </div>
              ))}
            </div>

            {client.notes && (
              <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">{client.notes}</p>
            )}

            {/* Packages section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <Package className="h-4 w-4 text-indigo-400" />
                  Service Packages
                </h3>
                <Button size="sm" onClick={() => { setEditingPkg(null); setPkgOpen(true) }}>
                  <Plus className="h-3.5 w-3.5" /> New Package
                </Button>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-slate-800/50 animate-pulse" />
                  ))}
                </div>
              ) : activePackages.length === 0 && inactivePackages.length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-xl p-8 text-center">
                  <Package className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No packages yet.</p>
                  <Button size="sm" className="mt-3" onClick={() => { setEditingPkg(null); setPkgOpen(true) }}>
                    <Plus className="h-3.5 w-3.5" /> Create First Package
                  </Button>
                </div>
              ) : (
                <>
                  {activePackages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      onEdit={() => { setEditingPkg(pkg); setPkgOpen(true) }}
                      onDelete={() => handleDeletePackage(pkg.id)}
                    />
                  ))}
                  {inactivePackages.length > 0 && (
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                        {inactivePackages.length} inactive package{inactivePackages.length > 1 ? 's' : ''}
                      </summary>
                      <div className="mt-2 space-y-2 opacity-60">
                        {inactivePackages.map((pkg) => (
                          <PackageCard
                            key={pkg.id}
                            pkg={pkg}
                            onEdit={() => { setEditingPkg(pkg); setPkgOpen(true) }}
                            onDelete={() => handleDeletePackage(pkg.id)}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Package form dialog */}
      <Dialog open={pkgOpen} onOpenChange={(o) => { setPkgOpen(o); if (!o) setEditingPkg(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingPkg ? 'Edit Package' : 'New Package'}</DialogTitle>
          </DialogHeader>
          <PackageForm
            initial={editingPkg ?? undefined}
            onSave={handleSavePackage}
            onCancel={() => { setPkgOpen(false); setEditingPkg(null) }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
