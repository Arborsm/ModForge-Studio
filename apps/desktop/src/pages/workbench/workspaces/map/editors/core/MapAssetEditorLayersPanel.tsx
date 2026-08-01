import { ArrowDown, ArrowUp, CopyPlus, Eye, EyeOff, Grid3X3, Lock, MousePointer2, PanelRightOpen, Plus, Trash2, Unlock } from 'lucide-react'
import type { MapDocument, MapLayer, MapObjectGroup } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { InspectorTab, MapEditorCapabilities } from './useMapDocumentEditor'

/**
 * Layer and object-group list for the map editor. Rows are pure view controls;
 * every mutation is routed through the `on*` callbacks so the parent owns the
 * document update, selection, and inspector state transitions.
 */
export function MapAssetEditorLayersPanel({
  document,
  assetPath,
  activeLayer,
  lockedLayerIds,
  selectedObjectGroup,
  inspectorTab,
  capabilities,
  onUpdateDocument,
  onToggleLayerLocked,
  onActivateLayer,
  onActivateObjectGroup,
  onAddLayer,
  onDuplicateLayer,
  onRequestDeleteLayer,
  onMoveLayer,
  onOpenMapInspector,
}: {
  document: MapDocument
  assetPath: string
  activeLayer: MapLayer | null
  lockedLayerIds: ReadonlySet<number>
  selectedObjectGroup: MapObjectGroup | null
  inspectorTab: InspectorTab | null
  capabilities: MapEditorCapabilities
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string) => void
  onToggleLayerLocked: (layerId: number) => void
  onActivateLayer: (layerId: number) => void
  onActivateObjectGroup: (groupId: number) => void
  onAddLayer: () => void
  onDuplicateLayer: () => void
  onRequestDeleteLayer: () => void
  onMoveLayer: (layerId: number, offset: -1 | 1) => void
  onOpenMapInspector: () => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  const editorShellCopy = useMapAuthoringCopy().editorShell
  return (
    <aside className="map-asset-layers">
      <section className="map-asset-document-summary">
        <header>
          <strong>{copy.documentSummary}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={editorShellCopy.openMapInspector}
            title={editorShellCopy.openMapInspector}
            onClick={onOpenMapInspector}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
        </header>
        <strong>{assetPath.split('/').at(-1) ?? document.name}</strong>
        <span>{assetPath}</span>
        <small>
          {copy.formatNames[assetPath.toLowerCase().endsWith('.tbin') ? 'tbin' : assetPath.toLowerCase().endsWith('.xnb') ? 'xnb' : 'tmx']}{' '}
          · {document.width} × {document.height} · {document.tilesets.length}
        </small>
      </section>
      <section className="map-asset-layer-section">
        <header>
          <strong>{copy.layers}</strong>
          <span>{document.layers.length}</span>
        </header>
        <div>
          {[...document.layers].reverse().map((layer) => {
            const locked = lockedLayerIds.has(layer.id)
            return (
              <div key={layer.id} className={cx('map-asset-layer-row', activeLayer?.id === layer.id && 'is-active')}>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={layer.visible ? copy.hideLayer : copy.showLayer}
                  title={layer.visible ? copy.hideLayer : copy.showLayer}
                  onClick={() =>
                    onUpdateDocument({
                      ...document,
                      layers: document.layers.map((candidate) =>
                        candidate.id === layer.id ? { ...candidate, visible: !candidate.visible } : candidate,
                      ),
                    })
                  }
                >
                  {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button type="button" className="map-asset-layer-name" onClick={() => onActivateLayer(layer.id)}>
                  <span className="map-asset-layer-preview">
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </span>
                  <span className="map-asset-layer-meta">
                    <strong>{layer.name}</strong>
                    <small>{layer.nonEmptyTiles}</small>
                  </span>
                </button>
                <span className="map-asset-layer-opacity">{Math.round(layer.opacity * 100)}%</span>
                {capabilities.layerManagement ? (
                  <button
                    type="button"
                    className="icon-button"
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
          {capabilities.objectGroups
            ? document.objectGroups.map((group) => (
                <div
                  key={`objects:${group.id}`}
                  className={cx(
                    'map-asset-layer-row map-asset-object-group-row',
                    selectedObjectGroup?.id === group.id && inspectorTab === 'objects' && 'is-active',
                  )}
                >
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={group.visible ? copy.hideLayer : copy.showLayer}
                    title={group.visible ? copy.hideLayer : copy.showLayer}
                    onClick={() =>
                      onUpdateDocument({
                        ...document,
                        objectGroups: document.objectGroups.map((candidate) =>
                          candidate.id === group.id ? { ...candidate, visible: !candidate.visible } : candidate,
                        ),
                      })
                    }
                  >
                    {group.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button type="button" className="map-asset-layer-name" onClick={() => onActivateObjectGroup(group.id)}>
                    <span className="map-asset-layer-preview">
                      <MousePointer2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="map-asset-layer-meta">
                      <strong>{group.name || `#${group.id}`}</strong>
                      <small>{group.objects.length}</small>
                    </span>
                  </button>
                  <span className="map-asset-layer-opacity">{Math.round(group.opacity * 100)}%</span>
                  <span />
                </div>
              ))
            : null}
        </div>
      </section>
      {capabilities.layerManagement ? (
        <footer className="map-asset-layer-toolbar">
          <button type="button" className="icon-button" aria-label={copy.addLayer} title={copy.addLayer} onClick={onAddLayer}>
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.addLayer}
            title={copy.addLayer}
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
