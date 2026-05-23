'use client'
import { useEffect, useState } from 'react'
import { Plus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type UserRole = 'video_maker' | 'designer' | 'ai_video' | 'media_buyer' | 'client'

interface AppUser {
  id: string
  role: UserRole
  display_name?: string
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

const TEAM_ROLES: UserRole[] = ['video_maker', 'designer', 'ai_video', 'media_buyer']
const ALL_ROLES:  UserRole[] = ['video_maker', 'designer', 'ai_video', 'media_buyer', 'client']

const EMPTY_FORM = {
  display_name: '', email: '', password: '',
  role: 'designer' as UserRole,
  phone: '', country: '', notes: '',
}

export default function UsersPage() {
  const [users,    setUsers]    = useState<AppUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<AppUser | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error,    setError]    = useState('')
  const [form,     setForm]     = useState(EMPTY_FORM)

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
    setError('')
    setShowForm(true)
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({
      display_name: u.display_name ?? '',
      email:        u.client?.email ?? '',
      password:     '',
      role:         u.role,
      phone:        '',
      country:      '',
      notes:        '',
    })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError('')
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setUsers(prev => [data, ...prev])
    closeForm()
    setSaving(false)
  }

  async function updateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true); setError('')
    const res = await fetch(`/api/users/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: form.display_name,
        role:         form.role,
        phone:        form.phone,
        country:      form.country,
        notes:        form.notes,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    await loadUsers()
    closeForm()
    setSaving(false)
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return
    setDeleting(id)
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id))
    setDeleting(null)
  }

  const isClient   = form.role === 'client'
  const teamUsers  = users.filter(u => TEAM_ROLES.includes(u.role))
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white text-lg">
                {editing ? `Edit — ${editing.display_name ?? editing.id}` : 'New User'}
              </h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={editing ? updateUser : createUser} className="p-6 space-y-4">
              {/* Role buttons */}
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

                {!editing && (
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email" placeholder="user@example.com"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                )}

                {!editing && (
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input
                      type="password" placeholder="min 6 characters"
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
                      <Input
                        placeholder="+20 1xx xxx xxxx"
                        value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Country <span className="text-slate-500">(optional)</span></Label>
                      <Input
                        placeholder="Egypt"
                        value={form.country}
                        onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Notes <span className="text-slate-500">(optional)</span></Label>
                      <Input
                        placeholder="Any notes about this client…"
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

              {error && (
                <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{editing ? 'Saving…' : 'Creating…'}</>
                    : editing
                      ? 'Save Changes'
                      : `Create ${isClient ? 'Client' : 'Team'} Account`
                  }
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── User lists ────────────────────────────────────────────────────────── */}
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
                          <p className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={deleting === u.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {deleting === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
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
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={deleting === u.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {deleting === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
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
