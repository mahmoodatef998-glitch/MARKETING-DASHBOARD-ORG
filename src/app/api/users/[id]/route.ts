export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

// PUT /api/users/[id] — update display_name, role, and client fields
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const { display_name, role, phone, country, notes } = await req.json()

  // Update profile
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ display_name, role, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  // Update auth user metadata
  await admin.auth.admin.updateUserById(id, {
    user_metadata: { display_name, role },
  })

  // If client role, sync the linked client record too
  if (role === 'client') {
    const { data: profile } = await admin
      .from('profiles')
      .select('client_id')
      .eq('id', id)
      .single()

    if (profile?.client_id) {
      await admin.from('clients').update({
        name: display_name,
        phone: phone || null,
        country: country || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', profile.client_id)
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/users/[id] — delete auth user + profile (+ client record if applicable)
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const admin = createAdminClient()

  // Check if this user has a linked client record
  const { data: profile } = await admin
    .from('profiles')
    .select('role, client_id')
    .eq('id', id)
    .single()

  // Delete linked client record if exists
  if (profile?.client_id) {
    await admin.from('clients').delete().eq('id', profile.client_id)
  }

  // Delete auth user (cascades to profile via DB trigger)
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
