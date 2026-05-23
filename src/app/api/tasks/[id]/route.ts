export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { updateNotionTask, deleteNotionPage } from '@/lib/notion'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const body = await req.json()
  const updated = { ...body, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('tasks')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionTask(data.notion_id, updated) } catch {}
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('tasks').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
