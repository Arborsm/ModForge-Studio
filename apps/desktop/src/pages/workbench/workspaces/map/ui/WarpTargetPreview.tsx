import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { MapViewport, type MapDocument } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'

type WarpTargetPreviewState = { status: 'loading' } | { status: 'ready'; document: MapDocument } | { status: 'error'; message: string }

/**
 * Session-wide cache: warp rows repeat the same target maps heavily, so each
 * target document loads once per session. Failed loads are not cached and
 * retry on the next hover.
 */
const targetDocumentCache = new Map<string, Promise<MapDocument>>()

function loadTargetDocumentCached(target: string, loader: (target: string) => Promise<MapDocument>) {
  const cached = targetDocumentCache.get(target)
  if (cached) return cached
  const pending = loader(target).catch((error: unknown) => {
    targetDocumentCache.delete(target)
    throw error
  })
  targetDocumentCache.set(target, pending)
  return pending
}

/**
 * Compact read-only peek of a warp's target map with the landing cell marked:
 * a fitted mini viewport for the row hover popover. Loading and failure states
 * render in place; failures retry on the next mount.
 */
export function WarpTargetPreview({
  target,
  x,
  y,
  locale,
  theme,
  accentColor,
  loadTargetDocument,
}: {
  /** Target map to preview (a CP target like "Maps/Town" or a relative path). */
  target: string
  /** Landing cell marked on the preview. */
  x: number
  y: number
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  /** Loads the target map document; must reject when the target is unreadable. */
  loadTargetDocument: (target: string) => Promise<MapDocument>
}) {
  const [state, setState] = useState<WarpTargetPreviewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    loadTargetDocumentCached(target, loadTargetDocument)
      .then((document) => {
        if (current) setState({ status: 'ready', document })
      })
      .catch((error: unknown) => {
        if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      current = false
    }
  }, [loadTargetDocument, target])

  if (state.status !== 'ready') {
    return (
      <div className={`map-asset-warp-preview ${state.status === 'error' ? 'is-error' : 'is-loading'}`}>
        {state.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {state.status === 'error' ? <span>{state.message}</span> : null}
      </div>
    )
  }

  return (
    <div className="map-asset-warp-preview">
      <MapViewport
        mapState={{
          mapDocument: state.document,
          visibleLayerIds: state.document.layers.filter((layer) => layer.visible).map((layer) => layer.id),
          visibleObjectGroupIds: state.document.objectGroups.filter((group) => group.visible).map((group) => group.id),
        }}
        display={{ locale, theme, accentColor, showGrid: false, showStatsChips: false }}
        fit={{
          // Neighborhood view: center the viewport on the landing cell instead
          // of shrinking the whole target map into the peek box.
          initialZoom: 1.5,
          focusWorldPoint: {
            worldX: (x + 0.5) * state.document.tileWidth,
            worldY: (y + 0.5) * state.document.tileHeight,
          },
        }}
        contextMenu={{ enabled: false }}
        // The landing marker rides the inspector-highlight overlay: the
        // selected-tile-rect layer only renders when tile interaction is
        // enabled, which a read-only peek never is.
        editing={{ inspectorHighlight: { tileRects: [{ x, y, width: 1, height: 1 }], objectIds: [] } }}
      />
    </div>
  )
}
