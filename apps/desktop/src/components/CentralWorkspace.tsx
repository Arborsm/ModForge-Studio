import {
  Grid2x2,
  Grip,
  Map as MapIcon,
  Maximize,
  MousePointer2,
  Move,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { EditorCopy, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../lib/editor-shell'
import type { MapAssetSummary } from '../lib/desktop'
import type { MapDocument } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { MapViewport, type MapViewportHandle, type TileHoverInfo } from './MapViewport'

type CentralWorkspaceProps = {
  copy: EditorCopy
  workspaceMode: WorkspaceMode
  activeAsset: MapAssetSummary | null
  mapDocument: MapDocument | null
  worldAtlasViews: Array<{ id: 'main' | 'remote'; label: string }>
  activeWorldAtlasViewId: 'main' | 'remote' | null
  onSelectWorldAtlasView: (viewId: 'main' | 'remote') => void
  onOpenAtlasTarget: (targetMapName: string) => void
  theme: ThemeMode
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onHoverChange: (info: TileHoverInfo | null) => void
  moduleBlueprint?: ModuleBlueprint
}

type ToolMode = 'select' | 'pan'

export default function CentralWorkspace({
  copy,
  workspaceMode,
  activeAsset,
  mapDocument,
  worldAtlasViews,
  activeWorldAtlasViewId,
  onSelectWorldAtlasView,
  onOpenAtlasTarget,
  theme,
  visibleLayerIds,
  visibleObjectGroupIds,
  onHoverChange,
  moduleBlueprint,
}: CentralWorkspaceProps) {
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [showGrid, setShowGrid] = useState(true)
  const [zoomLabel, setZoomLabel] = useState('100%')
  const viewportRef = useRef<MapViewportHandle | null>(null)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-viewport)]">
      <div className="flex h-10 items-end overflow-x-auto border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-2">
        <div className="flex h-9 items-center gap-2 rounded-t-lg border-x border-t border-[var(--border-color)] bg-[var(--bg-active)] px-4">
          <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {workspaceMode === 'map' ? mapDocument?.name ?? activeAsset?.name ?? copy.center.activeScene : moduleBlueprint?.title}
          </span>
          <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]/70" />
        </div>
        <div className="ml-3 hidden items-center gap-3 text-[11px] text-[var(--text-secondary)] lg:flex">
          <span>
            {workspaceMode === 'map' ? mapDocument?.relativePath ?? activeAsset?.relativePath ?? copy.center.noSceneLoaded : moduleBlueprint?.summary}
          </span>
        </div>
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
          <MapViewport
            ref={viewportRef}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            onHoverChange={onHoverChange}
            onAtlasPortalOpen={onOpenAtlasTarget}
            labels={copy.viewportLabels}
            theme={theme}
            showGrid={showGrid}
            onZoomChange={(nextZoom) => setZoomLabel(copy.viewportLabels.zoomLabel(nextZoom))}
          />
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
