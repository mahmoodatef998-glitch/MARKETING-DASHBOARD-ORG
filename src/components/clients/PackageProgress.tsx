'use client'
import { CalendarDays, DollarSign } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ClientPackage } from '@/types'

const TYPE_COLORS: Record<string, { gradient: string; dot: string }> = {
  reel_video: { gradient: 'from-purple-500 to-indigo-500', dot: 'bg-purple-500' },
  design:     { gradient: 'from-pink-500 to-rose-500',     dot: 'bg-pink-500'   },
  ai_video:   { gradient: 'from-cyan-500 to-blue-500',     dot: 'bg-cyan-500'   },
  post:       { gradient: 'from-green-500 to-emerald-500', dot: 'bg-green-500'  },
  custom:     { gradient: 'from-orange-500 to-amber-500',  dot: 'bg-orange-500' },
}

const R    = 50
const CIRC = 2 * Math.PI * R

export default function PackageProgress({ pkg }: { pkg: ClientPackage }) {
  const totalItems = pkg.items.reduce((s, i) => s + i.total_quantity, 0)
  // Use per-item usage if items are configured, otherwise fall back to total_done
  const totalUsed  = pkg.items.length > 0
    ? pkg.items.reduce((s, i) => s + (i.used ?? 0), 0)
    : (pkg.total_done ?? 0)
  const remaining  = totalItems > 0 ? Math.max(totalItems - totalUsed, 0) : 0
  const pct        = totalItems > 0 ? Math.round((totalUsed / totalItems) * 100) : 0
  const dashOffset = CIRC * (1 - pct / 100)
  const gradId     = `ring-${pkg.id.replace(/-/g, '')}`
  const activeItems = pkg.items.filter(item => item.total_quantity > 0)

  return (
    <div className="space-y-5">
      {/* Package header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold text-white">{pkg.name}</h3>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
            pkg.renewal_type === 'monthly'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}>
            {pkg.renewal_type === 'monthly' ? '↻ Monthly' : '⊙ One-Time'}
          </span>
          {pkg.is_active && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-semibold">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
          {pkg.price > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {formatCurrency(pkg.price)} / {pkg.renewal_type === 'monthly' ? 'month' : 'package'}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Since {formatDate(pkg.start_date)}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total',     value: totalItems > 0 ? totalItems : '—', color: 'text-slate-200'  },
          {
            label: 'Completed',
            value: pkg.total_done != null && pkg.total_done > totalUsed ? pkg.total_done : totalUsed,
            color: 'text-emerald-400',
          },
          { label: 'Remaining', value: remaining > 0 ? remaining : '—', color: 'text-amber-400'  },
          {
            label: 'Progress',
            value: totalItems > 0 ? `${pct}%` : `${pkg.total_done ?? 0} done`,
            color: pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-indigo-400',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
            <div className={`text-xl font-extrabold ${color}`}>{value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Ring + per-item bars */}
      <div className="flex gap-5 items-center">
        {/* Progress ring */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <svg viewBox="0 0 120 120" className="w-28 h-28">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={R} fill="none" stroke="#1e293b" strokeWidth="14" />
            <circle
              cx="60" cy="60" r={R}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="55" textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="system-ui">
              {pct}%
            </text>
            <text x="60" y="70" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="system-ui">
              complete
            </text>
          </svg>
          <p className="text-[11px] text-slate-500 text-center">
            {pkg.renewal_type === 'monthly' ? 'This month' : 'All time'}
          </p>
        </div>

        {/* Per-item progress bars */}
        <div className="flex-1 space-y-3 min-w-0">
          {activeItems.length === 0 && (
            <p className="text-sm text-slate-500 py-2">No deliverable items configured</p>
          )}
          {activeItems.map((item) => {
            const used     = item.used ?? 0
            const total    = item.total_quantity
            const itemPct  = total > 0 ? Math.round((used / total) * 100) : 0
            const rem      = Math.max(total - used, 0)
            const colors   = TYPE_COLORS[item.task_type] ?? TYPE_COLORS.custom

            return (
              <div key={item.id ?? `${item.task_type}-${item.sort_order}`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                    <span className="text-xs text-slate-300 truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-xs">
                    <span className="text-slate-500">{used}/{total}</span>
                    <span className={`font-bold w-8 text-right ${
                      itemPct >= 100 ? 'text-red-400' : itemPct >= 80 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {itemPct}%
                    </span>
                    <span className="text-slate-600 w-14 text-right">
                      {rem > 0 ? `${rem} left` : '✓ done'}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${colors.gradient}`}
                    style={{ width: `${Math.min(itemPct, 100)}%`, transition: 'width 0.7s ease' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {pkg.notes && (
        <p className="text-xs text-slate-500 bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
          {pkg.notes}
        </p>
      )}
    </div>
  )
}
