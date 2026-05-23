'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ClientForm from '@/components/clients/ClientForm'
import { useToast } from '@/components/ui/toast'
import { Plus, Search, Pencil, Trash2, Mail, Phone, Globe } from 'lucide-react'
import type { Client } from '@/types'

export default function ClientsPage() {
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  async function load() {
    const res = await fetch('/api/clients')
    const data = await res.json()
    setClients(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSave(data: Partial<Client>) {
    if (editing) {
      const res = await fetch(`/api/clients/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) { toast('Client updated', 'success'); setOpen(false); load() }
      else toast('Failed to update client', 'error')
    } else {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) { toast('Client created', 'success'); setOpen(false); load() }
      else toast('Failed to create client', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client?')) return
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Client deleted', 'success'); load() }
    else toast('Failed to delete', 'error')
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor = (s: string) =>
    s === 'active' ? 'bg-green-500/20 text-green-400' :
    s === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
    'bg-slate-700 text-slate-400'

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            className="pl-9"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> Add Client
        </Button>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 flex-wrap text-sm text-slate-400">
        <span>{clients.length} total</span>
        <span className="text-green-400">{clients.filter((c) => c.status === 'active').length} active</span>
        <span className="text-yellow-400">{clients.filter((c) => c.status === 'pending').length} pending</span>
        <span className="text-slate-500">{clients.filter((c) => c.status === 'inactive').length} inactive</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-slate-400 text-sm">No clients found.</p>
            <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus className="h-4 w-4" /> Add First Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Card key={client.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100 text-sm">{client.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block ${statusColor(client.status)}`}>
                        {client.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(client); setOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-400" onClick={() => handleDelete(client.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.country && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.country}</span>
                    </div>
                  )}
                </div>

                {client.notes && (
                  <p className="mt-3 text-xs text-slate-500 line-clamp-2 border-t border-slate-800 pt-3">
                    {client.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Client' : 'New Client'}</DialogTitle>
          </DialogHeader>
          <ClientForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
