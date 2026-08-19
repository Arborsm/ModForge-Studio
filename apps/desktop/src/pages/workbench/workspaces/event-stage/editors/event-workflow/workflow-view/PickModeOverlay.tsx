/**
 * @file Pick Mode visual feedback overlay component.
 */

import { Check, MousePointerClick, RotateCcw, X } from 'lucide-react'
import { useEventStageCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

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
  completeLabel,
  clearLabel,
  cancelLabel,
  onComplete,
  onClear,
  onCancel,
  className,
}: PickModeOverlayProps) {
  const copy = useEventStageCopy()
  if (!active) return null

  return (
    <div className={cx('pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-3', className)} data-pick-mode-overlay>
      <div
        className="shadow-panel pointer-events-auto flex max-w-[min(560px,calc(100%-1rem))] flex-wrap items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,transparent)] px-2 py-1.5"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]">
          <MousePointerClick className="text-accent h-3.5 w-3.5" />
        </div>
        <p className="text-text-primary max-w-72 truncate text-xs font-semibold">{label ?? copy.clickMapToPick}</p>
        {onComplete || onClear || onCancel ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {onComplete ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onComplete}>
                <Check className="h-3.5 w-3.5" />
                <span>{completeLabel ?? copy.pickModeComplete}</span>
              </button>
            ) : null}
            {onClear ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onClear}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{clearLabel ?? copy.pickModeClear}</span>
              </button>
            ) : null}
            {onCancel ? (
              <button type="button" className="control-button h-7 text-xs" onClick={onCancel}>
                <X className="h-3.5 w-3.5" />
                <span>{cancelLabel ?? copy.pickModeCancel}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="text-text-secondary text-meta-px">Esc</p>
      </div>
    </div>
  )
}
