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
  return { ok: true as const }
}

// PUT /api/users/[id] — update display_name, email, role, and client fields
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const { display_name, email, role, phone, country, notes } = await req.json()

  const now = new Date().toISOString()

  // ── 1. Update profile row ──────────────────────────────────────────────────
  const profileUpdate: Record<string, string> = { updated_at: now }
  if (display_name !== undefined) profileUpdate.display_name = display_name
  if (role         !== undefined) profileUpdate.role         = role

  const { error: profileErr } = await admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', id)

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  // ── 2. Update auth user (email + metadata) ─────────────────────────────────
  const authUpdate: Record<string, unknown> = {
    user_metadata: { display_name, role },
  }
  if (email?.trim()) authUpdate.email = email.trim()

  const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate)
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // ── 3. If client role, sync linked client record ───────────────────────────
  if (role === 'client') {
    const { data: profile } = await admin
      .from('profiles')
      .select('client_id')
      .eq('id', id)
      .single()

    if (profile?.client_id) {
      const clientUpdate: Record<string, string | null> = { updated_at: now }
      if (display_name !== undefined) clientUpdate.name    = display_name
      if (email?.trim())              clientUpdate.email   = email.trim()
      if (phone   !== undefined)      clientUpdate.phone   = phone   || null
      if (country !== undefined)      clientUpdate.country = country || null
      if (notes   !== undefined)      clientUpdate.notes   = notes   || null

      await admin.from('clients').update(clientUpdate).eq('id', profile.client_id)
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/users/[id] — delete auth user + profile (+ client record if applicable)
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, client_id')
    .eq('id', id)
    .single()

  if (profile?.client_id) {
    await admin.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', profile.client_id)
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
