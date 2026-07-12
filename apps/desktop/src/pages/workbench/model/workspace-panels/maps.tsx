import type { ReactNode } from 'react'
import { DeferredWorkspaceCrossfade, DeferredWorkspacePlaceholder, DeferredWorkspaceReveal } from '@shared/ui/WorkspaceDeferred'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { MapBrowserPanel } from '../../ui/workspace-panels/map/MapBrowserPanel'
import { MapDetailPanel } from '../../ui/workspace-panels/map/MapDetailPanel'
import { CentralWorkspace } from '../../workspaces/map'
import type { BuildMapPanelsOptions } from './types'

/**
 * Map browse workspace: hierarchical asset browser, viewport, unified detail rail.
 * Collapses former inspector / layers / object-groups / diagnostics stacks into one pane.
 */
export function buildMapsWorkspacePanels(options: BuildMapPanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    theme,
    accentColor,
    mapAssets,
    filteredAssets,
    mapBrowserSourceMode,
    onMapBrowserSourceModeChange,
    modMapGroups,
    activeModMapSelectionId,
    activeMapModSources,
    activeMapId,
    assetFilter,
    onAssetFilterChange,
    onOpenAsset,
    onOpenModAsset,
    workspaceTabs,
    activeTabId,
    onSelectWorkspaceTab,
    onCloseWorkspaceTab,
    onReorderWorkspaceTabs,
    mapDocument,
    worldAtlasViews,
    activeWorldAtlasViewId,
    onSelectWorldAtlasView,
    onOpenAtlasTarget,
    visibleLayerIds,
    onToggleLayer,
    onShowAllLayers,
    onHideAllLayers,
    visibleObjectGroupIds,
    onToggleObjectGroup,
    onShowAllObjectGroups,
    onHideAllObjectGroups,
    focusedObjectTarget,
    showGameWorldAdditions,
    onToggleGameWorldAdditions,
    worldOverlaySprites,
    worldOverlayTextureAssets,
    onFocusObject,
    onHoverChange,
    heavyWorkspaceReady,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName = 'workspace-panel-shell-flat item-workspace-panel-shell'
  const mapLabels = copy.mapPanel
  const sceneLabel = mapDocument?.name ?? copy.center.noSceneLoaded

  return [
    {
      id: 'map-browser/browser',
      title: mapLabels.browserTitle,
      subtitle: mapLabels.browserSubtitle,
      hideDockHeader: true,
      shellClassName,
      minWidth: 200,
      minHeight: 320,
      area: 'left',
      content: withPreviewReveal(
        'workbench-map-browser',
        0,
        <MapBrowserPanel
          mapAssets={mapAssets}
          filteredAssets={filteredAssets}
          browserSourceMode={mapBrowserSourceMode}
          onBrowserSourceModeChange={onMapBrowserSourceModeChange}
          modMapGroups={modMapGroups}
          activeModMapSelectionId={activeModMapSelectionId}
          activeMapId={activeMapId}
          assetFilter={assetFilter}
          onAssetFilterChange={onAssetFilterChange}
          onOpenAsset={onOpenAsset}
          onOpenModAsset={onOpenModAsset}
        />,
      ),
    },
    {
      id: 'map-browser/viewport',
      title: copy.center.viewport,
      subtitle: sceneLabel,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell map-viewport-panel-shell',
      minWidth: 480,
      minHeight: 420,
      area: 'center',
      content: (
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={<DeferredWorkspacePlaceholder title={copy.center.viewport} subtitle={copy.center.activeScene} lines={5} />}
        >
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-map-viewport',
              1,
              <CentralWorkspace
                tabs={workspaceTabs}
                activeTabId={activeTabId}
                onSelectTab={onSelectWorkspaceTab}
                onCloseTab={onCloseWorkspaceTab}
                onReorderTabs={onReorderWorkspaceTabs}
                mapDocument={mapDocument}
                worldAtlasViews={worldAtlasViews}
                activeWorldAtlasViewId={activeWorldAtlasViewId}
                onSelectWorldAtlasView={onSelectWorldAtlasView}
                onOpenAtlasTarget={onOpenAtlasTarget}
                theme={theme}
                accentColor={accentColor}
                visibleLayerIds={visibleLayerIds}
                visibleObjectGroupIds={visibleObjectGroupIds}
                focusedObjectTarget={focusedObjectTarget}
                showGameWorldAdditions={showGameWorldAdditions}
                onToggleGameWorldAdditions={onToggleGameWorldAdditions}
                worldOverlaySprites={worldOverlaySprites}
                worldOverlayTextureAssets={worldOverlayTextureAssets}
                onHoverChange={onHoverChange}
              />,
            )}
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ),
    },
    {
      id: 'map-browser/detail',
      title: copy.rightDock.inspector,
      subtitle: sceneLabel,
      hideDockHeader: true,
      shellClassName,
      minWidth: 260,
      minHeight: 320,
      area: 'right',
      content: (
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.inspector} subtitle={copy.rightDock.sceneSummary} />}
        >
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-map-detail',
              2,
              <MapDetailPanel
                mapDocument={mapDocument}
                modSources={activeMapModSources}
                visibleLayerIds={visibleLayerIds}
                onToggleLayer={onToggleLayer}
                onShowAllLayers={onShowAllLayers}
                onHideAllLayers={onHideAllLayers}
                visibleObjectGroupIds={visibleObjectGroupIds}
                onToggleObjectGroup={onToggleObjectGroup}
                onShowAllObjectGroups={onShowAllObjectGroups}
                onHideAllObjectGroups={onHideAllObjectGroups}
                focusedObjectTarget={focusedObjectTarget}
                onFocusObject={onFocusObject}
              />,
            )}
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ),
    },
  ]
}
