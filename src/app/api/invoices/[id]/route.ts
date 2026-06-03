export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { updateNotionInvoice, deleteNotionPage } from '@/lib/notion'
import { dbError } from '@/lib/utils'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const authErr = await requireAdmin(supabase)
  if (authErr) return authErr

  const body = await req.json()

  let updated: any = { ...body, updated_at: new Date().toISOString(), due_date: body.due_date || null }

  if (body.items) {
    const subtotal = body.items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
    const tax = body.tax ?? 0
    updated = { ...updated, subtotal, total: subtotal + (subtotal * tax) / 100 }
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

  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
