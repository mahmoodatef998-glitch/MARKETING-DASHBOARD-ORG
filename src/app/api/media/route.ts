export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'all' // all | image | video | audio

  try {
    const fetchFolder = async (resourceType: 'image' | 'video', prefix: string) => {
      const res = await cloudinary.api.resources({
        type:          'upload',
        resource_type: resourceType,
        prefix,
        max_results:   200,
      })
      return (res.resources ?? []) as CloudinaryResource[]
    }

    let resources: CloudinaryResource[] = []

    if (type === 'image' || type === 'all') {
      const imgs = await fetchFolder('image', 'agency-os/images').catch(() => [])
      resources.push(...imgs)
    }
    if (type === 'video' || type === 'all') {
      const vids = await fetchFolder('video', 'agency-os/video').catch(() => [])
      resources.push(...vids)
    }
    if (type === 'audio' || type === 'all') {
      const audio = await fetchFolder('video', 'agency-os/audio').catch(() => [])
      resources.push(...audio)
    }

    // Sort newest first
    resources.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(resources.map(r => ({
      public_id:     r.public_id,
      secure_url:    r.secure_url,
      resource_type: r.resource_type,
      format:        r.format,
      bytes:         r.bytes,
      width:         r.width,
      height:        r.height,
      created_at:    r.created_at,
      folder:        r.folder ?? r.asset_folder ?? '',
    })))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { public_id, resource_type } = await req.json().catch(() => ({}))
  if (!public_id) return NextResponse.json({ error: 'public_id required' }, { status: 400 })

  try {
    await cloudinary.uploader.destroy(public_id, {
      resource_type: (resource_type ?? 'image') as 'image' | 'video' | 'raw',
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

interface CloudinaryResource {
  public_id:     string
  secure_url:    string
  resource_type: string
  format:        string
  bytes:         number
  width?:        number
  height?:       number
  created_at:    string
  folder?:       string
  asset_folder?: string
}
