export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { generateId } from '@/lib/utils'
import { generateAndSendInvoice, toDateStr, nextInvoiceDate, type CycleType } from '@/lib/invoice-automation'
import { nextInvoiceNumber } from '@/lib/invoice-number'
import { rateLimit } from '@/lib/rate-limit'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

// GET all team/client users
export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 60, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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
  const rl = rateLimit(getIp(req), { limit: 20, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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

    // Create package if package data provided (name required, or items with quantities)
    const hasItems = Array.isArray(packageData?.items) &&
      packageData.items.some((i: { total_quantity?: number }) => Number(i.total_quantity) > 0)
    if (packageData && (packageData.name || hasItems)) {
      const pkgRecord = {
        id:           generateId(),
        client_id:    resolvedClientId,
        name:         packageData.name || 'Custom Package',
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

      if (pkgErr) {
        console.error('[users/create] package creation failed:', pkgErr.message)
      } else if (newPkg && Array.isArray(packageData.items)) {
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
          const { error: itemErr } = await admin.from('package_items').insert(itemRows)
          if (itemErr) console.error('[users/create] package items creation failed:', itemErr.message)
        }
      }
    }

    // Create billing plan if auto-billing configured (not manual)
    if (billing_cycle && billing_amount && billing_cycle !== 'manual') {
      const cycle = billing_cycle as CycleType
      const amount = Number(billing_amount)
      const currency = billing_currency ?? 'AED'
      const customDays = billing_custom_days ? Number(billing_custom_days) : undefined
      const today = new Date()
      const todayStr = toDateStr(today)
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      const firstInvoiceDate = billing_start_date || todayStr
      const firstInvoiceDateObj = new Date(firstInvoiceDate)
      firstInvoiceDateObj.setHours(0, 0, 0, 0)

      const hasAdvanceForBilling = advance_amount && Number(advance_amount) > 0

      // If advance was taken, first regular invoice date is one cycle after the start date
      // Otherwise, cron creates the first invoice on the start date
      const nextBillingDate = hasAdvanceForBilling
        ? toDateStr(nextInvoiceDate(firstInvoiceDateObj, cycle, customDays))
        : firstInvoiceDate

      const billingPlanRecord = {
        id:                   generateId(),
        client_id:            resolvedClientId,
        cycle_type:           cycle,
        amount,
        currency,
        custom_days:          customDays ?? null,
        next_invoice_date:    nextBillingDate,
        payment_policy_type:  payment_policy_type ?? 'single',
        payment_advance_pct:  hasAdvanceForBilling && amount > 0
          ? Math.round((Number(advance_amount) / amount) * 100)
          : (payment_advance_pct ?? 50),
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

      if (billingErr) {
        console.error('[billing] plan creation failed:', billingErr.message)
      } else if (billingPlan && !hasAdvanceForBilling && firstInvoiceDateObj <= todayStart) {
        // No advance and start date is today or past → create first invoice immediately
        try {
          await generateAndSendInvoice({
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
        } catch (err) {
          console.error('[billing] first invoice failed:', err instanceof Error ? err.message : String(err))
        }
      }
      // else: future start date or has advance → cron handles next invoice
    }

    // Advance tracking — always runs when advance_amount provided, independent of billing cycle
    if (advance_amount && Number(advance_amount) > 0 && resolvedClientId) {
      try {
        const advAmt = Number(advance_amount)
        const totalBilling = billing_amount ? Number(billing_amount) : advAmt
        const finalAmt = Math.max(0, Math.round((totalBilling - advAmt) * 100) / 100)
        const currency = billing_currency ?? 'AED'
        const now = new Date()
        const todayStr = toDateStr(now)
        const firstInvoiceDate = billing_start_date || todayStr
        const advReceivedAt = advance_date ? new Date(advance_date).toISOString() : now.toISOString()

        // ADV invoice — paid immediately, shows as income in Finance
        const advInvoiceId     = generateId()
        const advInvoiceNumber = `ADV-${Date.now().toString(36).toUpperCase()}`
        await admin.from('invoices').insert({
          id:              advInvoiceId,
          invoice_number:  advInvoiceNumber,
          client_id:       resolvedClientId,
          items:           [{ description: 'Advance Payment', quantity: 1, unit_price: advAmt, total: advAmt }],
          subtotal:        advAmt,
          tax:             0,
          total:           advAmt,
          currency,
          status:          'paid',
          issued_date:     advance_date ?? todayStr,
          due_date:        advance_date ?? todayStr,
          received_amount: advAmt,
          received_at:     advReceivedAt,
          notes:           `Advance payment received${finalAmt > 0 ? `. Remaining ${finalAmt} ${currency} due ${firstInvoiceDate}` : ''}.`,
          created_at:      now.toISOString(),
          updated_at:      now.toISOString(),
        })
        await admin.from('invoice_payments').insert({
          invoice_id:     advInvoiceId,
          amount:         advAmt,
          payment_method: advance_method || null,
          status:         'paid',
          received_at:    advReceivedAt,
          installment_no: null,
        })

        // Remaining balance invoice — open in Invoices section, triggers reminders
        if (finalAmt > 0) {
          const remainingNumber = await nextInvoiceNumber(admin)
          await admin.from('invoices').insert({
            id:              generateId(),
            invoice_number:  remainingNumber,
            client_id:       resolvedClientId,
            items:           [{ description: 'Marketing Services (Remaining Balance)', quantity: 1, unit_price: finalAmt, total: finalAmt }],
            subtotal:        finalAmt,
            tax:             0,
            total:           finalAmt,
            currency,
            status:          'sent',
            issued_date:     todayStr,
            due_date:        firstInvoiceDate,
            received_amount: 0,
            notes:           `Remaining balance after ${advAmt} ${currency} advance on ${todayStr}.`,
            created_at:      now.toISOString(),
            updated_at:      now.toISOString(),
          })
        }

        await admin.from('automation_logs').insert({
          type:            'payment_reminder',
          recipient_email: email,
          subject:         `ADV ${advInvoiceNumber} — ${advAmt} ${currency} received${finalAmt > 0 ? `; remaining ${finalAmt} ${currency} due ${firstInvoiceDate}` : ''}`,
          status:          'sent',
          created_at:      now.toISOString(),
        })
      } catch (advErr) {
        console.error('[advance] tracking failed:', advErr instanceof Error ? advErr.message : String(advErr))
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
