export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/tasks/[id]/revise — client requests a revision (saves notes, moves back to in_progress)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { notes } = body

  if (!notes?.trim()) return NextResponse.json({ error: 'Revision notes are required' }, { status: 400 })

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
    .single()

  if (fetchErr || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  if (profile?.role !== 'admin' && task.client_id !== profile?.client_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status:         'in_progress',
      revision_notes: notes.trim(),
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
