export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Upsert by endpoint so re-subscribing doesn't create duplicates
  const { error } = await admin.from('push_subscriptions').upsert({
    user_id:  user.id,
    endpoint: body.endpoint,
    p256dh:   body.keys.p256dh,
    auth:     body.keys.auth,
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
