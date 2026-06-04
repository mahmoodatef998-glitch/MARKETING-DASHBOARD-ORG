export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 60, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ tasks: [], clients: [], invoices: [] })

  const pattern = `%${q}%`

  const [tasksRes, clientsRes, invoicesRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, client:clients(name)')
      .ilike('title', pattern)
      .limit(6),
    supabase
      .from('clients')
      .select('id, name, email, status')
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(6),
    supabase
      .from('invoices')
      .select('id, invoice_number, total, status, client:clients(name)')
      .or(`invoice_number.ilike.${pattern},notes.ilike.${pattern}`)
      .limit(6),
  ])

  return NextResponse.json({
    tasks:    tasksRes.data    ?? [],
    clients:  clientsRes.data  ?? [],
    invoices: invoicesRes.data ?? [],
  })
}
