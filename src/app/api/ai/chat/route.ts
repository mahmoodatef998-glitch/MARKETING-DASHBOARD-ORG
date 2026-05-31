export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { chatWithAssistant } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const { message, history } = raw
  if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const [{ data: clients }, { data: tasks }, { data: invoices }] = await Promise.all([
    supabase.from('clients').select('id, name, email, status, country').limit(50),
    supabase.from('tasks').select('id, title, status, priority, due_date').limit(50),
    supabase.from('invoices').select('id, invoice_number, total, status, due_date').limit(50),
  ])

  const reply = await chatWithAssistant({
    message,
    history: history ?? [],
    context: {
      clients: (clients ?? []) as Record<string, unknown>[],
      tasks: (tasks ?? []) as Record<string, unknown>[],
      invoices: (invoices ?? []) as Record<string, unknown>[],
    },
  })

  return NextResponse.json({ reply })
}
