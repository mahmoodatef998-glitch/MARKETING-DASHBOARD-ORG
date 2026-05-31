export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionInvoice } from '@/lib/notion'
import { generateId, generateInvoiceNumber } from '@/lib/utils'
import { DEMO_INVOICES } from '@/lib/demo-data'
import { rateLimit } from '@/lib/rate-limit'
import { parseBody, InvoiceCreateSchema } from '@/lib/validation'
import type { Invoice } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 120, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (DEMO) return NextResponse.json(DEMO_INVOICES)

  const supabase = await createServerClient()
  const { searchParams } = new URL(req.url)

  const page  = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  const { data, error, count } = await supabase
    .from('invoices')
    .select('*, client:clients(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 20, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (DEMO) {
    const body = await req.json()
    const items = body.items ?? []
    const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
    const tax = body.tax ?? 0
    return NextResponse.json({ id: generateId(), invoice_number: generateInvoiceNumber(), ...body, subtotal, total: subtotal + subtotal * tax / 100, issued_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }

  const supabase = await createServerClient()
  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = parseBody(InvoiceCreateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const items = body.items
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const tax = body.tax ?? 0
  const total = subtotal + (subtotal * tax) / 100

  const invoice: Invoice = {
    id: generateId(), invoice_number: body.invoice_number ?? generateInvoiceNumber(),
    client_id: body.client_id,
    items: items.map((i) => ({ id: generateId(), description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })),
    subtotal, tax, total, status: body.status ?? 'draft',
    ...(body.due_date ? { due_date: body.due_date as string } : {}),
    ...(body.notes    ? { notes:    body.notes    as string } : {}),
    issued_date: new Date().toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('invoices').insert(invoice)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const notionId = await createNotionInvoice(invoice)
    await supabase.from('invoices').update({ notion_id: notionId }).eq('id', invoice.id)
  } catch {}

  return NextResponse.json(invoice, { status: 201 })
}
