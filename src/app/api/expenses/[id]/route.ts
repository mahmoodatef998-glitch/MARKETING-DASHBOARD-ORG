export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authErr = await requireAdmin()
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const { title, amount, category, date, notes, recurring } = body

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('expenses')
    .update({
      title,
      amount:    Number(amount),
      category:  category || null,
      date,
      notes:     notes || null,
      recurring: recurring ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authErr = await requireAdmin()
  if (authErr) return authErr

  const admin = createAdminClient()
  const { error } = await admin.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
