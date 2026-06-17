export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { err: null, user }
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { err } = await requireAdmin(supabase)
  if (err) return err

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  let query = supabase.from('expenses').select('*').order('date', { ascending: false })
  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { err } = await requireAdmin(supabase)
  if (err) return err

  const body = await req.json().catch(() => ({}))
  const { title, amount, category, date, notes, recurring } = body

  if (!title || !amount || !date) {
    return NextResponse.json({ error: 'title, amount, date are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      title,
      amount:    Number(amount),
      category:  category || null,
      date,
      notes:     notes || null,
      recurring: recurring ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
