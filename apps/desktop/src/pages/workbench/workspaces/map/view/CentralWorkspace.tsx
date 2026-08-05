import { Grid2x2, Grip, Map as MapIcon, Maximize, MousePointer2, Move, Pin, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EffectAssetState } from '@entities/event'
import { exportMapPng } from '@entities/game/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import type { StageWorldOverlaySprite } from '@entities/map'
import type { ThemeMode } from '@locales/api'
import type { MapDocument } from '@entities/map'
import type { FocusedMapObjectTarget, TileHoverInfo } from '@entities/map'
import { cx } from '@shared/lib/helper'
import { useNotificationPublisher } from '@shared/ui/notifications'
import { chooseSaveFile } from '@platform/host'
import { MapViewport, MapWorldStatePreviewOverlay, type MapViewportHandle } from '@entities/map'
import {
  deriveMapDocumentLighting,
  getLightingPreviewTimeOfDay,
  type GameSeason,
  type MapLightingPreviewMode,
  type ObjectLightItemIndex,
} from '@entities/map'
import { MapLightingPreviewControls } from '../ui/MapLightingPreviewControls'

type CentralWorkspaceProps = {
  tabs: Array<{
    id: string
    title: string
    pathLabel: string
    closable: boolean
    pinned?: boolean
  }>
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onReorderTabs: (sourceTabId: string, targetTabId: string) => void
  mapDocument: MapDocument | null
  worldAtlasViews: Array<{ id: 'main' | 'remote'; label: string }>
  activeWorldAtlasViewId: 'main' | 'remote' | null
  onSelectWorldAtlasView: (viewId: 'main' | 'remote') => void
  onOpenAtlasTarget: (targetMapName: string) => void
  theme: ThemeMode
  accentColor: string
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  focusedObjectTarget: FocusedMapObjectTarget | null
  showGameWorldAdditions: boolean
  onToggleGameWorldAdditions: () => void
  worldOverlaySprites: StageWorldOverlaySprite[]
  worldOverlayTextureAssets: Record<string, EffectAssetState>
  /** Item-data lookup enabling object-layer lamp/torch markers in the lighting preview. */
  objectLightIndex: ObjectLightItemIndex | null
  onHoverChange: (info: TileHoverInfo | null) => void
}

type ToolMode = 'select' | 'pan'

export default function CentralWorkspace({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  mapDocument,
  worldAtlasViews,
  activeWorldAtlasViewId,
  onSelectWorldAtlasView,
  onOpenAtlasTarget,
  theme,
  accentColor,
  visibleLayerIds,
  visibleObjectGroupIds,
  focusedObjectTarget,
  showGameWorldAdditions,
  onToggleGameWorldAdditions,
  worldOverlaySprites,
  worldOverlayTextureAssets,
  objectLightIndex,
  onHoverChange,
}: CentralWorkspaceProps) {
  const locale = useLocale()
  const copy = useEditorCopy()
  const publishNotification = useNotificationPublisher()
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [showGrid, setShowGrid] = useState(true)
  const [lightingMode, setLightingMode] = useState<MapLightingPreviewMode>('day')
  const [lightingSeason, setLightingSeason] = useState<GameSeason>('spring')
  const [zoomLabel, setZoomLabel] = useState('100%')
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null)
  const viewportRef = useRef<MapViewportHandle | null>(null)

  useLayoutEffect(() => {
    if (!focusedObjectTarget) {
      return
    }

    viewportRef.current?.focusObject(focusedObjectTarget)
  }, [focusedObjectTarget])

  const mapOverlay = useMemo(() => {
    if (!showGameWorldAdditions || !mapDocument) {
      return null
    }

    return (
      <MapWorldStatePreviewOverlay
        mapDocument={mapDocument}
        viewportZoom={1}
        sprites={worldOverlaySprites}
        textureAssets={worldOverlayTextureAssets}
      />
    )
  }, [mapDocument, showGameWorldAdditions, worldOverlaySprites, worldOverlayTextureAssets])
  const worldLighting = useMemo(
    () =>
      mapDocument
        ? deriveMapDocumentLighting(mapDocument, getLightingPreviewTimeOfDay(lightingMode, lightingSeason), lightingSeason, {
            objectLightIndex,
          })
        : null,
    [lightingMode, lightingSeason, mapDocument, objectLightIndex],
  )
  const previewGameWorldAdditionsLabel = copy.center.previewGameWorldAdditions
  const hideGameWorldAdditionsLabel = copy.center.hideGameWorldAdditions
  const gridToggleLabel = showGrid ? copy.center.hideGrid : copy.center.showGrid
  const exportMapPngAtFullSize = useCallback(async () => {
    if (!mapDocument) {
      return
    }

    const mapName =
      mapDocument.name
        .trim()
        .replace(/[^a-z0-9_-]+/giu, '_')
        .replace(/^_+|_+$/gu, '') || 'map'
    try {
      const outputPath = await chooseSaveFile({
        title: copy.viewportLabels.exportPngDialogTitle,
        defaultPath: `${mapName}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      })
      if (!outputPath) {
        return
      }
      const pngBase64 = await viewportRef.current?.exportPng()
      if (!pngBase64) {
        throw new Error(copy.viewportLabels.failedToExportPng)
      }
      await exportMapPng(outputPath, pngBase64)
      publishNotification({
        level: 'success',
        title: copy.viewportLabels.exportPngSuccess(outputPath),
      })
    } catch (error) {
      publishNotification({
        level: 'error',
        title: copy.viewportLabels.failedToExportPng,
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }, [copy.viewportLabels, mapDocument, publishNotification])

  return (
    <div className="bg-surface-viewport rounded-panel flex h-full flex-col overflow-hidden">
      <div className="border-border-subtle/55 flex h-10 items-end gap-1 overflow-x-auto border-b bg-[color-mix(in_srgb,var(--bg-panel)_88%,var(--bg-viewport))] px-2">
        <div className="flex min-w-0 flex-1 items-end gap-1">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id
            const isDragged = draggedTabId === tab.id
            const isDropTarget = dropTargetTabId === tab.id && draggedTabId !== tab.id

            return (
              <div
                key={tab.id}
                draggable={tab.closable}
                className={cx(
                  'group flex h-9 shrink-0 items-center gap-2 rounded-t-lg border-x border-t px-3 text-xs transition-colors',
                  isActive
                    ? 'border-border-subtle bg-surface-panel text-text-primary shadow-[inset_0_-2px_0_0_var(--accent)]'
                    : 'border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  isDragged && 'opacity-50',
                  isDropTarget && 'border-accent',
                )}
                onDragStart={(event) => {
                  if (!tab.closable) {
                    return
                  }

                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', tab.id)
                  setDraggedTabId(tab.id)
                }}
                onDragOver={(event) => {
                  if (!draggedTabId || draggedTabId === tab.id || !tab.closable) {
                    return
                  }

                  event.preventDefault()
                  if (dropTargetTabId !== tab.id) {
                    setDropTargetTabId(tab.id)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceTabId = event.dataTransfer.getData('text/plain') || draggedTabId
                  if (sourceTabId && sourceTabId !== tab.id) {
                    onReorderTabs(sourceTabId, tab.id)
                  }

                  setDraggedTabId(null)
                  setDropTargetTabId(null)
                }}
                onDragEnd={() => {
                  setDraggedTabId(null)
                  setDropTargetTabId(null)
                }}
              >
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={() => onSelectTab(tab.id)}>
                  {tab.pinned ? <Pin className="text-accent h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
                  <span className="max-w-44 truncate font-semibold">{tab.title}</span>
                </button>
                {tab.closable ? (
                  <button
                    type="button"
                    className="text-text-tertiary hover:bg-surface-panel hover:text-text-primary rounded p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    onClick={() => onCloseTab(tab.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {
          <div className="relative h-full">
            <MapViewport
              key={mapDocument ? `${activeTabId}:${mapDocument.format}:${mapDocument.relativePath || mapDocument.sourcePath}` : 'empty-map'}
              locale={locale}
              ref={viewportRef}
              mapDocument={mapDocument}
              visibleLayerIds={visibleLayerIds}
              visibleObjectGroupIds={visibleObjectGroupIds}
              onHoverChange={onHoverChange}
              onAtlasPortalOpen={onOpenAtlasTarget}
              theme={theme}
              accentColor={accentColor}
              showGrid={showGrid}
              mapOverlay={mapOverlay}
              scaleMapOverlayWithViewport
              worldLighting={worldLighting}
              onZoomChange={(nextZoom) => setZoomLabel(copy.viewportLabels.zoomLabel(nextZoom))}
              onExportPng={() => {
                void exportMapPngAtFullSize()
              }}
            />
            <div className="workspace-viewport-toolbar" role="toolbar" aria-label={copy.center.canvas}>
              <div className="workspace-viewport-toolbar-group">
                <button
                  type="button"
                  className={cx(
                    'workspace-viewport-toolbar-icon-button',
                    toolMode === 'select' && 'workspace-viewport-toolbar-button-active',
                  )}
                  onClick={() => setToolMode('select')}
                  title={copy.center.selectTool}
                  aria-label={copy.center.selectTool}
                  aria-pressed={toolMode === 'select'}
                >
                  <MousePointer2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cx('workspace-viewport-toolbar-icon-button', toolMode === 'pan' && 'workspace-viewport-toolbar-button-active')}
                  onClick={() => setToolMode('pan')}
                  title={copy.center.panTool}
                  aria-label={copy.center.panTool}
                  aria-pressed={toolMode === 'pan'}
                >
                  <Move className="h-4 w-4" />
                </button>
              </div>

              {mapDocument?.format === 'atlas' && worldAtlasViews.length > 1 ? (
                <div className="workspace-viewport-toolbar-group">
                  {worldAtlasViews.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      className={cx(
                        'workspace-viewport-toolbar-button',
                        activeWorldAtlasViewId === view.id && 'workspace-viewport-toolbar-button-active',
                      )}
                      onClick={() => onSelectWorldAtlasView(view.id)}
                      aria-pressed={activeWorldAtlasViewId === view.id}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="workspace-viewport-toolbar-group">
                <button
                  type="button"
                  className={cx(
                    'workspace-viewport-toolbar-icon-button',
                    showGameWorldAdditions && 'workspace-viewport-toolbar-button-active',
                  )}
                  onClick={() => {
                    if (mapDocument) {
                      onToggleGameWorldAdditions()
                    }
                  }}
                  title={
                    mapDocument
                      ? showGameWorldAdditions
                        ? hideGameWorldAdditionsLabel
                        : previewGameWorldAdditionsLabel
                      : previewGameWorldAdditionsLabel
                  }
                  aria-label={
                    mapDocument
                      ? showGameWorldAdditions
                        ? hideGameWorldAdditionsLabel
                        : previewGameWorldAdditionsLabel
                      : previewGameWorldAdditionsLabel
                  }
                  aria-pressed={showGameWorldAdditions}
                  disabled={!mapDocument}
                >
                  <MapIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cx('workspace-viewport-toolbar-icon-button', showGrid && 'workspace-viewport-toolbar-button-active')}
                  onClick={() => setShowGrid((current) => !current)}
                  title={gridToggleLabel}
                  aria-label={gridToggleLabel}
                  aria-pressed={showGrid}
                >
                  <Grid2x2 className="h-4 w-4" />
                </button>
              </div>

              <MapLightingPreviewControls
                mode={lightingMode}
                season={lightingSeason}
                disabled={!mapDocument}
                onModeChange={setLightingMode}
                onSeasonChange={setLightingSeason}
              />

              <div className="workspace-viewport-toolbar-group workspace-viewport-toolbar-group-push">
                <button
                  type="button"
                  className="workspace-viewport-toolbar-icon-button"
                  onClick={() => viewportRef.current?.zoomOut()}
                  title={copy.viewportLabels.zoomOut}
                  aria-label={copy.viewportLabels.zoomOut}
                  disabled={!mapDocument}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="workspace-viewport-toolbar-icon-button"
                  onClick={() => viewportRef.current?.setOneToOne()}
                  title={copy.viewportLabels.oneToOne}
                  aria-label={copy.viewportLabels.oneToOne}
                  disabled={!mapDocument}
                >
                  <Grip className="h-4 w-4" />
                </button>
                <span className="workspace-viewport-toolbar-zoom">{zoomLabel}</span>
                <button
                  type="button"
                  className="workspace-viewport-toolbar-icon-button"
                  onClick={() => viewportRef.current?.zoomIn()}
                  title={copy.viewportLabels.zoomIn}
                  aria-label={copy.viewportLabels.zoomIn}
                  disabled={!mapDocument}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="workspace-viewport-toolbar-icon-button"
                  onClick={() => viewportRef.current?.fitToScreen()}
                  title={copy.viewportLabels.fit}
                  aria-label={copy.viewportLabels.fit}
                  disabled={!mapDocument}
                >
                  <Maximize className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="workspace-viewport-toolbar-icon-button"
                  onClick={() => viewportRef.current?.centerView()}
                  title={copy.viewportLabels.centerView}
                  aria-label={copy.viewportLabels.centerView}
                  disabled={!mapDocument}
                >
                  <Move className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  )
}
