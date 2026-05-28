export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { updateNotionTask, deleteNotionPage } from '@/lib/notion'
import { sendEmail } from '@/lib/gmail'
import { generateEmailContent } from '@/lib/gemini'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const updated = { ...body, updated_at: new Date().toISOString() }

  // Fetch old status before update so we know if it changed to 'done'
  const { data: oldTask } = await supabase
    .from('tasks')
    .select('status, client_id, title, description, priority, due_date, assigned_to, delivery_url')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('tasks')
    .update(updated)
    .eq('id', id)
    .select('*, client:clients(id, name, email), assignee:profiles(id, display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.notion_id) {
    try { await updateNotionTask(data.notion_id, updated) } catch {}
  }

  // ── When task is marked done → notify client ───────────────────────────────
  const justCompleted = oldTask?.status !== 'done' && body.status === 'done'
  if (justCompleted && data?.client?.email) {
    const admin = createAdminClient()
    const clientName = data.client.name
    const clientEmail = data.client.email

    // Get team member name for the email
    let memberName = data.assignee?.display_name ?? 'Your team member'
    if (!data.assignee && data.assigned_to) {
      const { data: authUser } = await admin.auth.admin.getUserById(data.assigned_to).catch(() => ({ data: null }))
      if (authUser?.user?.email) memberName = authUser.user.email
    }

    const deliveryUrl  = updated.delivery_url || oldTask?.delivery_url || null
    const deliveryLine = deliveryUrl ? `\nDelivery link: ${deliveryUrl}` : ''

    const details = [
      `Task: ${data.title}`,
      data.description ? `Description: ${data.description}` : null,
      `Priority: ${data.priority}`,
      data.due_date ? `Due date: ${data.due_date}` : null,
      `Completed by: ${memberName}`,
      `Completed on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      deliveryUrl ? `Delivery link: ${deliveryUrl}` : null,
    ].filter(Boolean).join('\n')

    // WhatsApp notification (non-blocking)
    const clientRes = await admin.from('clients').select('phone').eq('id', data.client?.id ?? '').maybeSingle()
    const clientRow = clientRes.data
    if (clientRow?.phone) {
      const waMsg = `✅ *${data.title}* has been completed!\n${deliveryUrl ? `\n📎 View delivery: ${deliveryUrl}\n` : ''}\nCompleted by: ${memberName}`
      sendWhatsApp(clientRow.phone, waMsg).catch(() => {})
    }

    try {
      const { subject, body: emailBody } = await generateEmailContent({
        type:          'task_completed',
        recipientName: clientName,
        details,
      })

      await sendEmail({ to: clientEmail, subject, body: emailBody + deliveryLine })

      await admin.from('automation_logs').insert({
        type:            'task_completed',
        recipient_email: clientEmail,
        subject,
        status:          'sent',
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
    } catch (err: any) {
      // Non-blocking — don't fail the status update if email fails
      await admin.from('automation_logs').insert({
        type:            'task_completed',
        recipient_email: clientEmail,
        subject:         `Task "${data.title}" completed`,
        status:          'failed',
        error:           err.message,
        task_id:         id,
        created_at:      new Date().toISOString(),
      })
      console.error('[tasks] completion email failed:', err.message)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data } = await supabase.from('tasks').select('notion_id').eq('id', id).single()

  if (data?.notion_id) {
    try { await deleteNotionPage(data.notion_id) } catch {}
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
