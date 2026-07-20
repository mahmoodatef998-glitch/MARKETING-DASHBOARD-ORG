export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'
import { fetchIncomeLedger } from '@/lib/income'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { err: null }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 60, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { err } = await requireAdmin()
  if (err) return err

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const source = searchParams.get('source') // invoice | manual | all

  const admin = createAdminClient()
  let items = await fetchIncomeLedger(admin, from, to)

  if (source === 'invoice') items = items.filter(i => i.source === 'invoice')
  if (source === 'manual')  items = items.filter(i => i.source === 'manual')

  const total = items.reduce((s, i) => s + i.amount, 0)
  const invoiceTotal = items.filter(i => i.source === 'invoice').reduce((s, i) => s + i.amount, 0)
  const manualTotal  = items.filter(i => i.source === 'manual').reduce((s, i) => s + i.amount, 0)

  return NextResponse.json({ items, total, invoiceTotal, manualTotal, count: items.length })
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { err } = await requireAdmin()
  if (err) return err

  const body = await req.json().catch(() => ({}))
  const { title, amount, category, date, notes, client_id } = body

  if (!title || !amount || !date) {
    return NextResponse.json({ error: 'title, amount, date are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('income_entries')
    .insert({
      title,
      amount:    Number(amount),
      category:  category || null,
      date,
      notes:     notes || null,
      client_id: client_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
