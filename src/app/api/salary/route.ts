export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

const TEAM_ROLES = ['video_maker', 'designer', 'ai_video', 'media_buyer']

function inRange(dateStr: string, from?: string | null, to?: string | null) {
  if (from && dateStr < from) return false
  if (to && dateStr > to + 'T23:59:59Z') return false
  return true
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const memberId = searchParams.get('member_id')

  const admin = createAdminClient()

  const [
    { data: profiles },
    { data: earnings },
    { data: payoutsRaw },
    { data: { users: authUsers } },
  ] = await Promise.all([
    admin.from('profiles').select('id, role, display_name').in('role', TEAM_ROLES).order('display_name'),
    admin.from('earnings').select('user_id, amount, currency'),
    admin.from('team_payouts').select('*').order('paid_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap: Record<string, string> = {}
  for (const u of authUsers ?? []) emailMap[u.id] = u.email ?? ''

  type PayoutRow = { id: string; member_id: string; amount: number; currency: string; description?: string; proof_url?: string; paid_at: string; created_at: string }
  let payouts = (payoutsRaw ?? []) as PayoutRow[]
  if (memberId) payouts = payouts.filter(p => p.member_id === memberId)
  if (from || to) payouts = payouts.filter(p => inRange(p.paid_at, from, to))

  const earnedByUser: Record<string, number> = {}
  const currencyByUser: Record<string, string> = {}
  for (const e of earnings ?? []) {
    earnedByUser[e.user_id] = (earnedByUser[e.user_id] ?? 0) + Number(e.amount)
    if (e.currency) currencyByUser[e.user_id] = e.currency
  }

  const paidByUser: Record<string, number> = {}
  for (const p of (payoutsRaw ?? []) as PayoutRow[]) {
    paidByUser[p.member_id] = (paidByUser[p.member_id] ?? 0) + Number(p.amount)
  }

  const members = (profiles ?? []).map(p => {
    const earned = earnedByUser[p.id] ?? 0
    const paid   = paidByUser[p.id] ?? 0
    return {
      id:       p.id,
      name:     p.display_name ?? emailMap[p.id] ?? 'Unknown',
      role:     p.role,
      earned,
      paid,
      pending:  Math.max(0, earned - paid),
      currency: currencyByUser[p.id] ?? 'AED',
    }
  })

  const nameMap = Object.fromEntries(members.map(m => [m.id, m.name]))

  const payoutList = payouts.map(p => ({
    ...p,
    member_name: nameMap[p.member_id] ?? 'Unknown',
  }))

  const monthPaid = payouts.reduce((s, p) => s + Number(p.amount), 0)
  const totalEarned  = members.reduce((s, m) => s + m.earned, 0)
  const totalPaid    = members.reduce((s, m) => s + m.paid, 0)
  const totalPending = members.reduce((s, m) => s + m.pending, 0)

  return NextResponse.json({
    members,
    payouts: payoutList,
    totals: {
      earned:      totalEarned,
      paid:        totalPaid,
      pending:     totalPending,
      periodPaid:  monthPaid,
      payoutCount: payouts.length,
    },
  })
}
