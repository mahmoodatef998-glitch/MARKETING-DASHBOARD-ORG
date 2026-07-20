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
  const [{ data, error }, { data: profiles }, { data: { users: authUsers } }] = await Promise.all([
    admin.from('financial_settings').select('*').eq('id', 1).single(),
    admin.from('profiles').select('id, role, display_name').order('display_name'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  const emailMap: Record<string, string> = {}
  for (const u of authUsers ?? []) emailMap[u.id] = u.email ?? ''

  const users = (profiles ?? []).map(p => ({
    id: p.id,
    display_name: p.display_name ?? emailMap[p.id] ?? 'Unknown',
    email: emailMap[p.id] ?? '',
    role: p.role,
  }))

  return NextResponse.json({ ...data, users })
}

export async function PUT(req: NextRequest) {
  const { err } = await requireAdmin()
  if (err) return err

  const body = await req.json().catch(() => ({}))
  const allowed = [
    'cost_per_design', 'media_buyer_rate_per_client',
    'partner1_name', 'partner1_share', 'partner1_user_id',
    'partner2_name', 'partner2_share', 'partner2_user_id',
    'partner3_name', 'partner3_share', 'partner3_user_id',
  ] as const

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('financial_settings')
    .update(payload)
    .eq('id', 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}
