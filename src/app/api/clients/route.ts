export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { createNotionClient } from '@/lib/notion'
import { generateId, dbError } from '@/lib/utils'
import { ClientCreateSchema, parseBody } from '@/lib/validation'
import { DEMO_CLIENTS } from '@/lib/demo-data'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import type { Client } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_CLIENTS)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const admin = createAdminClient()
  if (profile?.role === 'media_buyer') {
    const { data, error } = await admin.from('clients').select('id, name').is('deleted_at', null).order('name')
    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
    return NextResponse.json(data)
  }
  if (!['admin', 'account_manager'].includes(profile?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await admin
    .from('clients')
    .select('*, billing_plans(id, cycle_type, amount, currency, custom_days, next_invoice_date, is_active)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'account_manager'].includes(callerProfile?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rawBody = await req.json().catch(() => null)
  const { billing_plan, package: packageData, ...clientBody } = rawBody ?? {}

  const parsed = parseBody(ClientCreateSchema, clientBody)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const body = parsed.data
  const client: Client = {
    id: generateId(),
    name:    parsed.data.name,
    email:   parsed.data.email,
    phone:   (parsed.data.phone   ?? undefined) as string | undefined,
    status:  parsed.data.status  ?? 'pending',
    country: (parsed.data.country ?? undefined) as string | undefined,
    notes:   (parsed.data.notes   ?? undefined) as string | undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('clients').insert(client)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  // Create billing plan if provided
  if (billing_plan?.cycle_type) {
    await supabase.from('billing_plans').insert({
      id:                generateId(),
      client_id:         client.id,
      cycle_type:        billing_plan.cycle_type,
      amount:            Number(billing_plan.amount),
      currency:          billing_plan.currency ?? 'AED',
      custom_days:       billing_plan.cycle_type === 'custom_days' ? Number(billing_plan.custom_days) : null,
      next_invoice_date: billing_plan.next_invoice_date,
      is_active:         true,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
  }

  // Create service package if provided
  if (packageData?.name && packageData?.total) {
    await supabase.from('client_packages').insert({
      id:           generateId(),
      client_id:    client.id,
      name:         packageData.name,
      price:        Number(packageData.total),
      renewal_type: 'one_time',
      start_date:   billing_plan?.next_invoice_date ?? new Date().toISOString().split('T')[0],
      is_active:    true,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
  }

  try { const notionId = await createNotionClient(client); await supabase.from('clients').update({ notion_id: notionId }).eq('id', client.id) } catch {}

  // Send welcome email (non-blocking)
  try {
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-dashboard.vercel.app'
    const details = [
      `Company: ${client.name}`,
      `Portal: ${portalUrl}/client-portal`,
      client.phone ? `Phone: ${client.phone}` : null,
    ].filter(Boolean).join('\n')
    const { subject, body: emailBody } = await generateEmailContent({
      type:          'client_welcome',
      recipientName: client.name,
      details,
    })
    await sendEmail({ to: client.email, subject, body: emailBody })
    await supabase.from('automation_logs').insert({
      type:            'client_welcome',
      recipient_email: client.email,
      subject,
      status:          'sent',
      created_at:      new Date().toISOString(),
    })
  } catch {}

  return NextResponse.json(client, { status: 201 })
}
