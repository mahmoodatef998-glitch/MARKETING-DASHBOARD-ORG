export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: task, error } = await supabase
    .from('tasks')
    .update({ status: 'done', revision_notes: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, client:clients(id,name), assignee:profiles(id,display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify assigned team member
  const admin = createAdminClient()
  try {
    if (task?.assigned_to) {
      const { data: authUser } = await admin.auth.admin.getUserById(task.assigned_to)
      const memberEmail = authUser?.user?.email
      if (memberEmail) {
        await sendEmail({
          to: memberEmail,
          subject: `✅ Client approved: "${task.title}"`,
          body: [
            `Great news! ${task.client?.name ?? 'The client'} has approved the task:`,
            ``,
            `  "${task.title}"`,
            ``,
            task.delivery_url ? `Approved delivery: ${task.delivery_url}` : '',
            ``,
            `The task is now marked as Done. You can proceed with publishing.`,
          ].filter((l) => l !== undefined).join('\n'),
        })
      }
    }

    await admin.from('automation_logs').insert({
      type: 'task_completed',
      recipient_email: task?.client?.name ?? 'client',
      subject: `Client approved: ${task?.title}`,
      status: 'sent',
      task_id: id,
      created_at: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[approve] notify failed:', err.message)
  }

  return NextResponse.json(task)
}
