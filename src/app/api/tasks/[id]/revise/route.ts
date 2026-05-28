export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/gmail'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { notes } = await req.json()

  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      status: 'in_progress',
      revision_notes: notes?.trim() || null,
      delivery_url: null,
      updated_at: new Date().toISOString(),
    })
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
          subject: `🔄 Revision requested: "${task.title}"`,
          body: [
            `${task.client?.name ?? 'The client'} has requested a revision for:`,
            ``,
            `  "${task.title}"`,
            ``,
            notes ? `Client notes:\n${notes}` : 'No specific notes provided.',
            ``,
            `Please update the delivery and re-submit for approval.`,
          ].join('\n'),
        })
      }
    }
  } catch (err: any) {
    console.error('[revise] notify failed:', err.message)
  }

  return NextResponse.json(task)
}
