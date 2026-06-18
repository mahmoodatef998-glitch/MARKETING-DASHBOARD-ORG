export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionInvoice, deleteNotionPage } from '@/lib/notion'
import { dbError } from '@/lib/utils'
import { nextInvoiceDate, toDateStr, type CycleType } from '@/lib/invoice-automation'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// ── Mark as paid / overdue ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr  = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === 'mark_paid') {
    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status:          'paid',
        received_amount: inv.received_amount ?? inv.total,
        received_at:     inv.received_at ?? now,
        updated_at:      now,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

    const client = inv.client as any
    const plan = (client?.billing_plans as any[])?.find((p: any) => p.is_active)
    if (plan && plan.cycle_type !== 'manual') {
      const next = nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)
      await supabase
        .from('billing_plans')
        .update({ next_invoice_date: toDateStr(next) })
        .eq('id', plan.id)
    }

    return NextResponse.json({
      ...data,
      nextInvoiceDate: plan ? toDateStr(nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)) : null,
    })
  }

  if (action === 'mark_overdue') {
    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, name, email)')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

    // Send overdue email notification to client
    const client = inv.client as { name?: string; email?: string } | null
    if (client?.email) {
      try {
        const { subject, body } = await generateEmailContent({
          type:          'payment_reminder',
          recipientName: client.name ?? 'Valued Client',
          details:       `Invoice #${inv.invoice_number} for ${inv.total} was due on ${inv.due_date}. Please settle your payment at your earliest convenience.`,
        })
        await sendEmail({ to: client.email, subject, body })
        await supabase.from('automation_logs').insert({
          type:            'payment_reminder',
          recipient_email: client.email,
          subject,
          status:          'sent',
          created_at:      new Date().toISOString(),
        })
      } catch (emailErr: any) {
        console.error('[mark_overdue] email failed:', emailErr.message)
        try {
          await supabase.from('automation_logs').insert({
            type:            'payment_reminder',
            recipient_email: client.email,
            subject:         'Payment Reminder',
            status:          'failed',
            error:           emailErr.message,
            created_at:      new Date().toISOString(),
          })
        } catch {}
      }
    }

    return NextResponse.json(data)
  }

  if (action === 'mark_received') {
    const receivedAmount   = Number(body.received_amount ?? 0)
    const paymentReference = body.payment_reference ?? null
    const paymentNotes     = body.payment_notes ?? null

    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const fullyPaid = receivedAmount >= inv.total
    const newStatus = fullyPaid ? 'paid' : inv.status

    const { data, error } = await supabase
      .from('invoices')
      .update({
        received_amount:   receivedAmount,
        received_at:       new Date().toISOString(),
        payment_reference: paymentReference,
        payment_notes:     paymentNotes,
        status:            newStatus,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

    let nextInvoiceDateResult: string | null = null
    if (fullyPaid) {
      const client = inv.client as any
      const plan = (client?.billing_plans as any[])?.find((p: any) => p.is_active)
      if (plan && plan.cycle_type !== 'manual') {
        const next = nextInvoiceDate(new Date(), plan.cycle_type as CycleType, plan.custom_days ?? undefined)
        await supabase.from('billing_plans').update({ next_invoice_date: toDateStr(next) }).eq('id', plan.id)
        nextInvoiceDateResult = toDateStr(next)
      }
    }

    return NextResponse.json({ ...data, nextInvoiceDate: nextInvoiceDateResult })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json()

  let updated: Record<string, unknown> = {
    invoice_number: body.invoice_number,
    client_id:      body.client_id,
    status:         body.status,
    due_date:       body.due_date || null,
    issued_date:    body.issued_date,
    notes:          body.notes ?? null,
    updated_at:     new Date().toISOString(),
  }

  if (body.items) {
    const subtotal = (body.items as Array<{quantity: number; unit_price: number}>).reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const tax = body.tax ?? 0
    updated = { ...updated, items: body.items, subtotal, total: subtotal + (subtotal * tax) / 100, tax }
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionInvoice(data.notion_id, updated) } catch {}
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const { data } = await supabase.from('invoices').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
