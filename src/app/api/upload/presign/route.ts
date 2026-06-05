export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

const BUCKET = 'task-assets'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, contentType } = await req.json().catch(() => ({}))
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType required' }, { status: 400 })
  }

  const ALLOWED_IMAGES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  const ALLOWED_AUDIO  = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/x-m4a']
  const ALLOWED_VIDEO  = ['video/mp4', 'video/mov', 'video/webm', 'video/quicktime']
  const allowed = [...ALLOWED_IMAGES, ...ALLOWED_AUDIO, ...ALLOWED_VIDEO]

  if (!allowed.includes(contentType)) {
    return NextResponse.json({ error: `File type not allowed: ${contentType}` }, { status: 400 })
  }

  const ext    = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  const folder = ALLOWED_AUDIO.includes(contentType) ? 'audio' : ALLOWED_VIDEO.includes(contentType) ? 'video' : 'images'
  const key    = `${folder}/${user.id}/${Date.now()}.${ext}`
  const admin  = createAdminClient()

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(key)

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: key, publicUrl })
}
