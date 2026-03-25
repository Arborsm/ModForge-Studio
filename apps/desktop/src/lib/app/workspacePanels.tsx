import CentralWorkspace from '../../components/CentralWorkspace'
import { AssetBrowserPanel, ProjectPanel } from '../../components/LeftPanels'
import { DiagnosticsPanel, InspectorPanel, LayersPanel, ObjectGroupsPanel } from '../../components/RightPanels'
import type { FocusedMapObjectTarget, TileHoverInfo } from '../../components/MapViewport'
import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import type { GameDirectoryInfo, MapAssetSummary } from '../desktop'
import type { EditorCopy, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../editor-shell'
import type { MapDocument } from '../maps/types'
import type { WorldAtlasView } from './types'

type BuildWorkspacePanelsOptions = {
  copy: EditorCopy
  workspaceMode: WorkspaceMode
  desktopHost: boolean
  gameDirectory: string
  onGameDirectoryChange: (value: string) => void
  onChooseDirectory: () => void
  onUseKnownPath: () => void
  onValidateOnly: () => void
  onScanAndOpenTown: () => void
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  activeMapId: string | null
  activeAssetName?: string
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
  workspaceTabs: Array<{
    id: string
    title: string
    pathLabel: string
    closable: boolean
    pinned: boolean
  }>
  activeTabId: string
  onSelectWorkspaceTab: (tabId: string) => void
  onCloseWorkspaceTab: (tabId: string) => void
  onReorderWorkspaceTabs: (sourceTabId: string, targetTabId: string) => void
  mapDocument: MapDocument | null
  worldAtlasViews: WorldAtlasView[]
  activeWorldAtlasViewId: WorldAtlasView['id'] | null
  onSelectWorldAtlasView: (viewId: WorldAtlasView['id']) => void
  onOpenAtlasTarget: (targetMapName: string) => void
  theme: ThemeMode
  accentColor: string
  visibleLayerIds: number[]
  onToggleLayer: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
  visibleObjectGroupIds: number[]
  onToggleObjectGroup: (id: number) => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
  onHoverChange: (hoverInfo: TileHoverInfo | null) => void
  workspaceStatus: {
    tone: 'idle' | 'working' | 'ready' | 'error'
    message: string
  }
  moduleBlueprint?: ModuleBlueprint
}

export function buildWorkspacePanels({
  copy,
  workspaceMode,
  desktopHost,
  gameDirectory,
  onGameDirectoryChange,
  onChooseDirectory,
  onUseKnownPath,
  onValidateOnly,
  onScanAndOpenTown,
  directoryInfo,
  mapAssets,
  filteredAssets,
  activeMapId,
  activeAssetName,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
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
  theme,
  accentColor,
  visibleLayerIds,
  onToggleLayer,
  onShowAllLayers,
  onHideAllLayers,
  visibleObjectGroupIds,
  onToggleObjectGroup,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
  onHoverChange,
  workspaceStatus,
  moduleBlueprint,
}: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  return [
    {
      id: 'project',
      title: copy.leftDock.project,
      subtitle: copy.leftDock.projectSubtitle,
      minWidth: 300,
      minHeight: 280,
      dockMinHeight: 220,
      dockAutoHeight: true,
      defaultDock: 'left-top',
      defaultDockHeight: 280,
      content: (
        <ProjectPanel
          copy={copy}
          workspaceMode={workspaceMode}
          desktopHost={desktopHost}
          gameDirectory={gameDirectory}
          onGameDirectoryChange={onGameDirectoryChange}
          onChooseDirectory={onChooseDirectory}
          onUseKnownPath={onUseKnownPath}
          onValidateOnly={onValidateOnly}
          onScanAndOpenTown={onScanAndOpenTown}
          directoryInfo={directoryInfo}
          mapAssets={mapAssets}
          activeMapId={activeMapId}
          sceneLabel={workspaceMode === 'map' ? activeAssetName : undefined}
        />
      ),
    },
    {
      id: 'assets',
      title: copy.leftDock.contentBrowser,
      subtitle: copy.leftDock.contentSubtitle,
      minWidth: 320,
      minHeight: 320,
      dockMinHeight: 240,
      defaultDock: 'left-bottom',
      defaultDockHeight: 520,
      content: (
        <AssetBrowserPanel
          copy={copy}
          mapAssets={mapAssets}
          filteredAssets={filteredAssets}
          activeMapId={activeMapId}
          assetFilter={assetFilter}
          onAssetFilterChange={onAssetFilterChange}
          onOpenAsset={onOpenAsset}
        />
      ),
    },
    {
      id: 'viewport',
      title: copy.center.viewport,
      subtitle: copy.center.activeScene,
      minWidth: 640,
      minHeight: 420,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: (
        <CentralWorkspace
          copy={copy}
          workspaceMode={workspaceMode}
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
          onHoverChange={onHoverChange}
          moduleBlueprint={moduleBlueprint}
        />
      ),
    },
    {
      id: 'inspector',
      title: copy.rightDock.inspector,
      subtitle: copy.rightDock.sceneSummary,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 180,
      dockAutoHeight: true,
      defaultDock: 'right-top',
      defaultDockHeight: 220,
      content: <InspectorPanel copy={copy} mapDocument={mapDocument} moduleBlueprint={moduleBlueprint} />,
    },
    {
      id: 'layers',
      title: copy.rightDock.layers,
      subtitle: copy.rightDock.subtitle,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 220,
      defaultDock: 'right-bottom',
      defaultDockHeight: 320,
      content: (
        <LayersPanel
          copy={copy}
          mapDocument={mapDocument}
          visibleLayerIds={visibleLayerIds}
          onToggleLayer={onToggleLayer}
          onShowAllLayers={onShowAllLayers}
          onHideAllLayers={onHideAllLayers}
        />
      ),
    },
    {
      id: 'object-groups',
      title: copy.rightDock.objectGroups,
      subtitle: copy.rightDock.subtitle,
      minWidth: 320,
      minHeight: 300,
      dockMinHeight: 240,
      defaultDock: 'right-bottom',
      defaultDockHeight: 360,
      content: (
        <ObjectGroupsPanel
          copy={copy}
          mapDocument={mapDocument}
          visibleObjectGroupIds={visibleObjectGroupIds}
          onToggleObjectGroup={onToggleObjectGroup}
          onShowAllObjectGroups={onShowAllObjectGroups}
          onHideAllObjectGroups={onHideAllObjectGroups}
          focusedObjectTarget={focusedObjectTarget}
          onFocusObject={onFocusObject}
        />
      ),
    },
    {
      id: 'diagnostics',
      title: copy.rightDock.diagnostics,
      subtitle: copy.rightDock.projectFacts,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 160,
      dockAutoHeight: true,
      defaultDock: 'bottom-right',
      defaultDockHeight: 300,
      content: (
        <DiagnosticsPanel
          copy={copy}
          directoryInfo={directoryInfo}
          visibleLayerIds={visibleLayerIds}
          visibleObjectGroupIds={visibleObjectGroupIds}
          workspaceStatus={workspaceStatus}
        />
      ),
    },
  ]
}
