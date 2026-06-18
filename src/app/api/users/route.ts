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
    billing_start_date,
    payment_policy_type, payment_advance_pct, payment_final_days,
    // advance payment at signup
    advance_amount, advance_method, advance_date,
    // package (clients only)
    package: packageData,
  } = await req.json()

  const VALID_ROLES = ['video_maker', 'designer', 'ai_video', 'media_buyer', 'client']
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

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

    // Create package if package data provided
    if (packageData && packageData.name) {
      const pkgRecord = {
        id:           generateId(),
        client_id:    resolvedClientId,
        name:         packageData.name,
        price:        Number(packageData.price ?? 0),
        renewal_type: packageData.renewal_type ?? 'monthly',
        start_date:   new Date().toISOString().split('T')[0],
        end_date:     null,
        is_active:    true,
        notes:        packageData.notes || null,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }
      const { data: newPkg, error: pkgErr } = await admin
        .from('client_packages')
        .insert(pkgRecord)
        .select('id')
        .single()

      if (!pkgErr && newPkg && Array.isArray(packageData.items)) {
        const itemRows = (packageData.items as Array<{ task_type: string; label: string; total_quantity: number }>)
          .filter(i => Number(i.total_quantity) > 0)
          .map((i, idx) => ({
            package_id:     newPkg.id,
            label:          i.label,
            task_type:      i.task_type,
            total_quantity: Number(i.total_quantity),
            sort_order:     idx,
          }))
        if (itemRows.length > 0) {
          await admin.from('package_items').insert(itemRows)
        }
      }
    }

    // Create billing plan if billing settings provided
    if (billing_cycle && billing_amount && billing_cycle !== 'manual') {
      const cycle = billing_cycle as CycleType
      const amount = Number(billing_amount)
      const currency = billing_currency ?? 'USD'
      const customDays = billing_custom_days ? Number(billing_custom_days) : undefined
      const today = new Date()

      const billingStartDate = billing_start_date || toDateStr(today)

      const billingPlanRecord = {
        id:                   generateId(),
        client_id:            resolvedClientId,
        cycle_type:           cycle,
        amount,
        currency,
        custom_days:          customDays ?? null,
        next_invoice_date:    billingStartDate,   // use billing_start_date, not today
        payment_policy_type:  payment_policy_type ?? 'single',
        payment_advance_pct:  payment_advance_pct ?? 50,
        payment_final_days:   payment_final_days ?? 30,
        is_active:            true,
        created_at:           today.toISOString(),
        updated_at:           today.toISOString(),
      }

      const { data: billingPlan, error: billingErr } = await admin
        .from('billing_plans')
        .insert(billingPlanRecord)
        .select('id')
        .single()

      if (!billingErr && billingPlan) {
        // Only auto-generate first invoice if billing starts today or in the past
        const startDate = new Date(billingStartDate)
        startDate.setHours(0, 0, 0, 0)
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (startDate <= todayStart) {
          try {
            const newInvoice = await generateAndSendInvoice({
              supabase:      admin,
              clientId:      resolvedClientId!,
              clientEmail:   email,
              clientName:    display_name,
              amount,
              currency,
              billingPlanId: billingPlan.id,
              cycleType:     cycle,
              customDays,
            })
            // If payment policy is split, auto-create installment schedule
            if (payment_policy_type === 'split' && newInvoice?.id) {
              const advPct = payment_advance_pct ?? 50
              const finalDays = payment_final_days ?? 30
              const advAmount = Math.round(amount * advPct) / 100
              const finalAmount = Math.round((amount - advAmount) * 100) / 100
              const invoiceDate = toDateStr(today)
              const finalDate = new Date(today)
              finalDate.setDate(finalDate.getDate() + finalDays)
              await admin.from('invoice_payments').insert([
                { invoice_id: newInvoice.id, installment_no: 1, amount: advAmount,   due_date: invoiceDate,          status: 'pending' },
                { invoice_id: newInvoice.id, installment_no: 2, amount: finalAmount, due_date: toDateStr(finalDate), status: 'pending' },
              ])
            }
          } catch (err) {
            console.error('[billing] first invoice failed:', err instanceof Error ? err.message : String(err))
          }
        }
      }
    }

    // ── Advance payment at signup ──────────────────────────────────────────────
    if (advance_amount && Number(advance_amount) > 0 && resolvedClientId) {
      try {
        const advanceTotal = Number(advance_amount)
        const advInvoiceId = generateId()
        const now = new Date()
        const invoiceNumber = `ADV-${Date.now().toString(36).toUpperCase()}`
        await admin.from('invoices').insert({
          id:               advInvoiceId,
          invoice_number:   invoiceNumber,
          client_id:        resolvedClientId,
          items:            [{ description: 'Advance Payment', quantity: 1, unit_price: advanceTotal, total: advanceTotal }],
          subtotal:         advanceTotal,
          tax:              0,
          total:            advanceTotal,
          status:           'paid',
          issued_date:      advance_date ?? now.toISOString().split('T')[0],
          received_amount:  advanceTotal,
          received_at:      advance_date ? new Date(advance_date).toISOString() : now.toISOString(),
          notes:            'Advance payment recorded at account creation',
          created_at:       now.toISOString(),
          updated_at:       now.toISOString(),
        })
        // Record in invoice_payments for proper tracking
        await admin.from('invoice_payments').insert({
          invoice_id:     advInvoiceId,
          amount:         advanceTotal,
          payment_method: advance_method || null,
          status:         'paid',
          received_at:    advance_date ? new Date(advance_date).toISOString() : now.toISOString(),
          installment_no: null,
        })
      } catch (advErr) {
        console.error('[advance] failed to create advance invoice:', advErr instanceof Error ? advErr.message : String(advErr))
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
