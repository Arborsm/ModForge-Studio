import { useEffect, useMemo } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { getWorldAtlasViewLabel, type LocaleCode, type ThemeMode } from '@locales/editor-shell'
import { useMapWorkspace } from '../workspaces/map'
import { buildCoreWorkspacePanels } from '../model/workspace-panels/core'
import type { WorkspaceLayoutHandle, WorkspacePanelMeta, WorkspaceStatus } from '@shared/contracts'
import type { GameDirectoryInfo, ResourcePreloadState, WorkspaceStoredState } from '@shared/contracts'
import type { MapAssetSummary, MapDocument, TileHoverInfo, WorkspacePanelConfig } from '@shared/contracts'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'
import { createPreviewPanelDefaults } from './workbenchPreviewPanelDefaults'

type MapPreviewStatusSnapshot = {
  workspaceStatus: WorkspaceStatus
  resourcePreloadState: ResourcePreloadState
  mapAssets: MapAssetSummary[]
  activeAsset: MapAssetSummary | null
  mapDocument: MapDocument | null
  worldAtlasDocument: MapDocument | null
  hoverInfo: TileHoverInfo | null
}

type WorkbenchMapPreviewRuntimeProps = {
  copy: (typeof import('@locales/editor-shell').editorCopy)[LocaleCode]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  desktopHost: boolean
  active: boolean
  visible: boolean
  directoryInfo: GameDirectoryInfo | null
  heavyWorkspaceReady: boolean
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
  onLayoutMetaChange: (payload: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => void
  onDirectoryInvalid: (message: string) => void
  onStatusSnapshotChange: Dispatch<SetStateAction<MapPreviewStatusSnapshot>>
}

/** Keeps map resources warm for the whole workbench and renders the map layout only when visible. */
export function WorkbenchMapPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  desktopHost,
  active,
  visible,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  onPersistStateChange,
  onLayoutMetaChange,
  onDirectoryInvalid,
  onStatusSnapshotChange,
}: WorkbenchMapPreviewRuntimeProps) {
  const mapWorkspace = useMapWorkspace({
    copy,
    locale,
    desktopHost,
    active,
    directoryInfo,
    onDirectoryInvalid,
    getWorldAtlasViewLabel,
  })

  const workspacePanels = useMemo(() => {
    if (!visible) {
      return []
    }

    return buildCoreWorkspacePanels({
      ...createPreviewPanelDefaults({
        copy,
        locale,
        workspaceMode: 'map',
        directoryInfo,
        theme,
        accentColor,
        heavyWorkspaceReady,
      }),
      mapAssets: mapWorkspace.mapAssets,
      filteredAssets: mapWorkspace.filteredAssets,
      mapBrowserSourceMode: mapWorkspace.browserSourceMode,
      onMapBrowserSourceModeChange: mapWorkspace.setBrowserSourceMode,
      modMapGroups: mapWorkspace.modMapGroups,
      activeModMapSelectionId: mapWorkspace.activeModMapSelectionId,
      activeMapModSources: mapWorkspace.activeMapModSources,
      activeMapId: mapWorkspace.activeMapId,
      activeAssetName: mapWorkspace.mapDocument?.name ?? mapWorkspace.activeAsset?.name,
      assetFilter: mapWorkspace.assetFilter,
      onAssetFilterChange: mapWorkspace.setAssetFilter,
      onOpenAsset: (asset) => void mapWorkspace.openMap(asset),
      onOpenModAsset: mapWorkspace.handleOpenModMapAsset,
      workspaceTabs: mapWorkspace.workspaceTabs,
      activeTabId: mapWorkspace.activeTabId,
      onSelectWorkspaceTab: mapWorkspace.handleSelectWorkspaceTab,
      onCloseWorkspaceTab: mapWorkspace.handleCloseWorkspaceTab,
      onReorderWorkspaceTabs: mapWorkspace.handleReorderWorkspaceTabs,
      mapDocument: mapWorkspace.mapDocument,
      worldAtlasViews: mapWorkspace.worldAtlasViews,
      activeWorldAtlasViewId: mapWorkspace.activeWorldAtlasViewId,
      onSelectWorldAtlasView: mapWorkspace.handleSelectWorldAtlasView,
      onOpenAtlasTarget: mapWorkspace.handleOpenAtlasTarget,
      theme,
      accentColor,
      visibleLayerIds: mapWorkspace.visibleLayerIds,
      onToggleLayer: mapWorkspace.toggleLayer,
      onShowAllLayers: () => mapWorkspace.setAllLayers(true),
      onHideAllLayers: () => mapWorkspace.setAllLayers(false),
      visibleObjectGroupIds: mapWorkspace.visibleObjectGroupIds,
      onToggleObjectGroup: mapWorkspace.toggleObjectGroup,
      onShowAllObjectGroups: () => mapWorkspace.setAllObjectGroups(true),
      onHideAllObjectGroups: () => mapWorkspace.setAllObjectGroups(false),
      focusedObjectTarget: mapWorkspace.focusedObjectTarget,
      showGameWorldAdditions: mapWorkspace.showGameWorldAdditions,
      onToggleGameWorldAdditions: () => mapWorkspace.setShowGameWorldAdditions((current) => !current),
      worldOverlaySprites: mapWorkspace.worldOverlaySprites,
      worldOverlayTextureAssets: mapWorkspace.worldOverlayTextureAssets,
      onFocusObject: mapWorkspace.focusObject,
      onHoverChange: mapWorkspace.setHoverInfo,
      workspaceStatus: mapWorkspace.workspaceStatus,
    } satisfies Parameters<typeof buildCoreWorkspacePanels>[0])
  }, [accentColor, copy, directoryInfo, heavyWorkspaceReady, locale, mapWorkspace, theme, visible]) satisfies WorkspacePanelConfig[]

  useEffect(() => {
    const snapshot = {
      workspaceStatus: mapWorkspace.workspaceStatus,
      resourcePreloadState: mapWorkspace.resourcePreloadState,
      mapAssets: mapWorkspace.mapAssets,
      activeAsset: mapWorkspace.activeAsset,
      mapDocument: mapWorkspace.mapDocument,
      worldAtlasDocument: mapWorkspace.worldAtlasDocument,
      hoverInfo: mapWorkspace.hoverInfo,
    } satisfies MapPreviewStatusSnapshot

    onStatusSnapshotChange((current) => {
      if (
        current.workspaceStatus === snapshot.workspaceStatus &&
        current.resourcePreloadState === snapshot.resourcePreloadState &&
        current.mapAssets === snapshot.mapAssets &&
        current.activeAsset === snapshot.activeAsset &&
        current.mapDocument === snapshot.mapDocument &&
        current.worldAtlasDocument === snapshot.worldAtlasDocument &&
        current.hoverInfo === snapshot.hoverInfo
      ) {
        return current
      }

      return snapshot
    })
  }, [
    mapWorkspace.activeAsset,
    mapWorkspace.hoverInfo,
    mapWorkspace.mapAssets,
    mapWorkspace.mapDocument,
    mapWorkspace.resourcePreloadState,
    mapWorkspace.workspaceStatus,
    mapWorkspace.worldAtlasDocument,
    onStatusSnapshotChange,
  ])

  if (!visible) {
    return null
  }

  return (
    <div className="absolute inset-0 min-h-0 overflow-hidden">
      <WorkbenchLayoutHost
        workspaceLayoutRef={workspaceLayoutRef}
        workspaceLayoutStorageKey={workspaceLayoutStorageKey}
        workspaceLayouts={workspaceLayouts}
        workspacePanels={workspacePanels}
        onPersistStateChange={onPersistStateChange}
        onLayoutMetaChange={onLayoutMetaChange}
      />
    </div>
  )
}

export type { MapPreviewStatusSnapshot }
