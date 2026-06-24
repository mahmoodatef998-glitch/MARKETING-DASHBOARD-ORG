export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { sendSlack } from '@/lib/slack'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { notes, voice_note_url } = body

  if (!notes?.trim()) return NextResponse.json({ error: 'Revision notes are required' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()

  const { data: task, error: fetchErr } = await admin
    .from('tasks')
    .select('id, title, client_id, assigned_to, status, client:clients(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const canRevise = profile?.role === 'admin' || profile?.role === 'media_buyer' || task.client_id === profile?.client_id
  if (!canRevise) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('tasks')
    .update({
      status:             'in_progress',
      revision_notes:     notes.trim(),
      revision_voice_url: typeof voice_note_url === 'string' ? voice_note_url : null,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientName = (task.client as { name?: string } | null)?.name ?? 'Client'

  // Notify assigned team member via Slack
  try { await sendSlack(
    `🔄 *Revision requested* on "${task.title}" by ${clientName}\n> ${notes.trim().slice(0, 200)}${notes.length > 200 ? '…' : ''}${voice_note_url ? '\n🎤 _Voice note attached_' : ''}`
  ) } catch {}

  // Log to automation_logs for audit trail
  try { await admin.from('automation_logs').insert({
    type:            'task_in_review',
    recipient_email: 'team@internal',
    subject:         `Revision requested: ${task.title}`,
    status:          'sent',
    task_id:         id,
    created_at:      new Date().toISOString(),
  }) } catch {}

  return NextResponse.json(data)
}
