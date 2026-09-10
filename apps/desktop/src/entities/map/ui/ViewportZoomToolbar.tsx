import { Maximize, Minus, Plus } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

/**
 * Shared floating zoom toolbar (minus / percent / plus / fit) used by the
 * map canvas pickers and the tilesheet canvas. Renders the
 * `map-sheet-canvas-toolbar` pill; the parent container must be positioned
 * (the pill anchors itself bottom-right). Pointer events are stopped so
 * canvas pan/drag gestures do not fire while interacting with the toolbar.
 */
export function ViewportZoomToolbar({
  zoom,
  minZoom,
  maxZoom,
  onZoomOut,
  onZoomIn,
  onOneToOne,
  onFit,
  className,
}: {
  /** Current zoom factor, shown as a percentage; the percent button resets to 1:1. */
  zoom: number
  /** Disables zoom-out at or below this factor; omit to keep the button enabled. */
  minZoom?: number
  /** Disables zoom-in at or above this factor; omit to keep the button enabled. */
  maxZoom?: number
  onZoomOut: () => void
  onZoomIn: () => void
  /** Resets to 100% (callers may also re-fit afterwards). */
  onOneToOne: () => void
  onFit: () => void
  className?: string
}) {
  const editorCopy = useEditorCopy()
  const viewportLabels = editorCopy.viewportLabels
  const fitLabel = editorCopy.mapAuthoring.assetEditor.fitToScreen
  return (
    <div
      className={cx('map-sheet-canvas-toolbar', className)}
      role="group"
      aria-label={viewportLabels.zoomLabel(zoom)}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="map-sheet-canvas-toolbar-btn"
        aria-label={viewportLabels.zoomOut}
        title={viewportLabels.zoomOut}
        disabled={minZoom != null && zoom <= minZoom}
        onClick={onZoomOut}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="map-sheet-canvas-toolbar-value"
        aria-label={viewportLabels.setOneToOne}
        title={viewportLabels.setOneToOne}
        onClick={onOneToOne}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="map-sheet-canvas-toolbar-btn"
        aria-label={viewportLabels.zoomIn}
        title={viewportLabels.zoomIn}
        disabled={maxZoom != null && zoom >= maxZoom}
        onClick={onZoomIn}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="map-sheet-canvas-toolbar-sep" aria-hidden="true" />
      <button type="button" className="map-sheet-canvas-toolbar-btn" aria-label={fitLabel} title={fitLabel} onClick={onFit}>
        <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
