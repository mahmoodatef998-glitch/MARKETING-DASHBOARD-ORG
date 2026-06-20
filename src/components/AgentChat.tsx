'use client'
import { useState, useRef, useEffect } from 'react'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export default function AgentChat() {
  const [open, setOpen]         = useState(false)
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [chat, setChat]         = useState<ChatMessage[]>([
    { role: 'assistant', text: 'أهلاً! أنا مساعدك الذكي. أقدر أساعدك في:\n• إنشاء تاسكات وتوزيعها على الفريق\n• متابعة التأخيرات والمشاكل\n• استيراد خطط محتوى كاملة\n• تقارير عن العملاء والماليات\n\nبس قولي إيه اللي محتاج!' },
  ])
  const [history, setHistory]   = useState<MessageParam[]>([])
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', text }
    setChat(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const newHistory: MessageParam[] = [...history, { role: 'user', content: text }]
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'خطأ غير معروف')

      setHistory(data.messages ?? newHistory)
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
    'فيه تأخيرات؟',
    'كام عميل عندي؟',
    'إيه الفواتير المتأخرة؟',
    'ملخص مالي',
  ]

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-white shadow-lg hover:bg-violet-700 transition-all"
        title="المساعد الذكي"
      >
        <span className="text-lg">🤖</span>
        {!open && <span className="text-sm font-medium hidden sm:block">المساعد الذكي</span>}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-20 left-6 z-50 flex flex-col w-[360px] max-w-[calc(100vw-3rem)] h-[520px] rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-700 text-white">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <p className="font-semibold text-sm leading-none">المساعد الذكي</p>
                <p className="text-xs text-violet-200 mt-0.5">يقرأ ويعمل ويتابع</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setChat([{ role: 'assistant', text: 'تم مسح المحادثة. إيه اللي محتاج؟' }]); setHistory([]) }}
                className="text-violet-200 hover:text-white text-xs px-2 py-1 rounded hover:bg-violet-600 transition-colors"
                title="محادثة جديدة"
              >
                مسح
              </button>
              <button onClick={() => setOpen(false)} className="text-violet-200 hover:text-white">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chat.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
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
              <div className="flex justify-start">
                <div className="bg-neutral-800 text-neutral-400 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {chat.length <= 1 && (
            <div className="px-3 pb-1 flex flex-wrap gap-1">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => { setInput(p); textareaRef.current?.focus() }}
                  className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1 rounded-full transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-neutral-800 flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="اكتب سؤالك أو طلبك..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-neutral-800 text-neutral-100 placeholder-neutral-500 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
              style={{ maxHeight: 80 }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="self-end bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl p-2 transition-colors"
            >
              <svg className="w-4 h-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
