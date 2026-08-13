import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { MapViewport, type MapDocument } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

type WarpDestinationLoadState =
  | { status: 'loading'; document: null; error: null }
  | { status: 'ready'; document: MapDocument; error: null }
  | { status: 'error'; document: null; error: string }

/**
 * Large preview of a warp target map with a click-to-pick landing cell. Loads
 * the target document through `loadTargetDocument` (loading/error states are
 * rendered in place) and reports the picked tile via `onPick`. Shared by the
 * patch-editor warp form and the map-card warp dialog so both pick destinations
 * the same way.
 */
export function WarpDestinationPointPicker({
  target,
  locale,
  theme,
  accentColor,
  loadTargetDocument,
  onPick,
}: {
  /** Target map to preview (a CP target like "Maps/Town" or a relative path). */
  target: string
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  /** Loads the target map document; must reject when the target is unreadable. */
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onPick: (x: number, y: number) => void
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const [state, setState] = useState<WarpDestinationLoadState>({ status: 'loading', document: null, error: null })

  useEffect(() => {
    let current = true
    setState({ status: 'loading', document: null, error: null })
    void loadTargetDocument(target)
      .then((document) => {
        if (current) setState({ status: 'ready', document, error: null })
      })
      .catch((error: unknown) => {
        if (current) setState({ status: 'error', document: null, error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      current = false
    }
  }, [loadTargetDocument, target])

  return (
    <section className="map-warp-destination-picker">
      <header>
        <strong>{copy.destinationPreview(target)}</strong>
        <span>{copy.pickWarpDestinationHint}</span>
      </header>
      {state.status === 'ready' ? (
        <MapViewport
          locale={locale}
          mapDocument={state.document}
          visibleLayerIds={state.document.layers.map((layer) => layer.id)}
          visibleObjectGroupIds={state.document.objectGroups.map((group) => group.id)}
          includeHiddenLayers={state.document.layers.every((layer) => !layer.visible)}
          theme={theme}
          accentColor={accentColor}
          showGrid
          showStatsChips={false}
          contextMenuEnabled={false}
          onTileClick={onPick}
          selectedTileRect={null}
        />
      ) : (
        <div className={cx('map-warp-destination-state', state.status === 'error' && 'is-error')}>
          {state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
          <span>{state.status === 'loading' ? copy.loadingMap : state.error}</span>
        </div>
      )}
    </section>
  )
}
