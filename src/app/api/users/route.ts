export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'

// GET all team/client users
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('*, client:clients(id,name,email), team_member:team_members(id,name)')
    .neq('role', 'admin')
    .order('created_at', { ascending: false })

  return NextResponse.json(profiles ?? [])
}

// POST create new user (team member or client)
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, password, role, display_name, phone, country, notes } = await req.json()
  const admin = createAdminClient()

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, display_name },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const userId = authData.user.id
  let resolvedClientId: string | null = null

  // If client role → auto-create a clients record
  if (role === 'client') {
    const clientRecord = {
      id: generateId(),
      name: display_name,
      email,
      phone: phone ?? null,
      country: country ?? null,
      notes: notes ?? null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data: newClient, error: clientErr } = await admin
      .from('clients')
      .insert(clientRecord)
      .select('id')
      .single()

    if (clientErr) {
      // Rollback auth user
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Failed to create client record: ' + clientErr.message }, { status: 500 })
    }
    resolvedClientId = newClient.id
  }

  // Upsert profile
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: userId, role, display_name, client_id: resolvedClientId },
      { onConflict: 'id' }
    )

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: userId, email, role, display_name, client_id: resolvedClientId,
  }, { status: 201 })
}
