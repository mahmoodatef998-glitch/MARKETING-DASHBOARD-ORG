'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { Client } from '@/types'

interface Props {
  initial?: Partial<Client>
  onSave: (data: Partial<Client>) => Promise<void>
  onCancel: () => void
}

export default function ClientForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    status: initial?.status ?? 'pending',
    country: initial?.country ?? '',
    notes: initial?.notes ?? '',
  })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSave(form as Partial<Client>)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Additional notes…" rows={3} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : initial?.id ? 'Update Client' : 'Create Client'}
        </Button>
      </div>
    </form>
  )
}
