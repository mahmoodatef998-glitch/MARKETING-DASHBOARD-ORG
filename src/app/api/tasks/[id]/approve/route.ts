export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'
import { logActivity } from '@/lib/activity-log'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Optional rating submitted by client at approval time
  const body = await req.json().catch(() => ({}))
  const rating: number | null     = (body?.rating >= 1 && body?.rating <= 5) ? body.rating : null
  const ratingNote: string | null = body?.rating_note?.trim() || null

  const updatePayload: Record<string, unknown> = {
    status:         'done',
    revision_notes: null,
    updated_at:     new Date().toISOString(),
  }
  if (rating) {
    updatePayload.client_rating      = rating
    updatePayload.client_rating_note = ratingNote
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .select('*, client:clients(id,name), assignee:profiles(id,display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const admin = createAdminClient()

  // Notify assigned team member
  try {
    if (task?.assigned_to) {
      const { data: authUser } = await admin.auth.admin.getUserById(task.assigned_to)
      const memberEmail = authUser?.user?.email
      if (memberEmail) {
        const ratingLine = rating ? `\nClient rating: ${'⭐'.repeat(rating)} (${rating}/5)${ratingNote ? `\nNote: "${ratingNote}"` : ''}` : ''
        await sendEmail({
          to:      memberEmail,
          subject: `✅ Client approved: "${task.title}"`,
          body: [
            `Great news! ${task.client?.name ?? 'The client'} has approved the task:`,
            ``,
            `  "${task.title}"`,
            ratingLine,
            ``,
            task.delivery_url ? `Approved delivery: ${task.delivery_url}` : '',
            ``,
            `The task is now marked as Done. You can proceed with publishing.`,
          ].filter((l) => l !== undefined).join('\n'),
        })
      }
    }

    await admin.from('automation_logs').insert({
      type:            'task_completed',
      recipient_email: task?.client?.name ?? 'client',
      subject:         `Client approved: ${task?.title}`,
      status:          'sent',
      task_id:         id,
      created_at:      new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[approve] notify failed:', err.message)
  }

  await logActivity({
    supabase: admin,
    userId:     user.id,
    action:     'task.approved',
    entityType: 'task',
    entityId:   id,
    entityName: task?.title,
    newValue:   rating ? { rating, rating_note: ratingNote } : undefined,
  })

  return NextResponse.json(task)
}
