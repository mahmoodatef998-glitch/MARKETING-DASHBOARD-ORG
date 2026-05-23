'use client'
import { useEffect, useState } from 'react'
import { Plus, Loader2, Users, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type UserRole = 'video_maker' | 'designer' | 'ai_video' | 'media_buyer' | 'client'

interface AppUser {
  id: string
  role: UserRole
  display_name?: string
  team_member_id?: string
  client_id?: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker & Photographer',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
  client:      'Client',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/10 text-purple-400',
  designer:    'bg-pink-500/10 text-pink-400',
  ai_video:    'bg-cyan-500/10 text-cyan-400',
  media_buyer: 'bg-orange-500/10 text-orange-400',
  client:      'bg-green-500/10 text-green-400',
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    email: '', password: '', display_name: '',
    role: 'designer' as UserRole,
  })

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setUsers(prev => [data, ...prev])
    setShowForm(false)
    setForm({ email: '', password: '', display_name: '', role: 'designer' })
    setSaving(false)
  }

  const teamUsers   = users.filter(u => u.role !== 'client')
  const clientUsers = users.filter(u => u.role === 'client')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-slate-400 text-sm mt-1">Create and manage team & client accounts</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="font-semibold text-white mb-4">New User</h3>
          <form onSubmit={createUser} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input placeholder="Ahmed Ali" value={form.display_name}
                onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="ahmed@agency.com" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="min 6 characters" value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
                className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm outline-none focus:border-indigo-500"
              >
                <option value="video_maker">Video Maker & Photographer</option>
                <option value="designer">Designer</option>
                <option value="ai_video">AI Video</option>
                <option value="media_buyer">Media Buyer</option>
                <option value="client">Client</option>
              </select>
            </div>

            {error && (
              <div className="col-span-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="col-span-2 flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create User'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Team Section */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
              Team Members ({teamUsers.length})
            </h3>
            {teamUsers.length === 0 ? (
              <p className="text-slate-600 text-sm">No team accounts yet.</p>
            ) : (
              <div className="grid gap-3">
                {teamUsers.map(u => (
                  <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                        {(u.display_name ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{u.display_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clients Section */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
              Client Portals ({clientUsers.length})
            </h3>
            {clientUsers.length === 0 ? (
              <p className="text-slate-600 text-sm">No client accounts yet.</p>
            ) : (
              <div className="grid gap-3">
                {clientUsers.map(u => (
                  <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 font-bold text-sm">
                        {(u.display_name ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{u.display_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                      Client
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
