export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createNotionInvoice } from '@/lib/notion'
import { generateId, generateInvoiceNumber } from '@/lib/utils'
import { DEMO_INVOICES } from '@/lib/demo-data'
import type { Invoice } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_INVOICES)
  const supabase = createServerClient()
  const { data, error } = await supabase.from('invoices').select('*, client:clients(*)').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  const supabase = createServerClient()
  const body = await req.json()
  const items = body.items ?? []
  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
  const tax = body.tax ?? 0
  const total = subtotal + (subtotal * tax) / 100
  const invoice: Invoice = {
    id: generateId(), invoice_number: body.invoice_number ?? generateInvoiceNumber(), client_id: body.client_id,
    items: items.map((i: any) => ({ id: generateId(), description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total: Number(i.quantity) * Number(i.unit_price) })),
    subtotal, tax, total, status: body.status ?? 'draft', due_date: body.due_date ?? null,
    issued_date: new Date().toISOString(), notes: body.notes ?? null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('invoices').insert(invoice)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { const notionId = await createNotionInvoice(invoice); await supabase.from('invoices').update({ notion_id: notionId }).eq('id', invoice.id) } catch {}
  return NextResponse.json(invoice, { status: 201 })
}
