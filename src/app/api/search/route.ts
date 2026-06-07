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

  const { data: profile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()
  const isClient = profile?.role === 'client'
  if (isClient && !profile.client_id) return NextResponse.json({ tasks: [], clients: [], invoices: [] })

  const pattern = `%${q}%`

  let tasksQuery    = supabase.from('tasks').select('id, title, status, priority, due_date, client:clients(name)').ilike('title', pattern).is('deleted_at', null).limit(6)
  let clientsQuery  = supabase.from('clients').select('id, name, email, status').or(`name.ilike.${pattern},email.ilike.${pattern}`).is('deleted_at', null).limit(6)
  let invoicesQuery = supabase.from('invoices').select('id, invoice_number, total, status, client:clients(name)').or(`invoice_number.ilike.${pattern},notes.ilike.${pattern}`).is('deleted_at', null).limit(6)

  if (isClient) {
    tasksQuery    = tasksQuery.eq('client_id', profile.client_id!)
    clientsQuery  = clientsQuery.eq('id', profile.client_id!)
    invoicesQuery = invoicesQuery.eq('client_id', profile.client_id!)
  }

  const [tasksRes, clientsRes, invoicesRes] = await Promise.all([tasksQuery, clientsQuery, invoicesQuery])

  return NextResponse.json({
    tasks:    tasksRes.data    ?? [],
    clients:  clientsRes.data  ?? [],
    invoices: invoicesRes.data ?? [],
  })
}
