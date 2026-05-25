export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

// PUT — update a team member's profile (display_name, role)
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  const updates: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.name)  updates.display_name = body.name
  if (body.role)  updates.role         = body.role

  const { data, error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also sync auth user metadata
  if (body.name) {
    await admin.auth.admin.updateUserById(id, {
      user_metadata: { display_name: body.name },
    }).catch(() => {})
  }

  return NextResponse.json(data)
}

// DELETE — permanently removes the auth user (cascades to profile)
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
