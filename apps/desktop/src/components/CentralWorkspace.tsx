import {
  Grid2x2,
  Grip,
  Map as MapIcon,
  Maximize,
  MousePointer2,
  Move,
  Pin,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ResourcePreloadState } from '../lib/app/types'
import type { EditorCopy, LocaleCode, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../lib/editor-shell'
import type { MapDocument } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { MapViewport, type FocusedMapObjectTarget, type MapViewportHandle, type TileHoverInfo } from './MapViewport'

type CentralWorkspaceProps = {
  copy: EditorCopy
  locale: LocaleCode
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
  onHoverChange: (info: TileHoverInfo | null) => void
  resourcePreloadState: ResourcePreloadState
  moduleBlueprint?: ModuleBlueprint
}

type ToolMode = 'select' | 'pan'

export default function CentralWorkspace({
  copy,
  locale,
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
  onHoverChange,
  resourcePreloadState,
  moduleBlueprint,
}: CentralWorkspaceProps) {
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-viewport)]">
      <div className="flex h-10 items-end gap-1 overflow-x-auto border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-2">
        {workspaceMode === 'map'
          ? tabs.map((tab) => {
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
                      className="rounded p-0.5 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] group-hover:opacity-100 group-focus-within:opacity-100"
                      onClick={() => onCloseTab(tab.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )
            })
          : (
            <div className="flex h-9 items-center gap-2 rounded-t-lg border-x border-t border-[var(--border-color)] bg-[var(--bg-active)] px-4 text-xs text-[var(--text-primary)]">
              <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="font-semibold">{moduleBlueprint?.title ?? copy.center.viewport}</span>
            </div>
            )}
      </div>

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
          {workspaceMode === 'map' && mapDocument?.format === 'atlas' && worldAtlasViews.length > 1 ? (
            <div className="ml-2 flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
              {worldAtlasViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={cx('tool-button px-2 text-xs', activeWorldAtlasViewId === view.id && 'tool-button-active')}
                  onClick={() => onSelectWorldAtlasView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
          <button
            type="button"
            className={cx('tool-button', showGrid && 'tool-button-active')}
            onClick={() => setShowGrid((current) => !current)}
            title={showGrid ? 'Hide grid' : 'Show grid'}
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
          <button
            type="button"
            className="tool-button"
            onClick={() => viewportRef.current?.zoomIn()}
            title={copy.viewportLabels.zoomIn}
          >
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

      <div className="min-h-0 flex-1 p-3">
        {workspaceMode === 'map' ? (
          <div className="relative h-full">
            <MapViewport
              key={mapDocument ? `${mapDocument.format}:${mapDocument.sourcePath}` : 'empty-map'}
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
              onZoomChange={(nextZoom) => setZoomLabel(copy.viewportLabels.zoomLabel(nextZoom))}
            />

            {resourcePreloadState.active ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-app)_72%,transparent)] backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-5 shadow-[var(--shadow-panel)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                    {copy.messages.preloadingResources}
                  </p>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{resourcePreloadState.message}</p>
                  {resourcePreloadState.currentLabel ? (
                    <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">{resourcePreloadState.currentLabel}</p>
                  ) : null}
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--bg-panel)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150"
                      style={{
                        width:
                          resourcePreloadState.total > 0
                            ? `${Math.max(6, (resourcePreloadState.completed / resourcePreloadState.total) * 100)}%`
                            : '24%',
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{resourcePreloadState.total > 0 ? `${resourcePreloadState.completed}/${resourcePreloadState.total}` : '...'}</span>
                    <span>{resourcePreloadState.total > 0 ? `${Math.round((resourcePreloadState.completed / resourcePreloadState.total) * 100)}%` : ''}</span>
                  </div>
                </div>
              </div>
            ) : null}
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
                    <div key={item} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
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
                  <div className="relative h-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-viewport)]">
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
                        const positions = [
                          'left-8 top-8',
                          'left-[32%] top-[38%]',
                          'right-10 top-16',
                          'right-20 bottom-8',
                        ]

                        return (
                          <div
                            key={node.title}
                            className={`absolute ${positions[index] ?? 'left-10 top-10'} rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow-panel)]`}
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
                            {copy.center.moduleInspector} and {copy.center.moduleCanvas.toLowerCase()} stay docked while the workspace
                            swaps to the selected editor module.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {moduleBlueprint.lanes.map((lane) => (
                            <div
                              key={lane}
                              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
                            >
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
