export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { computePeriodPnL } from '@/lib/pnl'

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
  const now = new Date()
  const ytdFrom = `${now.getFullYear()}-01-01`
  const ytdTo   = now.toISOString().split('T')[0]
  const periodFrom = from ?? ytdFrom
  const periodTo   = to ?? ytdTo

  const [
    { data: profiles },
    { data: allProfiles },
    { data: earnings },
    { data: payoutsRaw },
    { data: settings },
    { data: { users: authUsers } },
    periodPnL,
    ytdPnL,
  ] = await Promise.all([
    admin.from('profiles').select('id, role, display_name').in('role', TEAM_ROLES).order('display_name'),
    admin.from('profiles').select('id, role, display_name').order('display_name'),
    admin.from('earnings').select('user_id, amount, currency'),
    admin.from('team_payouts').select('*').order('paid_at', { ascending: false }),
    admin.from('financial_settings').select('*').eq('id', 1).single(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    computePeriodPnL(admin, periodFrom, periodTo),
    computePeriodPnL(admin, ytdFrom, ytdTo),
  ])

  const emailMap: Record<string, string> = {}
  const nameById: Record<string, string> = {}
  for (const u of authUsers ?? []) emailMap[u.id] = u.email ?? ''
  for (const p of allProfiles ?? []) {
    nameById[p.id] = p.display_name ?? emailMap[p.id] ?? 'Unknown'
  }

  type PayoutRow = {
    id: string; member_id: string; amount: number; currency: string
    description?: string; proof_url?: string; paid_at: string; created_at: string
    payout_type?: string
  }
  const allPayouts = (payoutsRaw ?? []) as PayoutRow[]

  // Team salary payouts only for team members section
  const teamSalaryAll = allPayouts.filter(p => (p.payout_type ?? 'team_salary') !== 'partner_draw')
  let periodTeamPayouts = teamSalaryAll
  if (memberId) periodTeamPayouts = periodTeamPayouts.filter(p => p.member_id === memberId)
  if (from || to) periodTeamPayouts = periodTeamPayouts.filter(p => inRange(p.paid_at, from, to))

  const earnedByUser: Record<string, number> = {}
  const currencyByUser: Record<string, string> = {}
  for (const e of earnings ?? []) {
    earnedByUser[e.user_id] = (earnedByUser[e.user_id] ?? 0) + Number(e.amount)
    if (e.currency) currencyByUser[e.user_id] = e.currency
  }

  const paidByUser: Record<string, number> = {}
  for (const p of teamSalaryAll) {
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

  for (const m of members) nameById[m.id] = m.name

  // Partner draws
  const partnerDrawsAll = allPayouts.filter(p => p.payout_type === 'partner_draw')
  const drawsByUserAll: Record<string, number> = {}
  const drawsByUserPeriod: Record<string, number> = {}
  for (const p of partnerDrawsAll) {
    drawsByUserAll[p.member_id] = (drawsByUserAll[p.member_id] ?? 0) + Number(p.amount)
    if (inRange(p.paid_at, periodFrom, periodTo)) {
      drawsByUserPeriod[p.member_id] = (drawsByUserPeriod[p.member_id] ?? 0) + Number(p.amount)
    }
  }

  const partnerSlots = [
    { slot: 1 as const, name: settings?.partner1_name ?? 'Partner 1', share: Number(settings?.partner1_share ?? 20), user_id: settings?.partner1_user_id ?? null },
    { slot: 2 as const, name: settings?.partner2_name ?? 'Partner 2', share: Number(settings?.partner2_share ?? 30), user_id: settings?.partner2_user_id ?? null },
    { slot: 3 as const, name: settings?.partner3_name ?? 'Partner 3', share: Number(settings?.partner3_share ?? 50), user_id: settings?.partner3_user_id ?? null },
  ]

  const partners = partnerSlots.map(p => {
    const periodShare = periodPnL.netProfit * (p.share / 100)
    const ytdShare    = ytdPnL.netProfit * (p.share / 100)
    const periodReceived = p.user_id ? (drawsByUserPeriod[p.user_id] ?? 0) : 0
    const totalReceived  = p.user_id ? (drawsByUserAll[p.user_id] ?? 0) : 0
    return {
      slot: p.slot,
      name: p.user_id ? (nameById[p.user_id] ?? p.name) : p.name,
      share: p.share,
      user_id: p.user_id,
      periodShare,
      periodReceived,
      periodRemaining: periodShare - periodReceived,
      totalReceived,
      ytdShare,
      balance: ytdShare - totalReceived,
      currency: 'AED',
    }
  })

  // Combined payout history for the period (team + partner)
  let history = allPayouts
  if (memberId) history = history.filter(p => p.member_id === memberId)
  if (from || to) history = history.filter(p => inRange(p.paid_at, from, to))

  const payoutList = history.map(p => ({
    ...p,
    payout_type: p.payout_type ?? 'team_salary',
    member_name: nameById[p.member_id] ?? 'Unknown',
  }))

  const users = (allProfiles ?? []).map(p => ({
    id:   p.id,
    name: p.display_name ?? emailMap[p.id] ?? 'Unknown',
    role: p.role,
  }))

  return NextResponse.json({
    members,
    partners,
    payouts: payoutList,
    users,
    pnl: {
      period: periodPnL,
      ytd:    ytdPnL,
    },
    totals: {
      earned:      members.reduce((s, m) => s + m.earned, 0),
      paid:        members.reduce((s, m) => s + m.paid, 0),
      pending:     members.reduce((s, m) => s + m.pending, 0),
      periodPaid:  periodTeamPayouts.reduce((s, p) => s + Number(p.amount), 0),
      periodPartnerDraws: Object.values(drawsByUserPeriod).reduce((s, n) => s + n, 0),
      payoutCount: payoutList.length,
    },
  })
}
