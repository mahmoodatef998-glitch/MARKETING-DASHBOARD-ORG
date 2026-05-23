export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { updateNotionClient, deleteNotionPage } from '@/lib/notion'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const body = await req.json()
  const updated = { ...body, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('clients')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionClient(data.notion_id, updated) } catch {}
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data } = await supabase.from('clients').select('notion_id').eq('id', id).single()
  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
