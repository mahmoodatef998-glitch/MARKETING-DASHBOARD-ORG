'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, Globe, Music2, CheckCircle2, XCircle, Loader2, Plus, Trash2, AlertTriangle, ExternalLink, Link2, Users } from 'lucide-react'
import type { Client } from '@/types'

const PLATFORMS = [
  {
    key:    'instagram' as const,
    label:  'Instagram',
    icon:   Camera,
    color:  'from-pink-500 to-purple-500',
    fields: [
      { key: 'ig_user_id',   label: 'Instagram Business User ID', placeholder: '17841400000000000' },
      { key: 'access_token', label: 'Page Access Token',          placeholder: 'EAABsbCS…',         type: 'password' },
    ],
    help: 'https://developers.facebook.com/docs/instagram-api/getting-started',
  },
  {
    key:    'facebook' as const,
    label:  'Facebook Page',
    icon:   Globe,
    color:  'from-blue-600 to-blue-500',
    fields: [
      { key: 'page_id',      label: 'Facebook Page ID',  placeholder: '123456789012345' },
      { key: 'access_token', label: 'Page Access Token', placeholder: 'EAABsbCS…',     type: 'password' },
    ],
    help: 'https://developers.facebook.com/docs/pages/getting-started',
  },
  {
    key:         'tiktok' as const,
    label:       'TikTok',
    icon:        Music2,
    color:       'from-slate-700 to-slate-600',
    manualOnly:  true,
    fields: [
      { key: 'access_token', label: 'User Access Token', placeholder: 'act.example…', type: 'password' },
    ],
    help: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
  },
]

type PlatformKey = 'instagram' | 'facebook' | 'tiktok'

interface Connection {
  id:               string
  client_id:        string
  platform:         PlatformKey
  page_id?:         string
  ig_user_id?:      string
  token_expires_at?: string
  is_active:        boolean
  extra?:           Record<string, string>
  created_at:       string
}

// ─── Platform Card ─────────────────────────────────────────────────────────
function PlatformCard({ cfg, connection, clientId, onSave, onDelete }: {
  cfg:        typeof PLATFORMS[number]
  connection: Connection | null
  clientId:   string
  onSave:     (platform: PlatformKey, data: Record<string, string>) => Promise<void>
  onDelete:   (id: string) => Promise<void>
}) {
  const [open,     setOpen]     = useState(false)
  const [form,     setForm]     = useState<Record<string, string>>({})
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const Icon      = cfg.icon
  const isExpired = connection?.token_expires_at
    ? new Date(connection.token_expires_at) < new Date()
    : false
  const pageName  = connection?.extra?.page_name
  const igUser    = connection?.extra?.ig_username

  async function handleSave() {
    setSaving(true)
    await onSave(cfg.key, form)
    setForm({})
    setOpen(false)
    setSaving(false)
  }

  async function handleDelete() {
    if (!connection || !confirm(`Remove ${cfg.label} connection for this client?`)) return
    setDeleting(true)
    await onDelete(connection.id)
    setDeleting(false)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white text-sm">{cfg.label}</p>
              {(cfg as { manualOnly?: boolean }).manualOnly && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600">
                  Manual token only
                </span>
              )}
            </div>
            {connection ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                {isExpired
                  ? <><AlertTriangle className="h-3 w-3 text-amber-400" /><span className="text-xs text-amber-400">Token expired</span></>
                  : <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-xs text-emerald-400">Connected{pageName ? ` — ${pageName}` : ''}{igUser ? ` (@${igUser})` : ''}</span></>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <XCircle className="h-3 w-3 text-slate-500" />
                <span className="text-xs text-slate-500">Not connected</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a href={cfg.help} target="_blank" rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
            <ExternalLink className="h-3 w-3" /> Guide
          </a>
          {connection ? (
            <>
              <button onClick={() => setOpen(o => !o)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                {isExpired ? 'Refresh' : 'Update'}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : (
            <button onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
              <Plus className="h-3.5 w-3.5" /> Manual
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800 px-5 py-4 space-y-3 bg-slate-950/40">
          <p className="text-xs text-slate-500">Enter credentials manually (or use the OAuth button above to connect automatically).</p>
          {cfg.fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">{f.label}</label>
              <input
                type={(f as { type?: string }).type ?? 'text'}
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors font-mono"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setOpen(false); setForm({}) }}
              className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold transition-colors">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const searchParams   = useSearchParams()
  const [clients,      setClients]     = useState<Client[]>([])
  const [selectedId,   setSelectedId]  = useState<string>('')
  const [connections,  setConnections] = useState<Connection[]>([])
  const [loading,      setLoading]     = useState(true)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [banner,       setBanner]      = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Handle OAuth redirect result
  useEffect(() => {
    const err = searchParams.get('error')
    const ok  = searchParams.get('success')
    const cid = searchParams.get('client_id')
    if (err) setBanner({ type: 'error',   msg: decodeURIComponent(err) })
    if (ok)  setBanner({ type: 'success', msg: 'Facebook & Instagram connected successfully!' })
    if (cid) setSelectedId(cid)
  }, [searchParams])

  // Load clients once
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((data: Client[]) => {
        const list = Array.isArray(data) ? data : []
        setClients(list)
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
      })
  }, [])

  const loadConnections = useCallback(async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    const res = await fetch(`/api/social/connections?client_id=${clientId}`)
    if (res.ok) setConnections(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedId) void loadConnections(selectedId)
  }, [selectedId, loadConnections])

  function startOAuth() {
    if (!selectedId) return
    setOauthLoading(true)
    window.location.href = `/api/social/oauth?client_id=${selectedId}`
  }

  async function handleSave(platform: PlatformKey, data: Record<string, string>) {
    await fetch('/api/social/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: selectedId, platform, ...data }),
    })
    await loadConnections(selectedId)
  }

  async function handleDelete(id: string) {
    await fetch('/api/social/connections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadConnections(selectedId)
  }

  const selectedClient = clients.find(c => c.id === selectedId)
  const fbAppConfigured = true // always show — server will validate

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Banner */}
      {banner && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
          banner.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {banner.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-white">Social Media Connections</h1>
        <p className="text-sm text-slate-400 mt-1">Each client has their own connected social accounts.</p>
      </div>

      {/* Client selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-4 w-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">Select Client</p>
        </div>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setBanner(null) }}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
        >
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* OAuth connect button */}
        {selectedId && (
          <button
            onClick={startOAuth}
            disabled={oauthLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-900/30"
          >
            {oauthLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</>
              : <><Link2 className="h-4 w-4" /> Connect Facebook & Instagram for {selectedClient?.name ?? '…'}</>}
          </button>
        )}
        <p className="text-xs text-slate-500 text-center">
          One click connects both Facebook Pages and Instagram Business accounts automatically via OAuth.
        </p>
      </div>

      {/* Platform cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-slate-800/50 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map(cfg => (
            <PlatformCard
              key={cfg.key}
              cfg={cfg}
              connection={connections.find(c => c.platform === cfg.key) ?? null}
              clientId={selectedId}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Setup guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-white">One-time Facebook App Setup (admin only)</p>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
          <li>Go to <span className="text-indigo-400">developers.facebook.com</span> → Create App → Business type</li>
          <li>Add products: <span className="text-slate-300">Facebook Login</span> + <span className="text-slate-300">Instagram Graph API</span></li>
          <li>In Facebook Login settings → add Valid OAuth Redirect URI: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">{typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/social/oauth/callback</code></li>
          <li>Set env vars: <code className="bg-slate-800 px-1 rounded">FB_APP_ID</code> and <code className="bg-slate-800 px-1 rounded">FB_APP_SECRET</code></li>
          <li>In App Review → request permissions: <code className="bg-slate-800 px-1 rounded">pages_manage_posts</code>, <code className="bg-slate-800 px-1 rounded">instagram_content_publish</code></li>
          <li>After setup, use the blue button above for each client — they log in with their own Facebook and select their Page</li>
        </ol>
      </div>
    </div>
  )
}
