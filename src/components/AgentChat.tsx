'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { HistoryMessage } from '@/app/api/ai/agent/route'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  isFile?: boolean
}

interface AttachedFile {
  name: string
  rowCount: number
  headers: string[]
  preview: string
  fullText: string
}

// ── Robot SVG Avatar ──────────────────────────────────────────────────────────
function RobotAvatar({ size = 32, active = false }: { size?: number; active?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {active && (
        <span
          className="absolute inset-0 rounded-full bg-violet-500 opacity-25 animate-ping"
          style={{ borderRadius: '50%' }}
        />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="20" fill="#1e1b4b" />
        {/* Antenna */}
        <rect x="18.5" y="2" width="3" height="6" rx="1.5" fill="#7c3aed" />
        <circle cx="20" cy="2" r="2.5" fill={active ? '#c4b5fd' : '#8b5cf6'} />
        {/* Head */}
        <rect x="7" y="9" width="26" height="19" rx="4.5" fill="#0f0a2e" />
        <rect x="7" y="9" width="26" height="19" rx="4.5" stroke="#6d28d9" strokeWidth="1.5" />
        {/* Eyes */}
        <rect x="11" y="14" width="7" height="6" rx="2" fill="#3b0764" />
        <rect x="12" y="15" width="5" height="4" rx="1.5" fill={active ? '#a78bfa' : '#7c3aed'} />
        <rect x="13.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        <rect x="22" y="14" width="7" height="6" rx="2" fill="#3b0764" />
        <rect x="23" y="15" width="5" height="4" rx="1.5" fill={active ? '#a78bfa' : '#7c3aed'} />
        <rect x="24.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        {/* Mouth */}
        <rect x="13" y="23" width="14" height="2.5" rx="1.25" fill="#2e1065" />
        <rect x="14.5" y="23.2" width="2" height="2" rx="0.5" fill="#6d28d9" />
        <rect x="19" y="23.2" width="2" height="2" rx="0.5" fill="#8b5cf6" />
        <rect x="23.5" y="23.2" width="2" height="2" rx="0.5" fill="#6d28d9" />
        {/* Neck + shoulders */}
        <rect x="17.5" y="28" width="5" height="4" rx="1.5" fill="#1e1b4b" />
        <rect x="10" y="32" width="20" height="7" rx="3" fill="#0f0a2e" />
        <rect x="10" y="32" width="20" height="7" rx="3" stroke="#6d28d9" strokeWidth="1" />
        <circle cx="17" cy="35.5" r="1.5" fill={active ? '#a78bfa' : '#6d28d9'} />
        <circle cx="20" cy="35.5" r="1.5" fill={active ? '#c4b5fd' : '#8b5cf6'} />
        <circle cx="23" cy="35.5" r="1.5" fill={active ? '#a78bfa' : '#6d28d9'} />
      </svg>
    </div>
  )
}

// ── Simple text renderer (bold, bullets, section dividers) ────────────────────
function MessageText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />

        // Section headers: ═══ ... ═══
        if (line.startsWith('═')) {
          return (
            <p key={i} className="text-xs font-bold text-violet-400 uppercase tracking-wider mt-2 mb-0.5">
              {line.replace(/═+/g, '').trim()}
            </p>
          )
        }

        // Render bold **text** inline
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j} className="font-semibold text-violet-300">{part.slice(2, -2)}</strong>
          }
          return <span key={j}>{part}</span>
        })

        // Bullet / numbered lines
        if (/^[•·\-–]\s|^[١٢٣٤٥٦٧٨٩\d]+[.)]\s/.test(line)) {
          return <p key={i} className="pr-1">{parts}</p>
        }

        return <p key={i}>{parts}</p>
      })}
    </div>
  )
}

// ── Excel parser ──────────────────────────────────────────────────────────────
async function parseExcel(file: File): Promise<AttachedFile> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (rows.length === 0) throw new Error('الملف فاضي')

  const headers = Object.keys(rows[0])
  const preview = rows.slice(0, 3).map(r =>
    headers.map(h => String(r[h] ?? '').substring(0, 30)).join(' | ')
  ).join('\n')

  const allRows = rows.map(r =>
    headers.map(h => String(r[h] ?? '')).join(' | ')
  ).join('\n')

  const fullText =
    `الأعمدة: ${headers.join(' | ')}\n` +
    `إجمالي الصفوف: ${rows.length}\n\n` +
    `البيانات:\n${allRows}`

  return { name: file.name, rowCount: rows.length, headers, preview, fullText }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentChat() {
  const [open, setOpen]             = useState(false)
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [attached, setAttached]     = useState<AttachedFile | null>(null)
  const [parseError, setParseError] = useState('')
  const [chat, setChat]             = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'أهلاً! أنا مديرك التنفيذي الذكي 🤖\n\n**أقدر أعمل:**\n• 📋 استيراد خطط المحتوى من Excel وإنشاء كل المهام تلقائياً\n• ✅ متابعة التقدم وإرسال تقارير يومية\n• ⚠️ رصد التأخيرات وتنبيه الفريق\n• 💰 إدارة الفواتير والملخص المالي\n• 👥 توزيع المهام على الفريق\n\n**ارفع ملف Excel** أو اكتب أمرك مباشرةً وأنا هنفذ.',
    },
  ])
  const [history, setHistory]       = useState<HistoryMessage[]>([])
  const bottomRef                   = useRef<HTMLDivElement>(null)
  const textareaRef                 = useRef<HTMLTextAreaElement>(null)
  const fileRef                     = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, open])

  const handleFile = useCallback(async (file: File) => {
    setParseError('')
    try {
      const parsed = await parseExcel(file)
      setAttached(parsed)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'فشل قراءة الملف')
    }
  }, [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  async function send() {
    const text = input.trim()
    const hasContent = text || attached
    if (!hasContent || loading) return

    let messageText = text
    let displayText = text

    if (attached) {
      const fileIntro = `عندي خطة محتوى من ملف Excel اسمه "${attached.name}" (${attached.rowCount} صف).\n\n${attached.fullText}`
      messageText = text
        ? `${fileIntro}\n\nملاحظة المستخدم: ${text}`
        : `${fileIntro}\n\nابدأ سير عمل استيراد هذه الخطة: اسأل عن العميل والفريق ثم أكد قبل الإنشاء.`
      displayText = text || `📊 تم رفع "${attached.name}" (${attached.rowCount} صف)`
    }

    setChat(prev => [...prev, { role: 'user', text: displayText, isFile: !!attached && !text }])
    setInput('')
    setAttached(null)
    setLoading(true)

    try {
      const newHistory: HistoryMessage[] = [...history, { role: 'user', text: messageText }]
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'خطأ غير معروف')

      setHistory(data.messages ?? [...newHistory, { role: 'model', text: data.reply }])
      setChat(prev => [...prev, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setChat(prev => [...prev, {
        role: 'assistant',
        text: `❌ ${err instanceof Error ? err.message : 'حدث خطأ غير متوقع'}`,
      }])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const QUICK = [
    { icon: '📊', label: 'تقرير شامل', text: 'اعمل تقرير تقدم شامل لكل العملاء الآن' },
    { icon: '⚠️', label: 'التأخيرات', text: 'فيه تأخيرات؟ ادي تفاصيل كاملة مع المسؤولين' },
    { icon: '💰', label: 'الماليات', text: 'ادي ملخص مالي: الإيرادات، المتأخر، والمستحق' },
    { icon: '👥', label: 'الفريق', text: 'عرض حمل كل عضو في الفريق وتاسكاته الحالية' },
  ]

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-violet-700 to-violet-900 px-3.5 py-2.5 text-white shadow-2xl shadow-violet-950/60 hover:from-violet-600 hover:to-violet-800 transition-all duration-200 border border-violet-600/30"
      >
        <RobotAvatar size={26} active={loading} />
        {!open && <span className="text-sm font-semibold hidden sm:block leading-none">المساعد الذكي</span>}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div
          className="fixed bottom-[5rem] left-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-black/70 border border-slate-700/50"
          style={{ width: 400, maxWidth: 'calc(100vw - 1.5rem)', height: 580, maxHeight: 'calc(100vh - 7rem)' }}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-violet-950 to-slate-900 border-b border-violet-900/40 flex-shrink-0">
            <div className="flex items-center gap-3">
              <RobotAvatar size={36} active={loading} />
              <div>
                <p className="font-bold text-sm text-white leading-tight tracking-wide">المساعد الذكي</p>
                <p className="text-[11px] mt-0.5 flex items-center gap-1.5">
                  {loading ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
                      <span className="text-violet-300">يعمل على طلبك...</span>
                    </>
                  ) : (
                    <span className="text-slate-400">يقرأ • يخطط • ينفذ • يتابع</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setChat([{ role: 'assistant', text: 'محادثة جديدة. أنا جاهز.' }]); setHistory([]); setAttached(null) }}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                جديد
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-base"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-slate-950">
            {chat.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'assistant' && <RobotAvatar size={28} />}
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5">
                    أ
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-tr-sm text-sm'
                      : 'bg-slate-800/80 text-slate-100 rounded-tl-sm border border-slate-700/50'
                  } ${msg.isFile ? 'italic text-violet-200' : ''}`}
                >
                  {msg.role === 'assistant' ? (
                    <MessageText text={msg.text} />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5 flex-row">
                <RobotAvatar size={28} active />
                <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce inline-block"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">يفكر ويشتغل...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts (only at start) */}
          {chat.length <= 1 && (
            <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-800 flex flex-wrap gap-1.5 flex-shrink-0">
              {QUICK.map(q => (
                <button
                  key={q.text}
                  onClick={() => { setInput(q.text); textareaRef.current?.focus() }}
                  className="text-xs text-slate-400 hover:text-violet-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-700 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  {q.icon} {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Attached file chip */}
          {attached && (
            <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2 bg-violet-950/60 border border-violet-800/50 rounded-xl px-3 py-2">
                <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{attached.name}</p>
                  <p className="text-[10px] text-slate-400">{attached.rowCount} صف • {attached.headers.length} عمود</p>
                </div>
                <button
                  onClick={() => setAttached(null)}
                  className="text-slate-500 hover:text-red-400 transition-colors text-base w-5 h-5 flex items-center justify-center flex-shrink-0"
                >
                  ×
                </button>
              </div>
              {/* Column preview */}
              <p className="text-[10px] text-slate-500 mt-1.5 px-1 truncate">
                الأعمدة: {attached.headers.join(' • ')}
              </p>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="px-3 py-2 bg-red-950/40 border-t border-red-900/30 flex-shrink-0">
              <p className="text-xs text-red-400">⚠️ {parseError}</p>
            </div>
          )}

          {/* Input area */}
          <div className="px-3 py-3 bg-slate-900 border-t border-slate-800 flex gap-2 items-end flex-shrink-0">
            {/* File upload button */}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileChange}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="رفع ملف Excel"
              className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors border ${
                attached
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-violet-400 hover:border-violet-700 hover:bg-slate-750'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={attached ? 'أضف ملاحظة أو اضغط إرسال...' : 'اكتب أمرك أو ارفع ملف Excel...'}
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-40 leading-relaxed border border-slate-700 focus:border-violet-700 transition-colors"
              style={{ maxHeight: 100 }}
            />

            <button
              onClick={send}
              disabled={loading || (!input.trim() && !attached)}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Drag hint */}
          <div className="py-1.5 bg-slate-900 border-t border-slate-800/50 flex-shrink-0">
            <p className="text-center text-[10px] text-slate-600">
              اسحب ملف Excel هنا مباشرةً • Enter للإرسال • Shift+Enter لسطر جديد
            </p>
          </div>
        </div>
      )}
    </>
  )
}
