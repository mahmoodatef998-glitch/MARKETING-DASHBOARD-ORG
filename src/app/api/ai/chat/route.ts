export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { chatWithAssistant } from '@/lib/gemini'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // 20 requests per minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = rateLimit(ip, { limit: 20, window: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, {
      status: 429,
      headers: { 'Retry-After': '60' },
    })
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : null
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const [{ data: clients }, { data: tasks }, { data: invoices }] = await Promise.all([
    supabase.from('clients').select('id, name, email, status, country').limit(50),
    supabase.from('tasks').select('id, title, status, priority, due_date').limit(50),
    supabase.from('invoices').select('id, invoice_number, total, status, due_date').limit(50),
  ])

  const reply = await chatWithAssistant({
    message,
    history: Array.isArray(body?.history) ? body.history.slice(-20) : [],
    context: {
      clients:  (clients  ?? []) as Record<string, unknown>[],
      tasks:    (tasks    ?? []) as Record<string, unknown>[],
      invoices: (invoices ?? []) as Record<string, unknown>[],
    },
  })

  return NextResponse.json({ reply })
}
