'use client'
import { useEffect, useState, useCallback } from 'react'
import { Image, Film, Music, Trash2, Copy, Check, RefreshCw, ImageIcon, Loader2, X } from 'lucide-react'

interface MediaItem {
  public_id:     string
  secure_url:    string
  resource_type: string
  format:        string
  bytes:         number
  width?:        number
  height?:       number
  created_at:    string
  folder:        string
}

type Tab = 'all' | 'image' | 'video' | 'audio'

function formatBytes(b: number): string {
  if (b < 1024)        return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function MediaCard({ item, onDelete }: { item: MediaItem; onDelete: (item: MediaItem) => void }) {
  const [copied,   setCopied]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm,  setConfirm]  = useState(false)

  const isImage = item.resource_type === 'image'
  const isAudio = item.folder.includes('audio') || ['mp3','wav','ogg','m4a','webm','aac'].includes(item.format)
  const isVideo = !isImage && !isAudio

  async function copyUrl() {
    await navigator.clipboard.writeText(item.secure_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch('/api/media', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ public_id: item.public_id, resource_type: item.resource_type }),
    })
    if (res.ok) {
      onDelete(item)
    } else {
      setDeleting(false)
      setConfirm(false)
    }
  }

  const filename = item.public_id.split('/').pop() ?? item.public_id

  return (
    <div className="group relative bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-indigo-500/40 transition-all duration-200">
      {/* Preview */}
      <div className="relative h-40 bg-slate-900 flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.secure_url}
            alt={filename}
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : isVideo ? (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Film className="h-10 w-10 text-violet-400" />
            <span className="text-xs uppercase tracking-widest text-slate-500">{item.format}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Music className="h-10 w-10 text-indigo-400" />
            <span className="text-xs uppercase tracking-widest text-slate-500">{item.format}</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={copyUrl}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Confirm
              </button>
              <button onClick={() => setConfirm(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
            isImage ? 'bg-emerald-500/20 text-emerald-300' :
            isVideo ? 'bg-violet-500/20 text-violet-300' :
                      'bg-indigo-500/20 text-indigo-300'
          }`}>
            {isImage ? 'IMG' : isVideo ? 'VID' : 'AUD'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-white font-medium truncate" title={filename}>{filename}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-slate-500">{formatBytes(item.bytes)}</span>
          <span className="text-[11px] text-slate-600">
            {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          </span>
        </div>
        {isImage && item.width && item.height && (
          <span className="text-[11px] text-slate-600">{item.width}×{item.height}</span>
        )}
      </div>
    </div>
  )
}

export default function MediaLibraryPage() {
  const [items,   setItems]   = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('all')
  const [search,  setSearch]  = useState('')
  const [error,   setError]   = useState('')

  const load = useCallback(async (t: Tab) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/media?type=${t === 'audio' ? 'audio' : t}`)
      if (!res.ok) throw new Error('Failed to load media')
      const data = await res.json()
      setItems(data)
    } catch {
      setError('Could not load media. Check Cloudinary credentials.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  const filtered = items.filter(i => {
    if (!search) return true
    return i.public_id.toLowerCase().includes(search.toLowerCase())
  })

  const counts = {
    all:   items.length,
    image: items.filter(i => i.resource_type === 'image').length,
    video: items.filter(i => i.resource_type !== 'image' && !i.folder.includes('audio') && !['mp3','wav','ogg','m4a','webm','aac'].includes(i.format)).length,
    audio: items.filter(i => i.folder.includes('audio') || ['mp3','wav','ogg','m4a','webm','aac'].includes(i.format)).length,
  }

  const tabs: { key: Tab; label: string; icon: typeof Image }[] = [
    { key: 'all',   label: 'All',    icon: ImageIcon },
    { key: 'image', label: 'Images', icon: Image },
    { key: 'video', label: 'Videos', icon: Film },
    { key: 'audio', label: 'Audio',  icon: Music },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Media Library</h1>
          <p className="text-slate-400 text-sm mt-0.5">{items.length} file{items.length !== 1 ? 's' : ''} stored on Cloudinary</p>
        </div>
        <button onClick={() => load(tab)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 bg-slate-800/60 border border-slate-700 p-1 rounded-xl">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-500'
              }`}>{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by filename…"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl py-20 flex flex-col items-center gap-3">
          <ImageIcon className="h-12 w-12 text-slate-600" />
          <p className="text-slate-400 text-sm">No media found</p>
          <p className="text-slate-600 text-xs">Files uploaded through tasks and portals will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(item => (
            <MediaCard
              key={item.public_id}
              item={item}
              onDelete={deleted => setItems(prev => prev.filter(i => i.public_id !== deleted.public_id))}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!loading && !error && items.length > 0 && (
        <div className="flex items-center gap-6 text-xs text-slate-600 pt-2 border-t border-slate-800">
          <span>{counts.image} image{counts.image !== 1 ? 's' : ''}</span>
          <span>{counts.video} video{counts.video !== 1 ? 's' : ''}</span>
          <span>{counts.audio} audio file{counts.audio !== 1 ? 's' : ''}</span>
          <span className="ml-auto">
            Total: {formatBytes(items.reduce((s, i) => s + i.bytes, 0))}
          </span>
        </div>
      )}
    </div>
  )
}
