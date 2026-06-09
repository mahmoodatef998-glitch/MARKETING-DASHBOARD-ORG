export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/tasks/[id]/approve — client approves a task (moves to done + saves rating)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { rating, rating_note } = body

  // Verify the task belongs to this client
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  const { data: task, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, client_id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Only allow if admin or the task's client
  if (profile?.role !== 'admin' && task.client_id !== profile?.client_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (task.status === 'done') {
    return NextResponse.json({ error: 'Task already approved' }, { status: 409 })
  }

  const updates: Record<string, unknown> = {
    status:     'done',
    updated_at: new Date().toISOString(),
  }
  if (rating)      updates.client_rating      = Number(rating)
  if (rating_note) updates.client_rating_note = String(rating_note)

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
