export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

async function requireAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'media_buyer'].includes(profile?.role ?? '')) return null
  return { user, role: profile!.role }
}

// PATCH /api/publish-events/[id]
// Allowed updates: status, scheduled_at, error_message, published_at, platform_post_id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const VALID_STATUSES = ['blocked', 'ready', 'published', 'failed', 'cancelled']
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status           !== undefined) updates.status           = body.status
  if (body.scheduled_at     !== undefined) updates.scheduled_at     = new Date(body.scheduled_at).toISOString()
  if (body.error_message    !== undefined) updates.error_message    = body.error_message
  if (body.platform_post_id !== undefined) updates.platform_post_id = body.platform_post_id

  if (body.status === 'published') {
    updates.published_at = new Date().toISOString()
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('publish_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
