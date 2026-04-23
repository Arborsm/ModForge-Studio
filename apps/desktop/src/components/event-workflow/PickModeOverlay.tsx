// components/event-workflow/PickModeOverlay.tsx
// Pick Mode 视觉反馈覆盖层

import { MousePointerClick } from 'lucide-react'
import { cx } from '../../lib/cx'

export type PickModeOverlayProps = {
  active: boolean
  label?: string
  className?: string
}

export function PickModeOverlay({ active, label, className }: PickModeOverlayProps) {
  if (!active) return null

  return (
    <div
      className={cx(
        'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-panel)_92%)] px-6 py-4 shadow-lg"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]"
        >
          <MousePointerClick className="h-5 w-5 text-[var(--text-inverse)]" />
        </div>
        <p className="text-sm font-semibold text-[var(--accent)]"
        >
          {label ?? '点击地图选择位置'}
        </p>
        <p className="text-xs text-[var(--text-secondary)]"
        >按 ESC 取消</p>
      </div>

      {/* Cursor highlight ring */}
      <div className="absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--accent)] opacity-50"
        >
          <div className="absolute inset-0 animate-ping rounded-full border border-[var(--accent)]" />
        </div>
      </div>
    </div>
  )
}
