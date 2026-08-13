import { FlipHorizontal2, FlipVertical2, Maximize, Minus, Plus, RotateCw } from 'lucide-react'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

type MapCanvasZoomChipProps = {
  /** Effective viewport zoom (1 = 100%), including the fitted value while in fit mode. */
  zoom: number
  /** Whether the viewport is currently fitted to the whole map or manually zoomed. */
  mode: 'fit' | 'manual'
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  /** Whether the flip/rotate controls are available (capability + a selected cell). */
  transformsEnabled?: boolean
  /** Whether a canvas cell is selected so the transform buttons can act. */
  canTransform?: boolean
  onFlipHorizontal: () => void
  onFlipVertical: () => void
  onRotateClockwise: () => void
}

/**
 * Floating canvas zoom control: shrinks/grows the viewport zoom one step and
 * resets it to fit the whole map. The percentage is pure presentation; the
 * viewport itself owns zoom state and panning. When a cell is selected the
 * leading group applies the same flip/rotate transforms the cell inspector
 * offers, so transforms stay reachable without leaving the canvas.
 */
export function MapCanvasZoomChip({
  zoom,
  mode,
  onZoomIn,
  onZoomOut,
  onFit,
  transformsEnabled = false,
  canTransform = false,
  onFlipHorizontal,
  onFlipVertical,
  onRotateClockwise,
}: MapCanvasZoomChipProps) {
  const copy = useMapAuthoringCopy().assetEditor
  return (
    <div className="map-canvas-zoom-chip">
      {transformsEnabled ? (
        <>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.flipHorizontal}
            title={copy.flipHorizontal}
            disabled={!canTransform}
            onClick={onFlipHorizontal}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.flipVertical}
            title={copy.flipVertical}
            disabled={!canTransform}
            onClick={onFlipVertical}
          >
            <FlipVertical2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.rotateClockwise}
            title={copy.rotateClockwise}
            disabled={!canTransform}
            onClick={onRotateClockwise}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <span className="sep-v" aria-hidden="true" />
        </>
      ) : null}
      <button type="button" className="icon-button" aria-label={copy.zoomOut} title={copy.zoomOut} onClick={onZoomOut}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="map-canvas-zoom-chip-value">{Math.round(zoom * 100)}%</span>
      <button type="button" className="icon-button" aria-label={copy.zoomIn} title={copy.zoomIn} onClick={onZoomIn}>
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cx('icon-button', mode === 'fit' && 'is-active')}
        aria-label={copy.fitToScreen}
        title={copy.fitToScreen}
        aria-pressed={mode === 'fit'}
        onClick={onFit}
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
