import { Grid2x2, Grip, Map as MapIcon, Maximize, MousePointer2, Move, Pin, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EffectAssetState } from '@entities/event'
import { useEditorCopy, useLocale } from '@locales/provider'
import type { StageWorldOverlaySprite } from '@entities/map'
import type { ModuleBlueprint, ThemeMode, WorkspaceMode } from '@locales/api'
import type { MapDocument } from '@shared/contracts'
import type { FocusedMapObjectTarget, TileHoverInfo } from '@shared/contracts'
import { cx } from '@shared/lib/cx'
import { MapViewport, MapWorldStatePreviewOverlay, type MapViewportHandle } from '@entities/map'

type CentralWorkspaceProps = {
  workspaceMode: WorkspaceMode
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
  onHoverChange: (info: TileHoverInfo | null) => void
  moduleBlueprint?: ModuleBlueprint
}

type ToolMode = 'select' | 'pan'

export default function CentralWorkspace({
  workspaceMode,
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
  onHoverChange,
  moduleBlueprint,
}: CentralWorkspaceProps) {
  const locale = useLocale()
  const copy = useEditorCopy()
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [showGrid, setShowGrid] = useState(true)
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
  const previewGameWorldAdditionsLabel = copy.center.previewGameWorldAdditions
  const hideGameWorldAdditionsLabel = copy.center.hideGameWorldAdditions
  const gridToggleLabel = showGrid ? copy.center.hideGrid : copy.center.showGrid

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-viewport)]">
      <div className="flex h-10 items-end gap-1 overflow-x-auto border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-2">
        <div className="flex min-w-0 flex-1 items-end gap-1">
          {workspaceMode === 'map' ? (
            tabs.map((tab) => {
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
                      ? 'border-[var(--border-color)] bg-[var(--bg-active)] text-[var(--text-primary)]'
                      : 'border-transparent bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] hover:border-[var(--border-color)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                    isDragged && 'opacity-50',
                    isDropTarget && 'border-[var(--accent)]',
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
                    {tab.pinned ? <Pin className="h-3.5 w-3.5 text-[var(--accent)]" /> : <MapIcon className="h-3.5 w-3.5" />}
                    <span className="max-w-44 truncate font-semibold">{tab.title}</span>
                  </button>
                  {tab.closable ? (
                    <button
                      type="button"
                      className="rounded p-0.5 text-[var(--text-tertiary)] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)]"
                      onClick={() => onCloseTab(tab.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )
            })
          ) : (
            <div className="flex h-9 items-center gap-2 rounded-t-lg border-x border-t border-[var(--border-color)] bg-[var(--bg-active)] px-4 text-xs text-[var(--text-primary)]">
              <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="font-semibold">{moduleBlueprint?.title ?? copy.center.viewport}</span>
            </div>
          )}
        </div>
      </div>

      {workspaceMode !== 'map' ? (
        <div className="flex h-11 items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--bg-app)] px-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
              <button
                type="button"
                className={cx('tool-button', toolMode === 'select' && 'tool-button-active')}
                onClick={() => setToolMode('select')}
                title={copy.center.selectTool}
              >
                <MousePointer2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cx('tool-button', toolMode === 'pan' && 'tool-button-active')}
                onClick={() => setToolMode('pan')}
                title={copy.center.panTool}
              >
                <Move className="h-4 w-4" />
              </button>
            </div>
            <span className="dock-chip">{copy.center.canvas}</span>
            <span className="dock-chip">{copy.center.rightClick}</span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
            <button
              type="button"
              className={cx('tool-button', showGrid && 'tool-button-active')}
              onClick={() => setShowGrid((current) => !current)}
              title={gridToggleLabel}
              aria-pressed={showGrid}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <span className="mx-1 h-4 w-px bg-[var(--border-color)]" />
            <button
              type="button"
              className="tool-button"
              onClick={() => viewportRef.current?.zoomOut()}
              title={copy.viewportLabels.zoomOut}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => viewportRef.current?.setOneToOne()}
              title={copy.viewportLabels.oneToOne}
            >
              <Grip className="h-4 w-4" />
            </button>
            <div className="min-w-14 px-2 text-center font-mono text-xs text-[var(--text-secondary)]">{zoomLabel}</div>
            <button type="button" className="tool-button" onClick={() => viewportRef.current?.zoomIn()} title={copy.viewportLabels.zoomIn}>
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="mx-1 h-4 w-px bg-[var(--border-color)]" />
            <button
              type="button"
              className="tool-button"
              onClick={() => viewportRef.current?.fitToScreen()}
              title={copy.viewportLabels.fit}
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-3">
        {workspaceMode === 'map' ? (
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
              labels={copy.viewportLabels}
              theme={theme}
              accentColor={accentColor}
              showGrid={showGrid}
              mapOverlay={mapOverlay}
              scaleMapOverlayWithViewport
              onZoomChange={(nextZoom) => setZoomLabel(copy.viewportLabels.zoomLabel(nextZoom))}
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
        ) : moduleBlueprint ? (
          <div className="panel-surface h-full border-[var(--border-color)] bg-[var(--bg-panel)]">
            <div className="panel-header">
              <div>
                <p className="panel-title">{copy.center.moduleWorkspace}</p>
                <p className="panel-subtitle">{moduleBlueprint.title}</p>
              </div>
              <span className="dock-chip">{moduleBlueprint.state}</span>
            </div>

            <div className="panel-body grid gap-3 p-3 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div className="panel-surface border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
                <div className="panel-header">
                  <div>
                    <p className="panel-title">{moduleBlueprint.listTitle}</p>
                    <p className="panel-subtitle">{moduleBlueprint.focusTitle}</p>
                  </div>
                </div>
                <div className="panel-body space-y-2 p-3">
                  {moduleBlueprint.list.map((item) => (
                    <div key={item} className="panel-list-card px-3 py-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{item}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{moduleBlueprint.state}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-surface border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
                <div className="panel-header">
                  <div>
                    <p className="panel-title">{copy.center.moduleCanvas}</p>
                    <p className="panel-subtitle">{moduleBlueprint.focusTitle}</p>
                  </div>
                </div>
                <div className="panel-body p-3">
                  <div className="panel-canvas relative h-full bg-[var(--bg-viewport)]">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          'linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                      }}
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_32%)]" />

                    {moduleBlueprint.nodes.length ? (
                      moduleBlueprint.nodes.map((node, index) => {
                        const positions = ['left-8 top-8', 'left-[32%] top-[38%]', 'right-10 top-16', 'right-20 bottom-8']

                        return (
                          <div
                            key={node.title}
                            className={`panel-section absolute ${positions[index] ?? 'top-10 left-10'} px-4 py-3 shadow-[var(--shadow-panel)]`}
                          >
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{node.title}</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{node.detail}</p>
                          </div>
                        )
                      })
                    ) : (
                      <div className="flex h-full flex-col justify-between p-6">
                        <div>
                          <p className="text-lg font-semibold text-[var(--text-primary)]">{moduleBlueprint.summary}</p>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                            {copy.center.moduleInspector} and {copy.center.moduleCanvas.toLowerCase()} stay docked while the workspace swaps
                            to the selected editor module.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {moduleBlueprint.lanes.map((lane) => (
                            <div key={lane} className="panel-section px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                              {lane}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
