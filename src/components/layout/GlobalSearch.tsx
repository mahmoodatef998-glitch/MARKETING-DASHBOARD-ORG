'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, CheckSquare, Users, FileText, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface SearchResult {
  tasks:    { id: string; title: string; status: string; priority: string; client?: { name: string } }[]
  clients:  { id: string; name: string; email: string; status: string }[]
  invoices: { id: string; invoice_number: string; total: number; status: string; client?: { name: string } }[]
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'text-blue-400', in_progress: 'text-purple-400', review: 'text-amber-400',
  done: 'text-green-400', overdue: 'text-red-400',
  active: 'text-green-400', inactive: 'text-slate-400', pending: 'text-yellow-400',
  paid: 'text-green-400', sent: 'text-blue-400', draft: 'text-slate-400',
}

interface Props { open: boolean; onClose: () => void }

export default function GlobalSearch({ open, onClose }: Props) {
  const router  = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) { setQuery(''); setResults(null); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  function navigate(path: string) {
    router.push(path)
    onClose()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const total = (results?.tasks.length ?? 0) + (results?.clients.length ?? 0) + (results?.invoices.length ?? 0)
  const hasResults = results && total > 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          {loading
            ? <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
            : <Search className="h-4 w-4 text-slate-400 shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Search tasks, clients, invoices…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null) }} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <p className="text-xs text-slate-500 text-center py-8">Type at least 2 characters to search…</p>
          )}

          {query.length >= 2 && !loading && !hasResults && (
            <p className="text-xs text-slate-500 text-center py-8">No results for &quot;{query}&quot;</p>
          )}

          {/* Tasks */}
          {(results?.tasks.length ?? 0) > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-2 px-4 py-1.5">
                <CheckSquare className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Tasks</span>
              </div>
              {results!.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate('/tasks')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{t.title}</p>
                    {t.client?.name && <p className="text-xs text-slate-500">{t.client.name}</p>}
                  </div>
                  <span className={`text-[11px] font-medium shrink-0 ${STATUS_COLORS[t.status] ?? ''}`}>
                    {t.status.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Clients */}
          {(results?.clients.length ?? 0) > 0 && (
            <div className="py-2 border-t border-slate-800/60">
              <div className="flex items-center gap-2 px-4 py-1.5">
                <Users className="h-3 w-3 text-blue-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Clients</span>
              </div>
              {results!.clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate('/clients')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">{c.email}</p>
                  </div>
                  <span className={`text-[11px] font-medium shrink-0 ${STATUS_COLORS[c.status] ?? ''}`}>
                    {c.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Invoices */}
          {(results?.invoices.length ?? 0) > 0 && (
            <div className="py-2 border-t border-slate-800/60">
              <div className="flex items-center gap-2 px-4 py-1.5">
                <FileText className="h-3 w-3 text-green-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Invoices</span>
              </div>
              {results!.invoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => navigate('/invoices')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{inv.invoice_number}</p>
                    {inv.client?.name && <p className="text-xs text-slate-500">{inv.client.name}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-200">{formatCurrency(inv.total)}</p>
                    <p className={`text-[11px] font-medium ${STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {hasResults && (
          <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-600 text-center">
            {total} result{total !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
