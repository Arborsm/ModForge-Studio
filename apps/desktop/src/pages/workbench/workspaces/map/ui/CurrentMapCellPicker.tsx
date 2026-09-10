import { useRef, useState } from 'react'
import { MapViewport, ViewportZoomToolbar, type MapDocument, type MapTileRect, type MapViewportHandle } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'

type CurrentMapCellPickerProps = {
  /**
   * Map to render and pick on. Callers pass the render document (tileset
   * image paths loadable as data URLs) so the viewport can draw tiles.
   */
  document: MapDocument
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  /** Reports the tile clicked on the map; unused while `onPickRect` is set. */
  onPick?: (tileX: number, tileY: number) => void
  /**
   * Enables left-drag rectangle selection (a plain click reports a 1x1
   * rect) and receives the committed bounds. Replaces click picking.
   */
  onPickRect?: (rect: MapTileRect) => void
  /** Cell drawn as a one-tile selection rect; null clears the selection. */
  selectedCell: { x: number; y: number } | null
  /** Selected rectangle drawn on the map; takes precedence over `selectedCell`. */
  selectedRect?: MapTileRect | null
  /** Existing swap rectangles framed as inspector highlights; empty or omitted clears them. */
  highlightRects?: readonly MapTileRect[]
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves them blank. */
  gameRootPath?: string | null
}

/**
 * Read-only click-to-pick viewport over the map being edited: every layer and
 * object group stays visible, the grid is on, stats chips and the context
 * menu are off, and tile clicks report through `onPick` (or rectangle drags
 * through `onPickRect`). The shared zoom toolbar floats at the bottom-right
 * corner. Used by dialogs that pick a cell on the current map (warp, door,
 * day/night studio).
 */
export function CurrentMapCellPicker({
  document: mapDocument,
  locale,
  theme,
  accentColor,
  onPick,
  onPickRect,
  selectedCell,
  selectedRect = null,
  highlightRects,
  gameRootPath = null,
}: CurrentMapCellPickerProps) {
  const viewportRef = useRef<MapViewportHandle | null>(null)
  const [zoom, setZoom] = useState(1)
  const selectionRect = selectedRect ?? (selectedCell ? { x: selectedCell.x, y: selectedCell.y, width: 1, height: 1 } : null)
  return (
    <div className="map-cell-picker">
      <MapViewport
        ref={viewportRef}
        mapState={{
          mapDocument,
          visibleLayerIds: mapDocument.layers.map((layer) => layer.id),
          visibleObjectGroupIds: mapDocument.objectGroups.map((group) => group.id),
        }}
        display={{
          locale,
          theme,
          accentColor,
          showGrid: true,
          showStatsChips: false,
        }}
        lighting={{ gameRootPath }}
        contextMenu={{ enabled: false }}
        actions={
          onPickRect
            ? { onTileRectSelect: onPickRect, onZoomChange: (nextZoom) => setZoom(nextZoom) }
            : { onTileClick: onPick, onZoomChange: (nextZoom) => setZoom(nextZoom) }
        }
        editing={{
          selectedTileRect: selectionRect,
          inspectorHighlight: highlightRects?.length ? { tileRects: [...highlightRects], objectIds: [] } : null,
        }}
      />
      <ViewportZoomToolbar
        zoom={zoom}
        onZoomOut={() => viewportRef.current?.zoomOut()}
        onZoomIn={() => viewportRef.current?.zoomIn()}
        onOneToOne={() => viewportRef.current?.setOneToOne()}
        onFit={() => viewportRef.current?.fitToScreen()}
      />
    </div>
  )
}
