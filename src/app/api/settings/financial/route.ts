export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { dbError } from '@/lib/utils'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { err: null }
}

export async function GET() {
  const { err } = await requireAdmin()
  if (err) return err

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('financial_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const { err } = await requireAdmin()
  if (err) return err

  const body = await req.json().catch(() => ({}))

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('financial_settings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}
