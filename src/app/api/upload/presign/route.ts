export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const ALLOWED_IMAGES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_AUDIO  = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/x-m4a']
const ALLOWED_VIDEO  = ['video/mp4', 'video/mov', 'video/webm', 'video/quicktime']
const ALLOWED        = [...ALLOWED_IMAGES, ...ALLOWED_AUDIO, ...ALLOWED_VIDEO]

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, contentType } = await req.json().catch(() => ({}))
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType required' }, { status: 400 })
  }
  if (!ALLOWED.includes(contentType)) {
    return NextResponse.json({ error: `File type not allowed: ${contentType}` }, { status: 400 })
  }

  const isAudio  = ALLOWED_AUDIO.includes(contentType)
  const isVideo  = ALLOWED_VIDEO.includes(contentType)
  const folder   = isAudio ? 'agency-os/audio' : isVideo ? 'agency-os/video' : 'agency-os/images'
  const resourceType = isAudio || isVideo ? 'video' : 'image'  // Cloudinary uses 'video' for audio too

  const timestamp  = Math.round(Date.now() / 1000)
  const publicId   = `${folder}/${user.id}_${timestamp}`
  const eager      = !isAudio && !isVideo ? 'q_auto,f_auto' : undefined

  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id:     publicId,
    timestamp,
    ...(eager ? { eager } : {}),
  }

  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!)

  // Upload URL for the client to POST directly to Cloudinary
  const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`

  // Public URL after upload (Cloudinary constructs it from public_id)
  const ext       = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  const publicUrl = cloudinary.url(publicId, {
    resource_type: resourceType,
    format:        ext,
    secure:        true,
  })

  return NextResponse.json({
    uploadUrl,
    publicId,
    publicUrl,
    signature,
    timestamp,
    apiKey:   process.env.CLOUDINARY_API_KEY,
    folder,
    eager:    eager ?? null,
  })
}
