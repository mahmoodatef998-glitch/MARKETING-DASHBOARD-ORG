export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clientId = new URL(req.url).searchParams.get('clientId')

  let query = supabase
    .from('billing_plans')
    .select('*, client:clients(id, name, email)')
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { client_id, cycle_type, amount, currency = 'AED', custom_days, next_invoice_date } = body

  if (!client_id || !cycle_type || !amount || !next_invoice_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const plan = {
    id: generateId(),
    client_id,
    cycle_type,
    amount: Number(amount),
    currency,
    custom_days: cycle_type === 'custom_days' ? Number(custom_days) : null,
    next_invoice_date,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('billing_plans').insert(plan)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(plan, { status: 201 })
}
