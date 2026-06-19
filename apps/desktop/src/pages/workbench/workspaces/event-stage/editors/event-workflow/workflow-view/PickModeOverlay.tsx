// Pick Mode 视觉反馈覆盖层

import { Check, MousePointerClick, RotateCcw, X } from 'lucide-react'
import { cx } from '@shared/lib/cx'

export type PickModeOverlayProps = {
  active: boolean
  label?: string
  completeLabel?: string
  clearLabel?: string
  cancelLabel?: string
  onComplete?: () => void
  onClear?: () => void
  onCancel?: () => void
  className?: string
}

export function PickModeOverlay({
  active,
  label,
  completeLabel = '完成',
  clearLabel = '清空',
  cancelLabel = '取消',
  onComplete,
  onClear,
  onCancel,
  className,
}: PickModeOverlayProps) {
  if (!active) return null

  return (
    <div className={cx('pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-3', className)} data-pick-mode-overlay>
      <div
        className="pointer-events-auto flex max-w-[min(560px,calc(100%-1rem))] flex-wrap items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,transparent)] px-2 py-1.5 shadow-(--shadow-panel)"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]">
          <MousePointerClick className="h-3.5 w-3.5 text-(--accent)" />
        </div>
        <p className="max-w-72 truncate text-xs font-semibold text-(--text-primary)">{label ?? '点击地图选择位置'}</p>
        {onComplete || onClear || onCancel ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {onComplete ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onComplete}>
                <Check className="h-3.5 w-3.5" />
                <span>{completeLabel}</span>
              </button>
            ) : null}
            {onClear ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onClear}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{clearLabel}</span>
              </button>
            ) : null}
            {onCancel ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onCancel}>
                <X className="h-3.5 w-3.5" />
                <span>{cancelLabel}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="text-[11px] text-(--text-secondary)">Esc</p>
      </div>
    </div>
  )
}
