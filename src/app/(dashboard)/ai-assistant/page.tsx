'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Bot, User, Send, Loader2, Sparkles } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED = [
  'Which clients have overdue invoices?',
  'Show me all urgent tasks',
  'What is the total pending revenue?',
  'Who are the most recently added clients?',
  'Which team member has the most tasks?',
]

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Build history in Gemini format
    const history = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.content,
    }))

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply ?? 'Sorry, I could not process your request.',
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Error: Failed to connect to AI service.' },
      ])
    }
    setLoading(false)
  }

  function renderContent(content: string) {
    // Basic markdown: bold, code blocks, lists
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-700 px-1 rounded text-indigo-300 text-xs">$1</code>')
      .split('\n')
      .map((line) => line.replace(/^- /, '• '))
      .join('<br/>')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-indigo-600/20">
          <Sparkles className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-100">Gemini AI Assistant</h2>
          <p className="text-xs text-slate-400">Context-aware: knows your clients, tasks & invoices</p>
        </div>
      </div>

      {/* Chat area */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
              <div className="text-center">
                <Bot className="h-12 w-12 text-indigo-400/50 mx-auto mb-3" />
                <h3 className="text-slate-300 font-medium">Ask me anything about your agency</h3>
                <p className="text-slate-500 text-sm mt-1">I have access to your live clients, tasks, and invoices</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm
                ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-indigo-400" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                  }`}
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                <Bot className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>

        {/* Input */}
        <div className="p-4 border-t border-slate-800">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage() }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about clients, tasks, invoices…"
              disabled={loading}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
