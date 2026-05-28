export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getPresignedUploadUrl, isR2Configured } from '@/lib/r2'
import { generateId } from '@/lib/utils'

export async function POST(req: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File storage not configured' }, { status: 503 })
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, contentType } = await req.json()
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 })
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  const key = `deliveries/${new Date().getFullYear()}/${generateId()}.${ext}`

  const { uploadUrl, fileUrl } = await getPresignedUploadUrl(key, contentType)
  return NextResponse.json({ uploadUrl, fileUrl })
}
