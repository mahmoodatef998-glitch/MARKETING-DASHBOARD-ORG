export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { analyzeFinancials } from '@/lib/gemini'

export async function POST() {
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
