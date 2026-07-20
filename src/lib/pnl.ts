import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRevenueItems, inDateRange } from '@/lib/income'

export type PeriodPnL = {
  revenue: number
  designCost: number
  mediaBuyerCost: number
  operationalExpenses: number
  totalCosts: number
  netProfit: number
  designTaskCount: number
  activeClientCount: number
}

/** Distributable owner profit for a date range (cash revenue − execution − op-ex). */
export async function computePeriodPnL(
  adminDb: SupabaseClient,
  from: string,
  to: string,
): Promise<PeriodPnL> {
  const [
    revenueItems,
    { data: expenses },
    { data: settings },
    { data: designTasks },
    { data: activeClients },
  ] = await Promise.all([
    fetchRevenueItems(adminDb),
    adminDb.from('expenses').select('amount, date'),
    adminDb.from('financial_settings').select('*').eq('id', 1).single(),
    adminDb.from('tasks').select('id')
      .eq('task_type', 'design').eq('status', 'done')
      .gte('updated_at', from).lte('updated_at', to + 'T23:59:59Z')
      .is('deleted_at', null),
    adminDb.from('clients').select('id').eq('status', 'active').is('deleted_at', null),
  ])

  const revenue = revenueItems
    .filter(r => inDateRange(r.received_at, from, to))
    .reduce((s, r) => s + r.amount, 0)

  const operationalExpenses = ((expenses ?? []) as Array<{ amount: number; date: string }>)
    .filter(e => e.date >= from && e.date <= to)
    .reduce((s, e) => s + Number(e.amount), 0)

  const costPerDesign = Number(settings?.cost_per_design ?? 15)
  const mediaBuyerRate = Number(settings?.media_buyer_rate_per_client ?? 150)
  const designTaskCount = (designTasks ?? []).length
  const activeClientCount = (activeClients ?? []).length
  const designCost = designTaskCount * costPerDesign
  const mediaBuyerCost = activeClientCount * mediaBuyerRate
  const totalCosts = designCost + mediaBuyerCost + operationalExpenses

  return {
    revenue,
    designCost,
    mediaBuyerCost,
    operationalExpenses,
    totalCosts,
    netProfit: revenue - totalCosts,
    designTaskCount,
    activeClientCount,
  }
}
