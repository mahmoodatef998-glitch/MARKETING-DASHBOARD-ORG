export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionInvoice, deleteNotionPage } from '@/lib/notion'
import { dbError } from '@/lib/utils'
import { nextInvoiceDate, toDateStr, buildReceiptHtml, type CycleType } from '@/lib/invoice-automation'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { logAudit } from '@/lib/audit'

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

  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === 'mark_paid') {
    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, name, email, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const now = new Date().toISOString()
    const paidAmount = inv.total
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status:          'paid',
        received_amount: paidAmount,
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

    // Send receipt email
    if (client?.email) {
      const currSym = inv.currency === 'EGP' ? 'EGP ' : inv.currency === 'EUR' ? '€' : inv.currency === 'GBP' ? '£' : inv.currency === 'USD' ? '$' : 'AED '
      const receiptSubject = `Payment Receipt — ${inv.invoice_number} | ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`
      const receiptHtml = buildReceiptHtml({
        clientName:     client.name ?? 'Valued Client',
        invoiceNumber:  inv.invoice_number,
        currencySymbol: currSym,
        amountReceived: paidAmount,
        totalPaid:      paidAmount,
        invoiceTotal:   inv.total,
        receivedAt:     now,
        isFullyPaid:    true,
      })
      const receiptText = `Dear ${client.name ?? 'Valued Client'},\n\nPayment confirmed for invoice ${inv.invoice_number}.\nAmount: ${currSym}${paidAmount.toLocaleString()}\nStatus: FULLY PAID\n\nThank you for your business.\n— ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`
      try {
        await sendEmail({ to: client.email, subject: receiptSubject, body: receiptText, html: receiptHtml })
        await supabase.from('automation_logs').insert({ type: 'payment_receipt', recipient_email: client.email, subject: receiptSubject, status: 'sent', created_at: now })
      } catch (emailErr: any) {
        console.error('[mark_paid] receipt email failed:', emailErr.message)
        try { await supabase.from('automation_logs').insert({ type: 'payment_receipt', recipient_email: client.email, subject: receiptSubject, status: 'failed', error: emailErr.message, created_at: now }) } catch {}
      }
    }

    try {
      await logAudit({ userId: currentUser?.id, userEmail: currentUser?.email, action: 'mark_paid', tableName: 'invoices', recordId: id, newValue: { status: 'paid' } })
    } catch {}

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

    try {
      await logAudit({ userId: currentUser?.id, userEmail: currentUser?.email, action: 'mark_overdue', tableName: 'invoices', recordId: id, newValue: { status: 'overdue' } })
    } catch {}

    return NextResponse.json(data)
  }

  if (action === 'mark_received') {
    const newPaymentAmount = Number(body.received_amount ?? 0)
    const paymentReference = body.payment_reference ?? null
    const paymentNotes     = body.payment_notes ?? null

    const { data: inv } = await supabase
      .from('invoices')
      .select('*, client:clients(id, name, email, billing_plans(id, is_active, cycle_type, custom_days, next_invoice_date))')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Accumulate: add to existing received_amount instead of overwriting
    const totalReceived = (inv.received_amount ?? 0) + newPaymentAmount
    const fullyPaid = totalReceived >= inv.total
    const newStatus = fullyPaid ? 'paid' : inv.status
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('invoices')
      .update({
        received_amount:   totalReceived,
        received_at:       now,
        payment_reference: paymentReference,
        payment_notes:     paymentNotes,
        status:            newStatus,
        updated_at:        now,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

    // Insert payment record for audit trail
    try {
      await supabase.from('invoice_payments').insert({
        invoice_id:  id,
        amount:      newPaymentAmount,
        reference:   paymentReference,
        notes:       paymentNotes,
        received_at: now,
        status:      'paid',
      })
    } catch {}

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

    // Send receipt email
    const client = inv.client as any
    if (client?.email) {
      const currSym = inv.currency === 'EGP' ? 'EGP ' : inv.currency === 'EUR' ? '€' : inv.currency === 'GBP' ? '£' : inv.currency === 'USD' ? '$' : 'AED '
      const receiptSubject = `Payment Receipt — ${inv.invoice_number} | ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`
      const receiptHtml = buildReceiptHtml({
        clientName:     client.name ?? 'Valued Client',
        invoiceNumber:  inv.invoice_number,
        currencySymbol: currSym,
        amountReceived: newPaymentAmount,
        totalPaid:      totalReceived,
        invoiceTotal:   inv.total,
        receivedAt:     now,
        isFullyPaid:    fullyPaid,
      })
      const receiptText = `Dear ${client.name ?? 'Valued Client'},\n\nPayment received for invoice ${inv.invoice_number}.\nAmount received: ${currSym}${newPaymentAmount.toLocaleString()}\nTotal paid: ${currSym}${totalReceived.toLocaleString()} of ${currSym}${inv.total.toLocaleString()}\n${fullyPaid ? 'Status: FULLY PAID' : `Remaining: ${currSym}${Math.max(0, inv.total - totalReceived).toLocaleString()}`}\n\nThank you for your business.\n— ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'}`
      try {
        await sendEmail({ to: client.email, subject: receiptSubject, body: receiptText, html: receiptHtml })
        await supabase.from('automation_logs').insert({ type: 'payment_receipt', recipient_email: client.email, subject: receiptSubject, status: 'sent', created_at: now })
      } catch (emailErr: any) {
        console.error('[mark_received] receipt email failed:', emailErr.message)
        try { await supabase.from('automation_logs').insert({ type: 'payment_receipt', recipient_email: client.email, subject: receiptSubject, status: 'failed', error: emailErr.message, created_at: now }) } catch {}
      }
    }

    try {
      await logAudit({ userId: currentUser?.id, userEmail: currentUser?.email, action: 'mark_received', tableName: 'invoices', recordId: id, newValue: { status: newStatus, received_amount: totalReceived } })
    } catch {}

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

  const { data: { user: currentUser } } = await supabase.auth.getUser()

  // Must exist and not already be soft-deleted
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, notion_id, status, total, invoice_number')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invoice not found or already deleted' }, { status: 404 })

  if (inv.notion_id) {
    try { await deleteNotionPage(inv.notion_id) } catch {}
  }

  const { error } = await supabase
    .from('invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })

  try {
    await logAudit({
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      action: 'delete_invoice',
      tableName: 'invoices',
      recordId: id,
      oldValue: { invoice_number: inv.invoice_number, status: inv.status, total: inv.total },
    })
  } catch {}

  return NextResponse.json({ success: true })
}
