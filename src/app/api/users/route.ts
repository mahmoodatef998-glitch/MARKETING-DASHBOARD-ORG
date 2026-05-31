export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'
import { generateAndSendInvoice, toDateStr, type CycleType } from '@/lib/invoice-automation'

// GET all team/client users
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('*, client:clients(id,name,email)')
    .neq('role', 'admin')
    .order('created_at', { ascending: false })

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  // Merge auth emails into each profile (email lives in auth.users, not profiles)
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  for (const u of authUsers) emailMap[u.id] = u.email ?? ''

  const enriched = (profiles ?? []).map(p => ({
    ...p,
    email: emailMap[p.id] ?? p.client?.email ?? '',
  }))

  return NextResponse.json(enriched)
}

// POST create new user (team member or client)
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const {
    email, password, role, display_name, phone, country, notes,
    // billing (clients only)
    billing_cycle, billing_amount, billing_currency, billing_custom_days,
  } = await req.json()
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

    // Create billing plan if billing settings provided
    if (billing_cycle && billing_amount && billing_cycle !== 'manual') {
      const cycle = billing_cycle as CycleType
      const amount = Number(billing_amount)
      const currency = billing_currency ?? 'USD'
      const customDays = billing_custom_days ? Number(billing_custom_days) : undefined
      const today = new Date()

      const billingPlanRecord = {
        id:                  generateId(),
        client_id:           resolvedClientId,
        cycle_type:          cycle,
        amount,
        currency,
        custom_days:         customDays ?? null,
        next_invoice_date:   toDateStr(today),   // first invoice today
        is_active:           true,
        created_at:          today.toISOString(),
        updated_at:          today.toISOString(),
      }

      const { data: billingPlan, error: billingErr } = await admin
        .from('billing_plans')
        .insert(billingPlanRecord)
        .select('id')
        .single()

      if (!billingErr && billingPlan) {
        // Fire first invoice immediately (non-blocking — don't fail user creation if email fails)
        generateAndSendInvoice({
          supabase:      admin,
          clientId:      resolvedClientId!,
          clientEmail:   email,
          clientName:    display_name,
          amount,
          currency,
          billingPlanId: billingPlan.id,
          cycleType:     cycle,
          customDays,
        }).catch(err => console.error('[billing] first invoice failed:', err.message))
      }
    }
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
