export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

const BUCKET = 'task-assets'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, contentType } = await req.json().catch(() => ({}))
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType required' }, { status: 400 })
  }

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(contentType)) {
    return NextResponse.json({ error: 'Only image files allowed' }, { status: 400 })
  }

  const ext   = filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const key   = `${user.id}/${Date.now()}.${ext}`
  const admin = createAdminClient()

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(key)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token:     data.token,
    path:      key,
    publicUrl,
  })
}
