import { ArrowDown, ArrowUp, CopyPlus, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react'
import { MapLayerThumbnail, type MapDocument, type MapLayer } from '@entities/map'
import type { LocaleCode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapEditorCapabilities } from './useMapDocumentEditor'

/**
 * Layer list for the map editor. Rows are pure view controls; every mutation
 * is routed through the `on*` callbacks so the parent owns the document
 * update, selection, and inspector state transitions.
 */
export function MapAssetEditorLayersPanel({
  document,
  renderDocument,
  locale,
  activeLayer,
  lockedLayerIds,
  capabilities,
  onUpdateDocument,
  onToggleLayerLocked,
  onActivateLayer,
  onAddLayer,
  onDuplicateLayer,
  onRequestDeleteLayer,
  onMoveLayer,
}: {
  /** Raw document backing every mutation; layers/objects are read from it. */
  document: MapDocument
  /** Render document with loadable tileset imagePath values (data URLs); only used for layer thumbnails. */
  renderDocument: MapDocument
  /** Locale used for tileset image resolution inside layer thumbnails. */
  locale: LocaleCode
  activeLayer: MapLayer | null
  lockedLayerIds: ReadonlySet<number>
  capabilities: MapEditorCapabilities
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  onToggleLayerLocked: (layerId: number) => void
  onActivateLayer: (layerId: number) => void
  onAddLayer: () => void
  onDuplicateLayer: () => void
  onRequestDeleteLayer: () => void
  onMoveLayer: (layerId: number, offset: -1 | 1) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  return (
    <aside className="map-asset-layers">
      <section className="map-asset-layer-section">
        <header>
          <strong>{copy.layers}</strong>
          <span>{document.layers.length}</span>
          {capabilities.layerManagement ? (
            <button type="button" className="icon-button" aria-label={copy.addLayer} title={copy.addLayer} onClick={onAddLayer}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </header>
        <div>
          {[...document.layers].reverse().map((layer) => {
            const locked = lockedLayerIds.has(layer.id)
            return (
              <div key={layer.id} className={cx('map-asset-layer-row', activeLayer?.id === layer.id && 'is-active')}>
                <button
                  type="button"
                  className={cx('icon-button', !layer.visible && 'is-always-visible')}
                  aria-label={layer.visible ? copy.hideLayer : copy.showLayer}
                  title={layer.visible ? copy.hideLayer : copy.showLayer}
                  onClick={() =>
                    onUpdateDocument(
                      {
                        ...document,
                        layers: document.layers.map((candidate) =>
                          candidate.id === layer.id ? { ...candidate, visible: !candidate.visible } : candidate,
                        ),
                      },
                      null,
                      layer.visible ? copy.hideLayer : copy.showLayer,
                    )
                  }
                >
                  {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button type="button" className="map-asset-layer-name" onClick={() => onActivateLayer(layer.id)}>
                  <span className="map-asset-layer-preview">
                    <MapLayerThumbnail document={renderDocument} layer={layer} locale={locale} />
                  </span>
                  <span className="map-asset-layer-meta">
                    <strong>{layer.name}</strong>
                    <small>{copy.layerTileCount(layer.nonEmptyTiles)}</small>
                  </span>
                </button>
                <span className={cx('map-asset-layer-opacity', layer.opacity !== 1 && 'is-always-visible')}>
                  {Math.round(layer.opacity * 100)}%
                </span>
                {capabilities.layerManagement ? (
                  <button
                    type="button"
                    className={cx('icon-button', locked && 'is-always-visible')}
                    aria-label={locked ? copy.unlockLayer : copy.lockLayer}
                    title={locked ? copy.unlockLayer : copy.lockLayer}
                    onClick={() => onToggleLayerLocked(layer.id)}
                  >
                    {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
      {capabilities.layerManagement ? (
        <footer className="map-asset-layer-toolbar">
          <button
            type="button"
            className="icon-button"
            aria-label={copy.duplicateLayer}
            title={copy.duplicateLayer}
            disabled={!activeLayer}
            onClick={onDuplicateLayer}
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button is-danger"
            aria-label={copy.deleteLayer}
            title={copy.deleteLayer}
            disabled={!activeLayer || document.layers.length <= 1}
            onClick={onRequestDeleteLayer}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <span />
          <button
            type="button"
            className="icon-button"
            aria-label={copy.moveLayerUp}
            title={copy.moveLayerUp}
            disabled={!activeLayer || document.layers.findIndex((layer) => layer.id === activeLayer.id) === document.layers.length - 1}
            onClick={() => activeLayer && onMoveLayer(activeLayer.id, 1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.moveLayerDown}
            title={copy.moveLayerDown}
            disabled={!activeLayer || document.layers.findIndex((layer) => layer.id === activeLayer.id) === 0}
            onClick={() => activeLayer && onMoveLayer(activeLayer.id, -1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </footer>
      ) : null}
    </aside>
  )
}
