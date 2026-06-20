'use client'
import { useState, useRef, useEffect } from 'react'
import type { HistoryMessage } from '@/app/api/ai/agent/route'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

function RobotAvatar({ size = 36, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {pulse && (
        <span className="absolute inset-0 rounded-full bg-violet-500 opacity-30 animate-ping" />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Background */}
        <circle cx="20" cy="20" r="20" fill="#1e1b4b" />
        {/* Antenna */}
        <rect x="18.5" y="2" width="3" height="6" rx="1.5" fill="#7c3aed" />
        <circle cx="20" cy="2" r="2.5" fill="#c4b5fd" />
        {/* Head */}
        <rect x="7" y="9" width="26" height="19" rx="4.5" fill="#0f0a2e" />
        <rect x="7" y="9" width="26" height="19" rx="4.5" stroke="#7c3aed" strokeWidth="1.5" />
        {/* Left eye */}
        <rect x="11" y="14" width="7" height="6" rx="2" fill="#4c1d95" />
        <rect x="12" y="15" width="5" height="4" rx="1.5" fill="#8b5cf6" />
        <rect x="13.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        {/* Right eye */}
        <rect x="22" y="14" width="7" height="6" rx="2" fill="#4c1d95" />
        <rect x="23" y="15" width="5" height="4" rx="1.5" fill="#8b5cf6" />
        <rect x="24.5" y="15.5" width="2" height="3" rx="0.5" fill="#ede9fe" />
        {/* Mouth */}
        <rect x="13" y="23" width="14" height="2.5" rx="1.25" fill="#2e1065" />
        <rect x="14" y="23.2" width="2.5" height="2" rx="0.5" fill="#7c3aed" />
        <rect x="18.75" y="23.2" width="2.5" height="2" rx="0.5" fill="#a78bfa" />
        <rect x="23.5" y="23.2" width="2.5" height="2" rx="0.5" fill="#7c3aed" />
        {/* Neck */}
        <rect x="17.5" y="28" width="5" height="4" rx="1.5" fill="#1e1b4b" />
        {/* Shoulders */}
        <rect x="10" y="32" width="20" height="7" rx="3" fill="#0f0a2e" />
        <rect x="10" y="32" width="20" height="7" rx="3" stroke="#7c3aed" strokeWidth="1" />
        {/* Chest lights */}
        <circle cx="17" cy="35.5" r="1.5" fill="#6d28d9" />
        <circle cx="20" cy="35.5" r="1.5" fill="#a78bfa" />
        <circle cx="23" cy="35.5" r="1.5" fill="#6d28d9" />
      </svg>
    </div>
  )
}

export default function AgentChat() {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [chat, setChat]       = useState<ChatMessage[]>([
    { role: 'assistant', text: 'أهلاً! أنا مساعدك الذكي 🤖\n\nأقدر أعمل:\n• ✅ إنشاء تاسكات وتوزيعها على الفريق\n• 📋 استيراد خطط محتوى كاملة\n• 📊 تقارير تقدم يومية لأي عميل\n• ⚠️ متابعة التأخيرات والمشاكل\n• 💰 ملخص مالي فوري\n\nادفعلي أي خطة أو اسألني عن أي حاجة!' },
  ])
  const [history, setHistory] = useState<HistoryMessage[]>([])
  const bottomRef             = useRef<HTMLDivElement>(null)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    setChat(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const newHistory: HistoryMessage[] = [...history, { role: 'user', text }]
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
      setChat(prev => [...prev, { role: 'assistant', text: `❌ ${err instanceof Error ? err.message : 'حدث خطأ'}` }])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const QUICK_PROMPTS = [
    { label: '⚠️ التأخيرات', text: 'فيه تأخيرات؟ ادي تفاصيل' },
    { label: '📊 تقرير اليوم', text: 'اعمل تقرير تقدم شامل لكل العملاء' },
    { label: '💰 ملخص مالي', text: 'ادي ملخص مالي كامل' },
    { label: '📋 خطة محتوى', text: 'عاوز استورد خطة محتوى جديدة' },
    { label: '👥 الفريق', text: 'ادي نظرة عامة على الفريق وتاسكاتهم' },
    { label: '🔍 نظرة عامة', text: 'إيه الوضع العام للسيستم دلوقتي؟' },
  ]

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 rounded-full bg-violet-700 px-3.5 py-2.5 text-white shadow-xl hover:bg-violet-600 transition-all duration-200 hover:shadow-violet-900/40"
        title="المساعد الذكي"
      >
        <RobotAvatar size={28} pulse={loading} />
        {!open && <span className="text-sm font-semibold hidden sm:block pr-1">المساعد الذكي</span>}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-[4.5rem] left-6 z-50 flex flex-col w-[380px] max-w-[calc(100vw-3rem)] h-[560px] rounded-2xl border border-violet-900/60 bg-neutral-950 shadow-2xl shadow-black/60 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900 to-violet-800 text-white">
            <div className="flex items-center gap-3">
              <RobotAvatar size={38} pulse={loading} />
              <div>
                <p className="font-bold text-sm leading-tight">المساعد الذكي</p>
                <p className="text-[11px] text-violet-300 mt-0.5">
                  {loading ? (
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      يشتغل...
                    </span>
                  ) : 'يقرأ • يعمل • يتابع'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setChat([{ role: 'assistant', text: 'محادثة جديدة. إيه اللي محتاج؟' }])
                  setHistory([])
                }}
                className="text-violet-300 hover:text-white text-xs px-2.5 py-1 rounded-lg hover:bg-violet-700 transition-colors"
              >
                محادثة جديدة
              </button>
              <button onClick={() => setOpen(false)} className="text-violet-300 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-700 transition-colors">
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-neutral-950">
            {chat.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 mt-1">
                    <RobotAvatar size={24} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 mt-1"><RobotAvatar size={24} pulse /></div>
                <div className="bg-neutral-800 text-violet-400 rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-2">
                  <span className="inline-flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-xs text-neutral-500">بيشتغل...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {chat.length <= 1 && (
            <div className="px-3 py-2 border-t border-neutral-800 flex flex-wrap gap-1.5 bg-neutral-900/50">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.text}
                  onClick={() => { setInput(p.text); textareaRef.current?.focus() }}
                  className="text-xs bg-neutral-800 hover:bg-violet-900/60 hover:text-violet-300 text-neutral-400 px-2.5 py-1.5 rounded-lg transition-colors border border-neutral-700 hover:border-violet-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-neutral-800 flex gap-2 bg-neutral-900">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="اكتب سؤالك أو الفعك الخطة هنا..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-neutral-800 text-neutral-100 placeholder-neutral-500 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 leading-relaxed"
              style={{ maxHeight: 100 }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="self-end bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white rounded-xl p-2.5 transition-colors"
            >
              <svg className="w-4 h-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
