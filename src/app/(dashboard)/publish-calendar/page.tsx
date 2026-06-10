'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Camera, Globe, Music2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Client } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublishEvent {
  id:               string
  platform:         'instagram' | 'facebook' | 'tiktok'
  scheduled_at:     string
  status:           'blocked' | 'ready' | 'published' | 'failed' | 'cancelled'
  published_at:     string | null
  platform_post_id: string | null
  error_message:    string | null
  item: {
    id:           string
    title:        string
    content_type: string
    plan: {
      id:     string
      title:  string
      month:  string
      client: { id: string; name: string }
    }
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORM_META = {
  instagram: { label: 'Instagram', icon: Camera,  color: 'text-pink-400',  bg: 'bg-pink-500/20',  border: 'border-pink-500/40',  dot: 'bg-pink-400' },
  facebook:  { label: 'Facebook',  icon: Globe,   color: 'text-blue-400',  bg: 'bg-blue-500/20',  border: 'border-blue-500/40',  dot: 'bg-blue-400' },
  tiktok:    { label: 'TikTok',    icon: Music2,  color: 'text-slate-300', bg: 'bg-slate-700/60', border: 'border-slate-500/40', dot: 'bg-slate-300' },
}

const STATUS_STYLE: Record<string, string> = {
  blocked:   'bg-slate-700/60 text-slate-400 border-slate-600',
  ready:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  published: 'bg-green-500/20 text-green-400 border-green-500/40',
  failed:    'bg-red-500/20 text-red-400 border-red-500/40',
  cancelled: 'bg-slate-800 text-slate-500 border-slate-700',
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', design: 'Design', ai_video: 'AI Video',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function firstDow(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function monthYMStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

// ─── Event Chip ───────────────────────────────────────────────────────────────

function EventChip({ event, onClick }: { event: PublishEvent; onClick: () => void }) {
  const p          = PLATFORM_META[event.platform]
  const isDone     = event.status === 'published'
  const isFailed   = event.status === 'failed'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md px-1.5 py-1 border text-[10px] leading-tight transition-all hover:opacity-90 active:scale-95',
        isDone   ? 'bg-green-500/20 border-green-500/50' :
        isFailed ? 'bg-red-500/15 border-red-500/40' :
        cn(p.bg, p.border)
      )}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {isDone
          ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-green-400" />
          : <p.icon className={cn('h-2.5 w-2.5 shrink-0', p.color)} />
        }
        <span className={cn(
          'font-semibold truncate',
          isDone ? 'text-green-400' : isFailed ? 'text-red-400' : p.color
        )}>{fmtTime(event.scheduled_at)}</span>
        {isDone && (
          <span className="ml-auto shrink-0 text-[9px] text-green-400 font-bold">✓ Done</span>
        )}
        {!isDone && (
          <span className={cn(
            'ml-auto shrink-0 px-1 rounded text-[9px]',
            event.status === 'ready'    ? 'bg-emerald-500/30 text-emerald-400' :
            event.status === 'failed'   ? 'bg-red-500/30 text-red-400' :
            'bg-slate-700 text-slate-500'
          )}>{event.status}</span>
        )}
      </div>
      <p className={cn('truncate', isDone ? 'text-green-300/70' : 'text-slate-400')}>
        {event.item.plan.client.name}
      </p>
      <p className={cn('truncate', isDone ? 'text-green-400/50' : 'text-slate-500')}>
        {event.item.title}
      </p>
    </button>
  )
}

// ─── Event Detail Panel ───────────────────────────────────────────────────────

function EventDetail({ event, onClose, onMarkPublished }: {
  event: PublishEvent
  onClose: () => void
  onMarkPublished: (id: string) => void
}) {
  const p      = PLATFORM_META[event.platform]
  const isDone = event.status === 'published'
  const [busy, setBusy] = useState(false)

  async function handleMarkDone() {
    setBusy(true)
    try {
      const res = await fetch(`/api/publish-events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })
      if (res.ok) onMarkPublished(event.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn(
        'bg-slate-900 rounded-2xl w-full max-w-sm p-5 space-y-4 border transition-colors',
        isDone ? 'border-green-500/40' : 'border-slate-700'
      )}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center border',
              isDone ? 'bg-green-500/20 border-green-500/40' : cn(p.bg, p.border)
            )}>
              {isDone
                ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                : <p.icon className={cn('h-4 w-4', p.color)} />
              }
            </div>
            <div>
              <p className={cn('text-sm font-bold', isDone ? 'text-green-400' : p.color)}>
                {p.label} {isDone && '— Published ✓'}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(event.scheduled_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                {' '}{fmtTime(event.scheduled_at)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Client</span>
            <span className="text-slate-200 font-medium">{event.item.plan.client.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Content</span>
            <span className="text-slate-200 truncate max-w-[60%] text-right">{event.item.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Type</span>
            <span className="text-slate-400">{CONTENT_TYPE_LABELS[event.item.content_type] ?? event.item.content_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_STYLE[event.status])}>
              {event.status}
            </span>
          </div>
          {event.error_message && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-400">
              {event.error_message}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-1">
          {isDone ? (
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-sm font-semibold text-green-400">
              <CheckCircle2 className="h-4 w-4" /> تم النشر بنجاح
            </div>
          ) : event.status !== 'cancelled' && (
            <button onClick={handleMarkDone} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-sm text-white font-semibold transition-all disabled:opacity-50">
              {busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle2 className="h-4 w-4" />
              }
              Mark as Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublishCalendarPage() {
  const router = useRouter()
  const now    = new Date()

  const [events,        setEvents]        = useState<PublishEvent[]>([])
  const [clients,       setClients]       = useState<Client[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [year,          setYear]          = useState(now.getFullYear())
  const [month,         setMonth]         = useState(now.getMonth())
  const [viewMode,      setViewMode]      = useState<'month' | 'week'>('month')
  const [filterClient,  setFilterClient]  = useState('all')
  const [filterPlat,    setFilterPlat]    = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [filterType,    setFilterType]    = useState('all')
  const [selectedEvent, setSelectedEvent] = useState<PublishEvent | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p || !['admin', 'media_buyer'].includes(p.role)) router.replace('/dashboard')
    })
  }, [router])

  const loadClients = useCallback(async () => {
    const res = await fetch('/api/clients')
    if (res.ok) setClients(await res.json())
  }, [])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const ym = monthYMStr(year, month)
    const params = new URLSearchParams({ month: ym })
    if (filterClient !== 'all') params.set('client_id', filterClient)
    if (filterPlat   !== 'all') params.set('platform',  filterPlat)
    if (filterStatus !== 'all') params.set('status',    filterStatus)
    if (filterType   !== 'all') params.set('content_type', filterType)
    try {
      const res = await fetch(`/api/publish-events?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setLoadError(json.error ?? `Error ${res.status}`)
        setEvents([])
      } else {
        setEvents(json)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load events')
      setEvents([])
    }
    setLoading(false)
  }, [year, month, filterClient, filterPlat, filterStatus, filterType])

  useEffect(() => { void loadClients() }, [loadClients])
  useEffect(() => { void loadEvents()  }, [loadEvents])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  // Build day→events map for quick lookup
  const eventsByDay: Record<string, PublishEvent[]> = {}
  for (const ev of events) {
    const day = toYMD(new Date(ev.scheduled_at))
    if (!eventsByDay[day]) eventsByDay[day] = []
    eventsByDay[day].push(ev)
  }

  function handleMarkPublished(id: string) {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'published', published_at: new Date().toISOString() } : e))
    setSelectedEvent(prev => prev?.id === id ? { ...prev, status: 'published', published_at: new Date().toISOString() } : prev)
  }

  // ── Month view grid ────────────────────────────────────────────────────────
  const totalDays = daysInMonth(year, month)
  const startDow  = firstDow(year, month)
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // ── Week view ──────────────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return d
  })
  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })

  const totalEvents = events.length
  const readyCount  = events.filter(e => e.status === 'ready').length

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Publishing Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalEvents} event{totalEvents !== 1 ? 's' : ''}
            {readyCount > 0 && <span className="ml-2 text-emerald-400 font-medium">· {readyCount} ready to publish</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode('month')}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}>
            Month
          </button>
          <button onClick={() => setViewMode('week')}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}>
            Week
          </button>
          <Button size="sm" variant="ghost" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPlat} onValueChange={setFilterPlat}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="design">Design</SelectItem>
            <SelectItem value="ai_video">AI Video</SelectItem>
          </SelectContent>
        </Select>

        {/* Platform legend */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {Object.entries(PLATFORM_META).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className={cn('w-2 h-2 rounded-full', val.dot)} />
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* Month nav */}
      {viewMode === 'month' && (
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-slate-200 font-semibold min-w-[140px] text-center">
            {new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            className="text-xs text-slate-500 hover:text-indigo-400 transition-colors ml-1">
            Today
          </button>
        </div>
      )}

      {/* Week nav */}
      {viewMode === 'week' && (
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-slate-200 font-semibold min-w-[220px] text-center text-sm">
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' — '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - d.getDay()); setWeekStart(d)
          }} className="text-xs text-slate-500 hover:text-indigo-400 transition-colors ml-1">
            This week
          </button>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span className="font-semibold">Error loading events: </span>{loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          {/* ── Month View ── */}
          {viewMode === 'month' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b border-slate-800">
                {DOW.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-slate-500">{d}</div>
                ))}
              </div>

              {/* Cells */}
              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  const isToday = day !== null &&
                    day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                  const ymd    = day !== null ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
                  const dayEvs = ymd ? (eventsByDay[ymd] ?? []) : []

                  return (
                    <div key={idx} className={cn(
                      'min-h-[100px] p-1.5 border-b border-r border-slate-800/60',
                      day === null && 'bg-slate-950/30',
                    )}>
                      {day !== null && (
                        <>
                          <div className={cn(
                            'w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1.5 font-medium',
                            isToday ? 'bg-indigo-600 text-white' : 'text-slate-500'
                          )}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvs.slice(0, 3).map(ev => (
                              <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                            ))}
                            {dayEvs.length > 3 && (
                              <p className="text-[10px] text-slate-500 pl-1">+{dayEvs.length - 3} more</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Week View ── */}
          {viewMode === 'week' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-800">
                {weekDays.map((d, i) => {
                  const isToday = toYMD(d) === toYMD(now)
                  return (
                    <div key={i} className={cn(
                      'py-3 text-center border-r border-slate-800 last:border-0',
                      isToday && 'bg-indigo-600/10'
                    )}>
                      <p className="text-xs text-slate-500">{DOW[d.getDay()]}</p>
                      <p className={cn(
                        'text-sm font-bold mt-0.5',
                        isToday ? 'text-indigo-400' : 'text-slate-300'
                      )}>
                        {d.getDate()}
                      </p>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-7 min-h-[300px]">
                {weekDays.map((d, i) => {
                  const ymd    = toYMD(d)
                  const dayEvs = eventsByDay[ymd] ?? []
                  const isToday = ymd === toYMD(now)
                  return (
                    <div key={i} className={cn(
                      'p-2 border-r border-slate-800 last:border-0 space-y-1',
                      isToday && 'bg-indigo-600/5'
                    )}>
                      {dayEvs.map(ev => (
                        <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                      ))}
                      {dayEvs.length === 0 && (
                        <p className="text-[10px] text-slate-700 text-center pt-4">—</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {events.length === 0 && !loadError && (
            <div className="text-center py-16 text-slate-600">
              <p className="text-lg">No publish events in {new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</p>
              <p className="text-sm mt-1">Use the arrows above to navigate to the month your plan is scheduled for</p>
            </div>
          )}
        </>
      )}

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onMarkPublished={handleMarkPublished}
        />
      )}
    </div>
  )
}
