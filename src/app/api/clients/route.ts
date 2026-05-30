export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionClient } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { DEMO_CLIENTS } from '@/lib/demo-data'
import type { Client } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_CLIENTS)
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*, billing_plans(id, cycle_type, amount, currency, custom_days, next_invoice_date, is_active)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = await createServerClient()
  const body = await req.json()
  const { billing_plan, ...clientBody } = body

  const client: Client = {
    id: generateId(), name: clientBody.name, email: clientBody.email, phone: clientBody.phone ?? null,
    status: clientBody.status ?? 'pending', country: clientBody.country ?? null, notes: clientBody.notes ?? null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('clients').insert(client)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create billing plan if provided
  if (billing_plan?.cycle_type) {
    await supabase.from('billing_plans').insert({
      id:                generateId(),
      client_id:         client.id,
      cycle_type:        billing_plan.cycle_type,
      amount:            Number(billing_plan.amount),
      currency:          billing_plan.currency ?? 'USD',
      custom_days:       billing_plan.cycle_type === 'custom_days' ? Number(billing_plan.custom_days) : null,
      next_invoice_date: billing_plan.next_invoice_date,
      is_active:         true,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
  }

  try { const notionId = await createNotionClient(client); await supabase.from('clients').update({ notion_id: notionId }).eq('id', client.id) } catch {}
  return NextResponse.json(client, { status: 201 })
}
