export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionInvoice } from '@/lib/notion'
import { generateId, generateInvoiceNumber, dbError } from '@/lib/utils'
import { InvoiceCreateSchema, parseBody } from '@/lib/validation'
import { DEMO_INVOICES } from '@/lib/demo-data'
import type { Invoice } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_INVOICES)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()

  let query = supabase.from('invoices').select('*, client:clients(*)').order('created_at', { ascending: false })

  // Clients only see their own invoices
  if (profile?.role === 'client') {
    if (!profile.client_id) return NextResponse.json([])
    query = query.eq('client_id', profile.client_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    const items = body.items ?? []
    const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
    const tax = body.tax ?? 0
    return NextResponse.json({ id: generateId(), invoice_number: generateInvoiceNumber(), ...body, subtotal, total: subtotal + subtotal * tax / 100, issued_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rawBody = await req.json().catch(() => null)
  const parsed = parseBody(InvoiceCreateSchema, rawBody)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const b = parsed.data
  const subtotal = b.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const tax      = b.tax ?? 0
  const total    = subtotal + (subtotal * tax) / 100

  const invoice: Invoice = {
    id:             generateId(),
    invoice_number: b.invoice_number ?? generateInvoiceNumber(),
    client_id:      b.client_id,
    items:          b.items.map(i => ({
      id:          generateId(),
      description: i.description,
      quantity:    Number(i.quantity),
      unit_price:  Number(i.unit_price),
      total:       Number(i.quantity) * Number(i.unit_price),
    })),
    subtotal,
    tax,
    total,
    status:      b.status    ?? 'draft',
    due_date:    (b.due_date as string | undefined) ?? undefined,
    issued_date: new Date().toISOString(),
    notes:       b.notes     ?? undefined,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }
  const { error } = await supabase.from('invoices').insert(invoice)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  try { const notionId = await createNotionInvoice(invoice); await supabase.from('invoices').update({ notion_id: notionId }).eq('id', invoice.id) } catch {}
  return NextResponse.json(invoice, { status: 201 })
}
