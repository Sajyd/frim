'use client'

interface GpuUsageMeterProps {
  used: number
  included: number
  bonus?: number
  remaining: number
  compact?: boolean
}

export default function GpuUsageMeter({
  used,
  included,
  bonus = 0,
  remaining,
  compact = false,
}: GpuUsageMeterProps) {
  const limit = included + bonus
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const exhausted = remaining <= 0

  return (
    <div className={compact ? 'min-w-[220px]' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-3">
        <p className={`whitespace-nowrap shrink-0 ${compact ? 'text-[11px] leading-none text-[#71717a]' : 'text-xs text-dark-500'}`}>
          Studio 3D captures
        </p>
        <p className={`font-mono tabular-nums whitespace-nowrap shrink-0 ${compact ? 'text-xs leading-none' : 'text-sm'} ${exhausted ? 'text-amber-400' : 'text-frim-400'}`}>
          {used} / {limit}
        </p>
      </div>
      <div className={`bg-dark-800 rounded-full overflow-hidden ${compact ? 'h-1.5 mt-1.5' : 'h-2'}`}>
        <div
          className={`h-full rounded-full transition-all ${exhausted ? 'bg-amber-400' : 'bg-gradient-to-r from-frim-500 to-frim-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <p className="text-xs text-dark-500">
          {included} included this period
          {bonus > 0 ? ` · ${bonus} extra purchased` : ''}
          {' · '}
          {remaining} remaining
          {exhausted ? ' · then $1 per capture' : ''}
        </p>
      )}
    </div>
  )
}
