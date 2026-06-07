export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member_id')

  let query = admin
    .from('team_payouts')
    .select('*')
    .order('paid_at', { ascending: false })

  if (profile?.role !== 'admin') {
    query = query.eq('member_id', user.id)
  } else if (memberId) {
    query = query.eq('member_id', memberId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.member_id || !body?.amount) {
    return NextResponse.json({ error: 'member_id and amount are required' }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('team_payouts')
    .insert({
      member_id:   body.member_id,
      amount,
      currency:    body.currency ?? 'AED',
      description: body.description?.trim() || null,
      proof_url:   body.proof_url || null,
      paid_at:     body.paid_at ?? new Date().toISOString(),
      created_by:  caller.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
