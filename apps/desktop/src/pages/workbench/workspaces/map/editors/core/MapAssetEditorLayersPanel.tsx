import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowDown, ArrowUp, CopyPlus, Eye, EyeOff, Grid3X3, Lock, Plus, Trash2, Unlock } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { MapLayerThumbnail, type MapDocument, type MapLayer } from '@entities/map'
import type { LocaleCode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapEditorCapabilities } from './useMapDocumentEditor'

/**
 * Reads the already-rendered inline thumbnail <img> src for the hovered layer
 * row and mirrors it in the popover. This avoids re-mounting MapLayerThumbnail
 * (which would re-load tileset images asynchronously) — the popover shows
 * instantly because the inline thumbnail is already rasterized. A
 * MutationObserver watches the row for the img element to appear (the inline
 * thumbnail loads asynchronously), so the popover syncs once it's ready.
 */
function HoverPreviewImage({ containerRef, layerId }: { containerRef: RefObject<HTMLDivElement | null>; layerId: number | null }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (layerId === null) {
      setSrc(null)
      return
    }
    const container = containerRef.current
    if (!container) return

    function readImg() {
      const row = container!.querySelector<HTMLDivElement>(`[data-layer-id="${layerId}"]`)
      const img = row?.querySelector<HTMLImageElement>('img.map-asset-layer-thumbnail')
      setSrc(img?.src ?? null)
    }

    readImg()
    const observer = new MutationObserver(readImg)
    const row = container.querySelector<HTMLDivElement>(`[data-layer-id="${layerId}"]`)
    if (row) observer.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    return () => observer.disconnect()
  }, [containerRef, layerId])

  if (src) {
    return <img className="map-asset-layer-thumbnail" src={src} alt="" draggable={false} />
  }
  return <Grid3X3 className="h-3.5 w-3.5" />
}

/**
 * Layer list for the map editor. Rows support inline rename (double-click),
 * inline opacity (hover slider), hover thumbnail preview, and a right-click
 * context menu. Every mutation is routed through the `on*` callbacks so the
 * parent owns the document update, selection, and inspector state transitions.
 */
export function MapAssetEditorLayersPanel({
  document,
  renderDocument,
  locale,
  gameRootPath,
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
  onLocateLayer,
}: {
  /** Raw document backing every mutation; layers/objects are read from it. */
  document: MapDocument
  /** Render document with loadable tileset imagePath values (data URLs); only used for layer thumbnails. */
  renderDocument: MapDocument
  /** Locale used for tileset image resolution inside layer thumbnails. */
  locale: LocaleCode
  /** Game root used to resolve dynamically referenced vanilla sheets; null disables their images. */
  gameRootPath?: string | null
  activeLayer: MapLayer | null
  lockedLayerIds: ReadonlySet<number>
  capabilities: MapEditorCapabilities
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  onToggleLayerLocked: (layerId: number) => void
  onActivateLayer: (layerId: number) => void
  /** Layer management callbacks; only invoked when `capabilities.layerManagement` is true. */
  onAddLayer?: () => void
  onDuplicateLayer?: () => void
  onRequestDeleteLayer?: () => void
  onMoveLayer?: (layerId: number, offset: -1 | 1) => void
  /** Centers the canvas on the active layer's selected tile; optional. */
  onLocateLayer?: (layerId: number) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  const [editingLayerId, setEditingLayerId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [hoverPreviewId, setHoverPreviewId] = useState<number | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (editingLayerId !== null) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [editingLayerId])

  /** Checks whether a candidate layer name would create a duplicate or empty issue. */
  function validateLayerName(name: string, layerId: number): string | null {
    const trimmed = name.trim()
    if (trimmed === '') return copy.emptyLayerName(layerId)
    const isDuplicate = document.layers.some((layer) => layer.id !== layerId && layer.name.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) return copy.duplicateLayerName(trimmed)
    return null
  }

  function commitRename(layerId: number) {
    const trimmed = editingName.trim()
    const target = document.layers.find((layer) => layer.id === layerId)
    if (!target || trimmed === target.name) {
      setEditingLayerId(null)
      return
    }
    const error = validateLayerName(trimmed, layerId)
    if (error) {
      // Don't commit on invalid; keep editing so the user can fix it.
      renameInputRef.current?.focus()
      return
    }
    onUpdateDocument(
      {
        ...document,
        layers: document.layers.map((layer) => (layer.id === layerId ? { ...layer, name: trimmed } : layer)),
      },
      `map-layer:${layerId}:rename`,
      copy.renameLayer,
    )
    setEditingLayerId(null)
  }

  function startRename(layer: MapLayer) {
    if (!capabilities.layerManagement) return
    setEditingName(layer.name)
    setEditingLayerId(layer.id)
  }

  return (
    <aside className="map-asset-layers" data-guide="map-layer-list">
      <section className="map-asset-layer-section">
        <header>
          <strong>{copy.layers}</strong>
          <span>{document.layers.length}</span>
          {capabilities.layerManagement ? (
            <button
              type="button"
              className="icon-button"
              aria-label={copy.addLayer}
              title={copy.addLayer}
              onClick={onAddLayer ?? undefined}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </header>
        <div ref={listRef}>
          {[...document.layers].reverse().map((layer) => {
            const locked = lockedLayerIds.has(layer.id)
            const isEditing = editingLayerId === layer.id
            const renameError = isEditing ? validateLayerName(editingName, layer.id) : null
            const layerContextMenu = capabilities.layerManagement ? (
              <ContextMenu.Portal>
                <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                  <ContextMenu.Item className="context-menu-item" onSelect={() => startRename(layer)}>
                    {copy.renameLayerAction}
                  </ContextMenu.Item>
                  <ContextMenu.Item className="context-menu-item" onSelect={() => onDuplicateLayer?.()}>
                    {copy.duplicateLayer}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item is-danger"
                    disabled={document.layers.length <= 1}
                    onSelect={() => {
                      onActivateLayer(layer.id)
                      onRequestDeleteLayer?.()
                    }}
                  >
                    {copy.deleteLayer}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="context-menu-separator" />
                  <ContextMenu.Item className="context-menu-item" onSelect={() => onMoveLayer?.(layer.id, 1)}>
                    {copy.moveLayerUp}
                  </ContextMenu.Item>
                  <ContextMenu.Item className="context-menu-item" onSelect={() => onMoveLayer?.(layer.id, -1)}>
                    {copy.moveLayerDown}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="context-menu-separator" />
                  <ContextMenu.Item className="context-menu-item" onSelect={() => onToggleLayerLocked(layer.id)}>
                    {locked ? copy.unlockLayer : copy.lockLayer}
                  </ContextMenu.Item>
                  {onLocateLayer ? (
                    <ContextMenu.Item className="context-menu-item" onSelect={() => onLocateLayer(layer.id)}>
                      {copy.locateLayer}
                    </ContextMenu.Item>
                  ) : null}
                </ContextMenu.Content>
              </ContextMenu.Portal>
            ) : null
            return (
              <ContextMenu.Root key={layer.id}>
                <ContextMenu.Trigger asChild>
                  <div
                    className={cx('map-asset-layer-row', activeLayer?.id === layer.id && 'is-active', renameError && 'has-error')}
                    data-layer-id={layer.id}
                    onPointerEnter={() => setHoverPreviewId(layer.id)}
                    onPointerLeave={() => setHoverPreviewId((current) => (current === layer.id ? null : current))}
                  >
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
                    <button
                      type="button"
                      className="map-asset-layer-name"
                      onClick={() => onActivateLayer(layer.id)}
                      onDoubleClick={() => startRename(layer)}
                      title={copy.layerPurposeHint(layer.name) ?? undefined}
                      disabled={isEditing}
                    >
                      <span className="map-asset-layer-preview">
                        <MapLayerThumbnail document={renderDocument} layer={layer} locale={locale} gameRootPath={gameRootPath} />
                      </span>
                      <span className="map-asset-layer-meta">
                        {isEditing ? (
                          <input
                            ref={renameInputRef}
                            className={cx('map-asset-layer-rename-input', renameError && 'is-invalid')}
                            value={editingName}
                            spellCheck={false}
                            title={renameError ?? undefined}
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                commitRename(layer.id)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setEditingLayerId(null)
                              }
                            }}
                            onBlur={() => commitRename(layer.id)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <strong>{layer.name}</strong>
                        )}
                        <small>{copy.layerTileCount(layer.nonEmptyTiles)}</small>
                      </span>
                    </button>
                    {isEditing ? null : (
                      <span className={cx('map-asset-layer-opacity', layer.opacity !== 1 && 'is-always-visible')}>
                        <input
                          className="map-asset-layer-opacity-slider"
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(layer.opacity * 100)}
                          aria-label={copy.layerOpacity}
                          title={`${Math.round(layer.opacity * 100)}%`}
                          onChange={(event) => {
                            const opacity = Number(event.target.value) / 100
                            onUpdateDocument(
                              {
                                ...document,
                                layers: document.layers.map((candidate) =>
                                  candidate.id === layer.id ? { ...candidate, opacity } : candidate,
                                ),
                              },
                              `map-layer:${layer.id}:opacity`,
                              copy.editLayerProperties,
                            )
                          }}
                        />
                        <span className="map-asset-layer-opacity-value">{Math.round(layer.opacity * 100)}</span>
                      </span>
                    )}
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
                </ContextMenu.Trigger>
                {layerContextMenu}
              </ContextMenu.Root>
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
            onClick={onDuplicateLayer ?? undefined}
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button is-danger"
            aria-label={copy.deleteLayer}
            title={copy.deleteLayer}
            disabled={!activeLayer || document.layers.length <= 1}
            onClick={onRequestDeleteLayer ?? undefined}
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
            onClick={() => activeLayer && onMoveLayer?.(activeLayer.id, 1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.moveLayerDown}
            title={copy.moveLayerDown}
            disabled={!activeLayer || document.layers.findIndex((layer) => layer.id === activeLayer.id) === 0}
            onClick={() => activeLayer && onMoveLayer?.(activeLayer.id, -1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </footer>
      ) : null}
      {/* Hover preview popover: mirrors the hovered row's already-rendered
          inline thumbnail img so there is no async re-load on hover. The
          popover reads the src from the row's <img> element via a ref scan,
          falling back to the placeholder icon when the thumbnail hasn't
          rasterized yet. */}
      {(() => {
        const hoverLayer = hoverPreviewId !== null ? (document.layers.find((layer) => layer.id === hoverPreviewId) ?? null) : null
        const visible = hoverLayer !== null && hoverLayer.nonEmptyTiles > 0
        return (
          <div
            className={cx('map-asset-layer-preview-pop', !visible && 'is-hidden')}
            role="img"
            aria-label={hoverLayer?.name ?? ''}
            aria-hidden={!visible}
          >
            {visible ? (
              <>
                <HoverPreviewImage containerRef={listRef} layerId={hoverPreviewId} />
                <span className="map-asset-layer-preview-pop-label">{hoverLayer!.name}</span>
              </>
            ) : null}
          </div>
        )
      })()}
    </aside>
  )
}
