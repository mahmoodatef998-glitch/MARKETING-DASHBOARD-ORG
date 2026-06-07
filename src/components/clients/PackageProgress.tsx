'use client'
import { CheckCircle2 } from 'lucide-react'
import type { ClientPackage } from '@/types'

const TYPE_COLOR: Record<string, string> = {
  reel_video: 'bg-purple-500',
  ai_video:   'bg-indigo-500',
  design:     'bg-blue-500',
}

export default function PackageProgress({ pkg }: { pkg: ClientPackage }) {
  if (pkg.items.length === 0) {
    const done  = pkg.total_done ?? 0
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-white">{pkg.name}</span>
          <span className="text-slate-400 text-xs">{done} tasks done</span>
        </div>
      </div>
    )
  }

  const totalUsed  = pkg.items.reduce((s, i) => s + (i.used ?? 0), 0)
  const totalQty   = pkg.items.reduce((s, i) => s + i.total_quantity, 0)
  const overallPct = totalQty > 0 ? Math.min(Math.round((totalUsed / totalQty) * 100), 100) : 0

  return (
    <div className="space-y-4">
      {/* Package name + overall */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white text-sm">{pkg.name}</span>
        <span className={`text-xs font-semibold ${overallPct >= 100 ? 'text-red-400' : overallPct >= 80 ? 'text-amber-400' : 'text-indigo-400'}`}>
          {overallPct}%
        </span>
      </div>

      {/* Overall bar */}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* Per-item rows */}
      <div className="space-y-3">
        {pkg.items.map(item => {
          const used = item.used ?? 0
          const pct  = item.total_quantity > 0 ? Math.min(Math.round((used / item.total_quantity) * 100), 100) : 0
          const barColor = TYPE_COLOR[item.task_type] ?? 'bg-slate-500'
          const done = used >= item.total_quantity && item.total_quantity > 0

          return (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  <span className={`text-xs truncate ${done ? 'text-emerald-400' : 'text-slate-300'}`}>{item.label}</span>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-2">
                  <span className={done ? 'text-emerald-400 font-semibold' : 'text-slate-300 font-semibold'}>{used}</span>
                  <span className="text-slate-600"> / {item.total_quantity}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
