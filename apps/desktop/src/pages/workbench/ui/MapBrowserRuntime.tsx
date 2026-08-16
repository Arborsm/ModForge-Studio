import { useMemo } from 'react'
import type { RefObject } from 'react'
import { getWorldAtlasViewLabel, type LocaleCode, type ThemeMode } from '@locales/api'
import { useMapWorkspace } from '../workspaces/map'
import { buildMapsWorkspacePanels } from '../model/workspace-panels/maps'
import type { WorkspaceLayoutHandle } from '@shared/contracts'
import type { WorkspaceStoredState } from '@shared/contracts'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'

type MapBrowserRuntimeProps = {
  copy: (typeof import('@locales/api').editorCopy)[LocaleCode]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  desktopHost: boolean
  active: boolean
  directoryInfo: GameDirectoryInfo | null
  heavyWorkspaceReady: boolean
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
  onDirectoryInvalid: (message: string) => void
}

/** Owns map-browser loading, selection, viewport state, panels, and persisted layout. */
export function MapBrowserRuntime({
  copy,
  locale,
  theme,
  accentColor,
  desktopHost,
  active,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  onPersistStateChange,
  onDirectoryInvalid,
}: MapBrowserRuntimeProps) {
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
    return buildMapsWorkspacePanels({
      copy,
      heavyWorkspaceReady,
      mapAssets: mapWorkspace.mapAssets,
      filteredAssets: mapWorkspace.filteredAssets,
      mapBrowserSourceMode: mapWorkspace.browserSourceMode,
      onMapBrowserSourceModeChange: mapWorkspace.setBrowserSourceMode,
      modMapGroups: mapWorkspace.modMapGroups,
      activeModMapSelectionId: mapWorkspace.activeModMapSelectionId,
      activeMapModSources: mapWorkspace.activeMapModSources,
      activeMapId: mapWorkspace.activeMapId,
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
      gameRootPath: directoryInfo?.rootPath ?? null,
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
      objectLightIndex: mapWorkspace.objectLightIndex,
      onFocusObject: mapWorkspace.focusObject,
      onHoverChange: mapWorkspace.setHoverInfo,
    } satisfies Parameters<typeof buildMapsWorkspacePanels>[0])
  }, [accentColor, copy, directoryInfo, heavyWorkspaceReady, locale, mapWorkspace, theme]) satisfies WorkspacePanelConfig[]

  return (
    <div className="absolute inset-0 min-h-0 overflow-hidden">
      <WorkbenchLayoutHost
        workspaceLayoutRef={workspaceLayoutRef}
        workspaceLayoutStorageKey={workspaceLayoutStorageKey}
        workspaceLayouts={workspaceLayouts}
        workspacePanels={workspacePanels}
        onPersistStateChange={onPersistStateChange}
      />
    </div>
  )
}
