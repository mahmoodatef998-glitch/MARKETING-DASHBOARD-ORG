export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    fbConfigured: !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET),
    appUrl:       process.env.NEXT_PUBLIC_APP_URL ?? '',
  })
}
