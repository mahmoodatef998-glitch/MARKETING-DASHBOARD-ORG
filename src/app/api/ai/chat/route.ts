export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { chatWithAssistant } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { message, history } = await req.json()

  const [{ data: clients }, { data: tasks }, { data: invoices }] = await Promise.all([
    supabase.from('clients').select('id, name, email, status, country').limit(50),
    supabase.from('tasks').select('id, title, status, priority, due_date').limit(50),
    supabase.from('invoices').select('id, invoice_number, total, status, due_date').limit(50),
  ])

  const reply = await chatWithAssistant({
    message,
    history: history ?? [],
    context: {
      clients: (clients ?? []) as any[],
      tasks: (tasks ?? []) as any[],
      invoices: (invoices ?? []) as any[],
    },
  })

  return NextResponse.json({ reply })
}
