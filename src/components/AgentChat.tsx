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
  fullText: string
}

// ── Robot SVG Avatar ──────────────────────────────────────────────────────────
function RobotAvatar({ size = 32, active = false }: { size?: number; active?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {active && (
        <span className="absolute inset-0 rounded-full bg-violet-500 opacity-25 animate-ping" />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="20" fill="#1e1b4b" />
        <rect x="18.5" y="2" width="3" height="6" rx="1.5" fill="#7c3aed" />
        <circle cx="20" cy="2" r="2.5" fill={active ? '#c4b5fd' : '#8b5cf6'} />
        <rect x="7" y="9" width="26" height="19" rx="4.5" fill="#0f0a2e" />
        <rect x="7" y="9" width="26" height="19" rx="4.5" stroke="#6d28d9" strokeWidth="1.5" />
        <rect x="11" y="14" width="7" height="6" rx="2" fill="#3b0764" />
        <rect x="12" y="15" width="5" height="4" rx="1.5" fill={active ? '#a78bfa' : '#7c3aed'} />
        <rect x="13.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        <rect x="22" y="14" width="7" height="6" rx="2" fill="#3b0764" />
        <rect x="23" y="15" width="5" height="4" rx="1.5" fill={active ? '#a78bfa' : '#7c3aed'} />
        <rect x="24.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        <rect x="13" y="23" width="14" height="2.5" rx="1.25" fill="#2e1065" />
        <rect x="14.5" y="23.2" width="2" height="2" rx="0.5" fill="#6d28d9" />
        <rect x="19" y="23.2" width="2" height="2" rx="0.5" fill="#8b5cf6" />
        <rect x="23.5" y="23.2" width="2" height="2" rx="0.5" fill="#6d28d9" />
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

// ── RTL-aware message renderer ────────────────────────────────────────────────
function MessageText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm leading-7" dir="rtl">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-0.5" />

        // Section divider ══════
        if (/^═+/.test(line)) {
          const title = line.replace(/═+/g, '').trim()
          if (!title) return <hr key={i} className="border-violet-800/50 my-1" />
          return (
            <p key={i} className="text-[11px] font-bold text-violet-400 tracking-widest uppercase pt-1">
              {title}
            </p>
          )
        }

        // Bold **text**
        const renderInline = (raw: string) =>
          raw.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} className="font-semibold text-violet-300">{part.slice(2, -2)}</strong>
              : <span key={j}>{part}</span>
          )

        // Numbered line: ١. or 1.
        if (/^[١٢٣٤٥٦٧٨٩\d]+[.)]\s/.test(line)) {
          return (
            <div key={i} className="flex items-baseline gap-2 pr-1">
              <span className="text-violet-400 font-bold flex-shrink-0 text-xs">{line.match(/^[١٢٣٤٥٦٧٨٩\d]+[.)]/)?.[0]}</span>
              <span>{renderInline(line.replace(/^[١٢٣٤٥٦٧٨٩\d]+[.)\s]+/, ''))}</span>
            </div>
          )
        }

        // Bullet line
        if (/^[•·\-–✅⚠️❌📊💰👥📋]\s?/.test(line)) {
          const match = line.match(/^([•·\-–✅⚠️❌📊💰👥📋])\s?(.*)/)
          const icon = match?.[1] ?? '•'
          const content = match?.[2] ?? line
          return (
            <div key={i} className="flex items-baseline gap-2 pr-1">
              <span className="flex-shrink-0 text-violet-400 leading-6">{icon}</span>
              <span className="flex-1">{renderInline(content)}</span>
            </div>
          )
        }

        return <p key={i} className="leading-7">{renderInline(line)}</p>
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
  const allRows = rows.map(r => headers.map(h => String(r[h] ?? '')).join(' | ')).join('\n')
  const fullText =
    `الأعمدة: ${headers.join(' | ')}\n` +
    `إجمالي الصفوف: ${rows.length}\n\n` +
    `البيانات:\n${allRows}`

  return { name: file.name, rowCount: rows.length, headers, fullText }
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
      text: 'أهلاً! أنا مديرك التنفيذي الذكي — 37 صلاحية تنفيذية كاملة.\n\n**ارفع خطة الميديا باير وأنا أتعامل مع كل حاجة:**\n• 🎯 إنشاء الكمبانيات + خطط المحتوى + التاسكات دفعة واحدة\n• 👥 توزيع الفريق بناءً على الأعباء الفعلية\n• 📦 متابعة استهلاك باقات العملاء + تنبيه التجديد\n• 💰 إنشاء فواتير + تذكيرات دفع ذكية للعملاء\n• ⚠️ مراقبة التأخيرات + إيميلات مخصصة للفريق\n• 📊 تقارير يومية + تقارير للعملاء على إيميلهم\n• 🧠 ذاكرة دائمة بين الجلسات\n\n**أنت تركز على السيلز — أنا أدير الباقي.**\nارفع ملف Excel أو اكتب أمرك.',
    },
  ])
  const [history, setHistory] = useState<HistoryMessage[]>([])
  const bottomRef             = useRef<HTMLDivElement>(null)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)
  const fileRef               = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, open])

  const handleFile = useCallback(async (file: File) => {
    setParseError('')
    try {
      setAttached(await parseExcel(file))
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
    if ((!text && !attached) || loading) return

    let messageText = text
    let displayText = text

    if (attached) {
      const intro = `عندي خطة محتوى من ملف Excel اسمه "${attached.name}" (${attached.rowCount} صف).\n\n${attached.fullText}`
      messageText = text ? `${intro}\n\nملاحظة: ${text}` : `${intro}\n\nابدأ سير عمل استيراد هذه الخطة.`
      displayText = text || `📊 ${attached.name} — ${attached.rowCount} صف`
    }

    setChat(prev => [...prev, { role: 'user', text: displayText, isFile: !!attached && !text }])
    setInput('')
    setAttached(null)
    setLoading(true)

    try {
      const newHistory: HistoryMessage[] = [...history, { role: 'user', text: messageText }]
      const res  = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'خطأ غير معروف')
      setHistory(data.messages ?? [...newHistory, { role: 'model', text: data.reply }])
      setChat(prev => [...prev, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setChat(prev => [...prev, { role: 'assistant', text: `❌ ${err instanceof Error ? err.message : 'خطأ غير متوقع'}` }])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const QUICK = [
    { icon: '📦', label: 'استهلاك الباقات', text: 'عرض استهلاك باقات كل العملاء — مين على وشك الخلاص' },
    { icon: '💰', label: 'الفوترة',         text: 'فحص الفواتير المستحقة + الفواتير المتأخرة + إنشاء فواتير جديدة' },
    { icon: '⚠️', label: 'التأخيرات',      text: 'حلل تأخيرات الفريق وابعت إيميلات ذكية مخصصة لكل شخص' },
    { icon: '📊', label: 'تقرير الصباح',   text: 'تقرير صباحي شامل: إنجاز، تأخيرات، فواتير، باقات، مخاطر' },
  ]

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        dir="rtl"
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-violet-700 to-violet-900 px-3.5 py-2.5 text-white shadow-2xl shadow-violet-950/60 hover:from-violet-600 hover:to-violet-800 transition-all duration-200 border border-violet-600/30"
      >
        <RobotAvatar size={26} active={loading} />
        {!open && <span className="text-sm font-semibold hidden sm:block">المساعد الذكي</span>}
      </button>

      {/* ── Chat window ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          dir="rtl"
          className="fixed bottom-[5rem] left-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-black/70 border border-slate-700/40"
          style={{ width: 420, maxWidth: 'calc(100vw - 1.5rem)', height: 600, maxHeight: 'calc(100vh - 7rem)' }}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
        >

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-slate-900 via-violet-950 to-slate-900 border-b border-violet-900/40 flex-shrink-0">
            {/* Right side: avatar + title */}
            <div className="flex items-center gap-3">
              <RobotAvatar size={36} active={loading} />
              <div>
                <p className="font-bold text-sm text-white leading-tight">المساعد الذكي</p>
                <p className="text-[11px] mt-0.5 flex items-center gap-1.5">
                  {loading
                    ? <><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /><span className="text-violet-300">يشتغل على طلبك...</span></>
                    : <span className="text-slate-400">يقرأ • يخطط • ينفذ • يتابع</span>
                  }
                </p>
              </div>
            </div>
            {/* Left side: actions */}
            <div className="flex items-center gap-1" dir="ltr">
              <button
                onClick={() => { setChat([{ role: 'assistant', text: 'محادثة جديدة. أنا جاهز.' }]); setHistory([]); setAttached(null) }}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                جديد
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Messages ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 bg-slate-950">
            {chat.map((msg, i) => (
              /*
               * Layout is in LTR (dir="ltr") so flexbox positions are stable:
               *   user    → flex-row-reverse: avatar far RIGHT, bubble to its LEFT
               *   assistant → flex-row: avatar far LEFT, bubble to its RIGHT
               * Text inside bubbles uses dir="rtl" for correct Arabic flow.
               */
              <div
                key={i}
                dir="ltr"
                className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                {msg.role === 'assistant'
                  ? <RobotAvatar size={28} />
                  : (
                    <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white">
                      أ
                    </div>
                  )
                }

                {/* Bubble */}
                <div
                  dir="rtl"
                  className={[
                    'max-w-[78%] px-3.5 py-2.5 rounded-2xl',
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-tr-sm text-sm leading-relaxed'
                      : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700/50',
                    msg.isFile ? 'italic text-violet-200 text-sm' : '',
                  ].join(' ')}
                >
                  {msg.role === 'assistant'
                    ? <MessageText text={msg.text} />
                    : <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  }
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div dir="ltr" className="flex items-end gap-2.5 flex-row">
                <RobotAvatar size={28} active />
                <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2.5">
                  {[0, 120, 240].map(d => (
                    <span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce inline-block"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                  <span className="text-xs text-slate-500 mr-1">يفكر ويشتغل...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Quick prompts ──────────────────────────────────────────────── */}
          {chat.length <= 1 && (
            <div className="px-3 py-2.5 bg-slate-900/70 border-t border-slate-800 grid grid-cols-2 gap-1.5 flex-shrink-0">
              {QUICK.map(q => (
                <button
                  key={q.text}
                  onClick={() => { setInput(q.text); textareaRef.current?.focus() }}
                  className="text-xs text-slate-400 hover:text-violet-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-violet-700/60 px-3 py-2 rounded-xl transition-all text-right leading-snug"
                >
                  <span className="ml-1">{q.icon}</span>{q.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Attached file chip ─────────────────────────────────────────── */}
          {attached && (
            <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2.5 bg-violet-950/50 border border-violet-800/40 rounded-xl px-3 py-2">
                <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{attached.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{attached.rowCount} صف • {attached.headers.length} عمود: {attached.headers.slice(0, 4).join('، ')}{attached.headers.length > 4 ? '...' : ''}</p>
                </div>
                <button
                  onClick={() => setAttached(null)}
                  className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* ── Parse error ────────────────────────────────────────────────── */}
          {parseError && (
            <div className="px-3 py-1.5 bg-red-950/40 border-t border-red-900/30 flex-shrink-0">
              <p className="text-xs text-red-400">⚠️ {parseError}</p>
            </div>
          )}

          {/* ── Input area ─────────────────────────────────────────────────── */}
          <div className="px-3 py-3 bg-slate-900 border-t border-slate-800 flex gap-2 items-end flex-shrink-0" dir="ltr">
            {/* File upload */}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              title="رفع ملف Excel"
              className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors border ${
                attached
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-violet-400 hover:border-violet-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* Text input — RTL */}
            <textarea
              ref={textareaRef}
              dir="rtl"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={attached ? 'أضف ملاحظة أو اضغط إرسال...' : 'اكتب أمرك أو ارفع ملف Excel...'}
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-40 leading-relaxed border border-slate-700 focus:border-violet-600 transition-colors"
              style={{ maxHeight: 100 }}
            />

            {/* Send */}
            <button
              onClick={send}
              disabled={loading || (!input.trim() && !attached)}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>

          {/* ── Hint bar ───────────────────────────────────────────────────── */}
          <div className="py-1.5 px-3 bg-slate-900 border-t border-slate-800/60 flex-shrink-0 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">Enter = إرسال • Shift+Enter = سطر جديد</p>
            <p className="text-[10px] text-slate-600">اسحب Excel هنا</p>
          </div>
        </div>
      )}
    </>
  )
}
