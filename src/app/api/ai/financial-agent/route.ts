export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { analyzeFinancials } from '@/lib/gemini'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = rateLimit(ip, { limit: 10, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch analytics data
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res  = await fetch(`${base}/api/analytics/financial`, {
    headers: { Cookie: `sb-access-token=${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch financial data' }, { status: 500 })
  const financialData = await res.json()

  try {
    const analysis = await analyzeFinancials(financialData)
    return NextResponse.json(analysis)
  } catch (err) {
    console.error('[financial-agent]', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }
}
