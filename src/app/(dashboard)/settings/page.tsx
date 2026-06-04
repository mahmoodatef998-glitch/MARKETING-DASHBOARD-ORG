'use client'
import { useEffect, useState } from 'react'
import { Camera, Globe, Music2, CheckCircle2, XCircle, Loader2, Plus, Trash2, AlertTriangle, ExternalLink } from 'lucide-react'

const PLATFORMS = [
  {
    key:   'instagram',
    label: 'Instagram',
    icon:  Camera,
    color: 'from-pink-500 to-purple-500',
    fields: [
      { key: 'ig_user_id',   label: 'Instagram User ID',    placeholder: '17841400000000000' },
      { key: 'access_token', label: 'Page Access Token',    placeholder: 'EAABsbCS...',        type: 'password' },
    ],
    help: 'https://developers.facebook.com/docs/instagram-api/getting-started',
  },
  {
    key:   'facebook',
    label: 'Facebook Page',
    icon:  Globe,
    color: 'from-blue-600 to-blue-500',
    fields: [
      { key: 'page_id',      label: 'Facebook Page ID',     placeholder: '123456789012345' },
      { key: 'access_token', label: 'Page Access Token',    placeholder: 'EAABsbCS...',        type: 'password' },
    ],
    help: 'https://developers.facebook.com/docs/pages/getting-started',
  },
  {
    key:   'tiktok',
    label: 'TikTok',
    icon:  Music2,
    color: 'from-slate-700 to-slate-600',
    fields: [
      { key: 'access_token', label: 'User Access Token',    placeholder: 'act.example...',     type: 'password' },
    ],
    help: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
  },
] as const

type PlatformKey = 'instagram' | 'facebook' | 'tiktok'

interface Connection {
  id:               string
  platform:         PlatformKey
  page_id?:         string
  ig_user_id?:      string
  token_expires_at?: string
  is_active:        boolean
  created_at:       string
}

function PlatformCard({ cfg, connection, onSave, onDelete }: {
  cfg:        typeof PLATFORMS[number]
  connection: Connection | null
  onSave:     (platform: PlatformKey, data: Record<string, string>) => Promise<void>
  onDelete:   (id: string) => Promise<void>
}) {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(false)

  const Icon = cfg.icon

  async function handleSave() {
    setSaving(true)
    await onSave(cfg.key as PlatformKey, form)
    setForm({})
    setOpen(false)
    setSaving(false)
  }

  async function handleDelete() {
    if (!connection || !confirm(`Remove ${cfg.label} connection?`)) return
    setDeleting(true)
    await onDelete(connection.id)
    setDeleting(false)
  }

  const isExpired = connection?.token_expires_at
    ? new Date(connection.token_expires_at) < new Date()
    : false

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{cfg.label}</p>
            {connection ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                {isExpired
                  ? <><AlertTriangle className="h-3 w-3 text-amber-400" /><span className="text-xs text-amber-400">Token expired</span></>
                  : <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-xs text-emerald-400">Connected</span></>}
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
                {isExpired ? 'Refresh Token' : 'Update'}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : (
            <button onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
              <Plus className="h-3.5 w-3.5" /> Connect
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800 px-5 py-4 space-y-3 bg-slate-950/40">
          {cfg.fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">{f.label}</label>
              <input
                type={(f as any).type ?? 'text'}
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
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save Connection'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading,     setLoading]     = useState(true)

  async function load() {
    const res = await fetch('/api/social/connections')
    if (res.ok) setConnections(await res.json())
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleSave(platform: PlatformKey, data: Record<string, string>) {
    await fetch('/api/social/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, ...data }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    await fetch('/api/social/connections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Social Media Integrations</h1>
        <p className="text-sm text-slate-400 mt-1">Connect your social accounts to enable automatic publishing.</p>
      </div>

      {/* How it works */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-indigo-300">How automatic publishing works</p>
        <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
          <li>Connect your accounts below (one-time setup)</li>
          <li>When editing a task, set a publish time + select platforms + write caption</li>
          <li>The system publishes automatically at the scheduled time</li>
          <li>Task status updates to <span className="text-emerald-400">Published</span> with the post link</li>
        </ol>
      </div>

      {/* Platform cards */}
      <div className="space-y-3">
        {PLATFORMS.map(cfg => (
          <PlatformCard
            key={cfg.key}
            cfg={cfg}
            connection={connections.find(c => c.platform === cfg.key) ?? null}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Meta App setup guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-white">Getting your Meta tokens (step-by-step)</p>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
          <li>Go to <span className="text-indigo-400">developers.facebook.com</span> → Create App → Business type</li>
          <li>Add products: <span className="text-slate-300">Instagram Graph API</span> + <span className="text-slate-300">Pages API</span></li>
          <li>In App Review → enable: <code className="bg-slate-800 px-1 rounded">pages_manage_posts</code>, <code className="bg-slate-800 px-1 rounded">instagram_content_publish</code>, <code className="bg-slate-800 px-1 rounded">instagram_basic</code></li>
          <li>Tools → Graph API Explorer → generate a <span className="text-slate-300">Page Access Token</span></li>
          <li>Extend token to 60 days: <code className="bg-slate-800 px-1 rounded text-[11px]">GET /oauth/access_token?grant_type=fb_exchange_token&…</code></li>
          <li>Get Instagram Business User ID: <code className="bg-slate-800 px-1 rounded text-[11px]">GET /{`{page-id}`}?fields=instagram_business_account</code></li>
        </ol>
      </div>
    </div>
  )
}
