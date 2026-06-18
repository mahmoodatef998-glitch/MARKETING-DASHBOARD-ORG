'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, Plus, CheckCircle2, Clock, Trash2, Loader2,
  Users, X, AlarmClock, ChevronDown, Pencil, FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { Meeting } from '@/types'

interface Client { id: string; name: string }

// ─── Shared Meeting Form Fields ───────────────────────────────────────────────
function MeetingForm({
  clients,
  title, setTitle,
  clientName, setClientName,
  clientId, setClientId,
  scheduledAt, setScheduledAt,
  notes, setNotes,
}: {
  clients: Client[]
  title: string; setTitle: (v: string) => void
  clientName: string; setClientName: (v: string) => void
  clientId: string; setClientId: (v: string) => void
  scheduledAt: string; setScheduledAt: (v: string) => void
  notes: string; setNotes: (v: string) => void
}) {
  const [pickExisting, setPickExisting] = useState(false)

  function selectExistingClient(id: string) {
    setClientId(id)
    const c = clients.find(c => c.id === id)
    if (c) setClientName(c.name)
    setPickExisting(false)
  }

  function clearExisting() {
    setClientId('')
    setPickExisting(false)
  }

  return (
    <div className="p-5 space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300">Meeting Title *</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Intro call with new client"
          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors"
        />
      </div>

      {/* Client */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300">
          Client Name <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            value={clientName}
            onChange={e => { setClientName(e.target.value); if (!e.target.value) clearExisting() }}
            placeholder="Type any client name…"
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors"
          />
          {clients.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickExisting(p => !p)}
                className={`h-full px-3 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1 ${
                  clientId
                    ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3" />
              </button>
              {pickExisting && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden">
                  <div className="max-h-44 overflow-y-auto">
                    {clients.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => selectExistingClient(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-700 ${
                          clientId === c.id ? 'text-indigo-400' : 'text-slate-200'
                        }`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {clientId && (
                    <button type="button" onClick={clearExisting}
                      className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-red-400 border-t border-slate-700 transition-colors">
                      Clear selection
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {clientId && (
          <p className="text-xs text-indigo-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Linked to registered client
          </p>
        )}
      </div>

      {/* Date + Time */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400" /> Date &amp; Time *
        </label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300">
          Notes <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Agenda, topics to discuss…"
          rows={3}
          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none resize-none transition-colors"
        />
      </div>
    </div>
  )
}

// ─── New Meeting Modal ────────────────────────────────────────────────────────
function NewMeetingModal({
  clients, onSave, onClose,
}: {
  clients: Client[]
  onSave: (d: { title: string; client_name?: string; client_id?: string; scheduled_at: string; notes?: string }) => Promise<void>
  onClose: () => void
}) {
  const [title,       setTitle]       = useState('')
  const [clientName,  setClientName]  = useState('')
  const [clientId,    setClientId]    = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    setScheduledAt(d.toISOString().slice(0, 16))
  }, [])

  async function handleSave() {
    if (!title.trim() || !scheduledAt) return
    setSaving(true)
    await onSave({
      title:        title.trim(),
      client_name:  clientName.trim() || undefined,
      client_id:    clientId || undefined,
      scheduled_at: new Date(scheduledAt).toISOString(),
      notes:        notes.trim() || undefined,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="font-semibold text-white text-sm">Schedule Meeting</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <MeetingForm
          clients={clients}
          title={title} setTitle={setTitle}
          clientName={clientName} setClientName={setClientName}
          clientId={clientId} setClientId={setClientId}
          scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}
          notes={notes} setNotes={setNotes}
        />

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !scheduledAt || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Meeting Detail Modal ─────────────────────────────────────────────────────
function MeetingDetailModal({
  meeting,
  clients,
  onEdit,
  onDone,
  onDelete,
  onClose,
}: {
  meeting: Meeting
  clients: Client[]
  onEdit:   (id: string, d: { title: string; client_name?: string; client_id?: string; scheduled_at: string; notes?: string }) => Promise<void>
  onDone:   (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose:  () => void
}) {
  const [mode,        setMode]        = useState<'view' | 'edit'>('view')
  const [title,       setTitle]       = useState(meeting.title)
  const [clientName,  setClientName]  = useState(meeting.client_name ?? meeting.client?.name ?? '')
  const [clientId,    setClientId]    = useState(meeting.client_id ?? '')
  const [scheduledAt, setScheduledAt] = useState(
    new Date(meeting.scheduled_at).toISOString().slice(0, 16)
  )
  const [notes,          setNotes]          = useState(meeting.notes ?? '')
  const [saving,         setSaving]         = useState(false)
  const [markingDone,    setMarkingDone]    = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  const now          = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const meetingDt    = new Date(meeting.scheduled_at)
  const meetingDay   = new Date(meetingDt.getFullYear(), meetingDt.getMonth(), meetingDt.getDate())
  const isPast       = meetingDt < startOfToday
  const isDone       = meeting.status === 'done'
  const diffDays     = Math.round((meetingDay.getTime() - startOfToday.getTime()) / 86_400_000)
  const displayName  = meeting.client?.name ?? meeting.client_name

  let timeLabel = ''
  if (!isDone) {
    if (isPast)              timeLabel = 'Overdue'
    else if (diffDays === 0) timeLabel = 'Today'
    else if (diffDays === 1) timeLabel = 'Tomorrow'
    else                     timeLabel = `In ${diffDays} days`
  }

  async function handleSave() {
    if (!title.trim() || !scheduledAt) return
    setSaving(true)
    await onEdit(meeting.id, {
      title:        title.trim(),
      client_name:  clientName.trim() || undefined,
      client_id:    clientId || undefined,
      scheduled_at: new Date(scheduledAt).toISOString(),
      notes:        notes.trim() || undefined,
    })
    setSaving(false)
  }

  async function handleDone() {
    setMarkingDone(true)
    await onDone(meeting.id)
    setMarkingDone(false)
    onClose()
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(meeting.id)
    setDeleting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              mode === 'edit' ? 'bg-amber-500/15' : 'bg-indigo-500/15'
            }`}>
              {mode === 'edit'
                ? <Pencil      className="h-4 w-4 text-amber-400" />
                : <CalendarDays className="h-4 w-4 text-indigo-400" />}
            </div>
            <span className="font-semibold text-white text-sm">
              {mode === 'edit' ? 'Edit Meeting' : 'Meeting Details'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — view mode */}
        {mode === 'view' && (
          <div className="p-5 space-y-4">
            {/* Title + status */}
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isDone         ? 'bg-green-500/10'  :
                isPast         ? 'bg-red-500/10'    :
                diffDays === 0 ? 'bg-amber-500/10'  :
                                 'bg-indigo-500/10'
              }`}>
                {isDone         ? <CheckCircle2 className="h-5 w-5 text-green-400" />  :
                 isPast         ? <AlarmClock   className="h-5 w-5 text-red-400" />    :
                 diffDays === 0 ? <Clock        className="h-5 w-5 text-amber-400" />  :
                                  <CalendarDays className="h-5 w-5 text-indigo-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`font-bold text-base leading-tight ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                  {meeting.title}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {isDone ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">Done</span>
                  ) : timeLabel ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                      isPast         ? 'bg-red-500/10 text-red-400 border-red-500/20'       :
                      diffDays === 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                       'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    }`}>{timeLabel}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800" />

            {/* Details rows */}
            <div className="space-y-3">
              {/* Date & time */}
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Date &amp; Time</p>
                  <p className="text-sm text-slate-200 font-medium">
                    {meetingDt.toLocaleString([], {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Client */}
              {displayName && (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Client</p>
                    <p className="text-sm text-slate-200 font-medium flex items-center gap-1.5">
                      {displayName}
                      {meeting.client_id && (
                        <span className="text-xs text-indigo-400 font-normal">· registered</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {meeting.notes && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Notes</p>
                    <p className="text-sm text-slate-300 mt-0.5 leading-relaxed whitespace-pre-wrap">{meeting.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800" />

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 text-sm font-medium transition-colors border border-amber-500/20">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>

              {!isDone && (
                <>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors border border-red-500/20">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Sure?</span>
                      <button onClick={handleDelete} disabled={deleting}
                        className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors disabled:opacity-60">
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, delete'}
                      </button>
                      <button onClick={() => setConfirmDelete(false)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                        Cancel
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleDone}
                    disabled={markingDone}
                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
                    {markingDone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Mark Done
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Body — edit mode */}
        {mode === 'edit' && (
          <>
            <MeetingForm
              clients={clients}
              title={title} setTitle={setTitle}
              clientName={clientName} setClientName={setClientName}
              clientId={clientId} setClientId={setClientId}
              scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}
              notes={notes} setNotes={setNotes}
            />
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setMode('view')}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || !scheduledAt || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────
function MeetingCard({
  meeting,
  onView,
  onDone,
  onDelete,
}: {
  meeting:  Meeting
  onView:   (meeting: Meeting) => void
  onDone:   (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [markingDone, setMarkingDone] = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const now          = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const meetingDt    = new Date(meeting.scheduled_at)
  const meetingDay   = new Date(meetingDt.getFullYear(), meetingDt.getMonth(), meetingDt.getDate())
  const isPast       = meetingDt < startOfToday
  const isDone       = meeting.status === 'done'
  const diffDays     = Math.round((meetingDay.getTime() - startOfToday.getTime()) / 86_400_000)

  const displayName = meeting.client?.name ?? meeting.client_name

  let timeLabel = ''
  if (!isDone) {
    if (isPast)              timeLabel = 'Overdue'
    else if (diffDays === 0) timeLabel = 'Today'
    else if (diffDays === 1) timeLabel = 'Tomorrow'
    else                     timeLabel = `In ${diffDays} days`
  }

  async function handleDone(e: React.MouseEvent) {
    e.stopPropagation()
    setMarkingDone(true)
    await onDone(meeting.id)
    setMarkingDone(false)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this meeting?')) return
    setDeleting(true)
    await onDelete(meeting.id)
    setDeleting(false)
  }

  return (
    <Card
      onClick={() => onView(meeting)}
      className={`cursor-pointer transition-all ${
        isDone         ? 'opacity-60' :
        isPast         ? 'border-red-500/20 hover:border-red-500/40' :
        diffDays === 0 ? 'border-amber-500/20 hover:border-amber-500/40' :
                         'hover:border-indigo-500/40'
      }`}
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isDone         ? 'bg-green-500/10'  :
            isPast         ? 'bg-red-500/10'    :
            diffDays === 0 ? 'bg-amber-500/10'  :
                             'bg-indigo-500/10'
          }`}>
            {isDone         ? <CheckCircle2 className="h-5 w-5 text-green-400" />  :
             isPast         ? <AlarmClock   className="h-5 w-5 text-red-400" />    :
             diffDays === 0 ? <Clock        className="h-5 w-5 text-amber-400" />  :
                              <CalendarDays className="h-5 w-5 text-indigo-400" />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold text-sm ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                {meeting.title}
              </h3>
              {isDone ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">Done</span>
              ) : timeLabel ? (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                  isPast         ? 'bg-red-500/10 text-red-400 border-red-500/20'       :
                  diffDays === 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                   'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}>{timeLabel}</span>
              ) : null}
            </div>

            {displayName && (
              <div className="flex items-center gap-1 mt-1">
                <Users className="h-3 w-3 text-slate-500" />
                <span className="text-xs text-slate-400">{displayName}</span>
                {meeting.client_id && (
                  <span className="text-xs text-indigo-500">· registered</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3 text-slate-500" />
              <span className="text-xs text-slate-400">
                {meetingDt.toLocaleString([], {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>

            {meeting.notes && (
              <p className="mt-1.5 text-xs text-slate-500 line-clamp-1">{meeting.notes}</p>
            )}
          </div>

          {/* Actions — stop propagation so clicks don't open detail modal */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
            {!isDone && (
              <button onClick={handleDone} disabled={markingDone}
                className="flex items-center gap-1 sm:gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold transition-colors min-h-[36px]">
                {markingDone
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Done</span>
              </button>
            )}
            <button onClick={handleDelete} disabled={deleting}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MeetingsPage() {
  const { toast }  = useToast()
  const router     = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<'all' | 'upcoming' | 'done'>('upcoming')
  const [showNew,  setShowNew]  = useState(false)
  const [viewing,  setViewing]  = useState<Meeting | null>(null)
  const [apiError, setApiError] = useState('')

  // Role guard — meetings are admin-only
  useEffect(() => {
    import('@/lib/supabase').then(({ getSupabaseClient }) => {
      const client = getSupabaseClient()
      client.auth.getUser().then(({ data }) => {
        if (!data.user) { router.replace('/login'); return }
        client.from('profiles').select('role').eq('id', data.user.id).single()
          .then(({ data: profile }) => {
            if (profile?.role && profile.role !== 'admin') router.replace('/dashboard')
          })
      })
    })
  }, [router])

  async function load() {
    setApiError('')
    const [mr, cr] = await Promise.all([
      fetch('/api/meetings'),
      fetch('/api/clients'),
    ])
    if (mr.ok) {
      setMeetings(await mr.json())
    } else {
      const err = await mr.json().catch(() => ({}))
      setApiError(err.error ?? 'Could not load meetings')
    }
    if (cr.ok) {
      const cd = await cr.json()
      setClients(Array.isArray(cd) ? cd : (cd.data ?? []))
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleCreate(data: {
    title: string; client_name?: string; client_id?: string
    scheduled_at: string; notes?: string
  }) {
    const res = await fetch('/api/meetings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (res.ok) {
      const created = await res.json()
      setMeetings(prev =>
        [...prev, created].sort((a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        )
      )
      setShowNew(false)
      setFilter('upcoming')
      toast('Meeting scheduled', 'success')
    } else {
      const err = await res.json().catch(() => ({}))
      toast(err.error ?? 'Failed to schedule meeting', 'error')
    }
  }

  async function handleEdit(id: string, data: {
    title: string; client_name?: string; client_id?: string
    scheduled_at: string; notes?: string
  }) {
    const res = await fetch(`/api/meetings/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setMeetings(prev =>
        prev.map(m => m.id === id ? updated : m)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      )
      setViewing(null)
      toast('Meeting updated', 'success')
    } else {
      const err = await res.json().catch(() => ({}))
      toast(err.error ?? 'Failed to update meeting', 'error')
    }
  }

  async function handleDone(id: string) {
    const res = await fetch(`/api/meetings/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'done' }),
    })
    if (res.ok) {
      const updated = await res.json()
      setMeetings(prev => prev.map(m => m.id === id ? updated : m))
      toast('Marked as done', 'success')
    } else {
      toast('Failed to update', 'error')
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMeetings(prev => prev.filter(m => m.id !== id))
      toast('Meeting deleted', 'success')
    } else {
      toast('Failed to delete', 'error')
    }
  }

  const now        = new Date()
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
  const upcoming   = meetings.filter(m => m.status === 'pending')
  const done       = meetings.filter(m => m.status === 'done')
  const overdue    = upcoming.filter(m => new Date(m.scheduled_at) < startOfDay)
  const todayCount = upcoming.filter(m =>
    new Date(m.scheduled_at).toDateString() === now.toDateString()
  ).length

  const filtered = filter === 'upcoming' ? upcoming
    : filter === 'done' ? done
    : meetings

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Meetings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Schedule and track client meetings</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="flex items-center gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0">
          <Plus className="h-4 w-4" /> Schedule Meeting
        </Button>
      </div>

      {/* DB error */}
      {apiError && (
        <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          <AlarmClock className="h-4 w-4 shrink-0" />
          <span><strong>Database error:</strong> {apiError}. Run the SQL migration in Supabase to create the meetings table.</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Upcoming',  value: upcoming.length,  icon: CalendarDays, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Today',     value: todayCount,        icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
          { label: 'Overdue',   value: overdue.length,    icon: AlarmClock,   color: 'text-red-400',    bg: 'bg-red-500/10'    },
          { label: 'Completed', value: done.length,       icon: CheckCircle2, color: 'text-green-400',  bg: 'bg-green-500/10'  },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-xl font-bold text-slate-100">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {([
          { key: 'upcoming', label: `Upcoming (${upcoming.length})` },
          { key: 'done',     label: `Done (${done.length})` },
          { key: 'all',      label: `All (${meetings.length})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500 text-sm">
              {filter === 'upcoming' ? 'No upcoming meetings'
               : filter === 'done'   ? 'No completed meetings yet'
               :                       'No meetings yet'}
            </p>
            {filter !== 'done' && (
              <button onClick={() => setShowNew(true)}
                className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                Schedule your first meeting →
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filter === 'upcoming' && overdue.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/8 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlarmClock className="h-4 w-4 shrink-0" />
              {overdue.length} meeting{overdue.length > 1 ? 's are' : ' is'} overdue — mark as done or delete.
            </div>
          )}
          {filtered.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onView={setViewing}
              onDone={handleDone}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewMeetingModal clients={clients} onSave={handleCreate} onClose={() => setShowNew(false)} />
      )}

      {viewing && (
        <MeetingDetailModal
          meeting={viewing}
          clients={clients}
          onEdit={handleEdit}
          onDone={handleDone}
          onDelete={handleDelete}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
