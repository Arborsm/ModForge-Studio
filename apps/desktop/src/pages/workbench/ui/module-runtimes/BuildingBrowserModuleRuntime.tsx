import { useMemo } from 'react'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { useBuildingWorkspace } from '../../workspaces/building/state/useBuildingWorkspace'
import { buildBuildingsWorkspacePanels } from '../../model/workspace-panels/buildings'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useEntityBrowserRuntimeProps } from './entityBrowserRuntimeProps'

export default function BuildingBrowserModuleRuntime() {
  const props = useEntityBrowserRuntimeProps()
  const workspace = useBuildingWorkspace({ directoryInfo: props.directoryInfo, locale: props.locale, copy: props.copy.buildingsPanel })
  const workspacePanels = useMemo(
    () =>
      buildBuildingsWorkspacePanels({
        copy: props.copy,
        locale: props.locale,
        theme: props.theme,
        accentColor: props.accentColor,
        constructibleGroups: workspace.constructibleGroups,
        filteredConstructibleGroups: workspace.filteredConstructibleGroups,
        worldBuildings: workspace.worldBuildings,
        filteredWorldBuildings: workspace.filteredWorldBuildings,
        buildingBrowserSourceMode: workspace.browserSourceMode,
        onBuildingBrowserSourceModeChange: workspace.setBrowserSourceMode,
        modBuildingGroups: workspace.modBuildingGroups,
        activeModBuildingSelectionId: workspace.activeModBuildingSelectionId,
        activeBuildingModSources: workspace.activeBuildingModSources,
        activeBuildingId: workspace.activeBuildingId,
        activeBuilding: workspace.activeBuilding,
        activeUpgradeChain: workspace.activeUpgradeChain,
        buildingFilter: workspace.buildingFilter,
        buildingStatusMessage: workspace.buildingStatusMessage,
        activeBuildingTextureState: workspace.activeTextureState,
        activeBuildingChainTextureStates: workspace.activeChainTextureStates,
        activeBuildingIndoorMapDocument: workspace.activeIndoorMapDocument,
        activeBuildingIndoorMapPath: workspace.activeIndoorMapPath,
        activeBuildingIndoorMapMessage: workspace.activeIndoorMapMessage,
        activeBuildingExteriorMapDocument: workspace.activeExteriorMapDocument,
        activeBuildingExteriorMapPath: workspace.activeExteriorMapPath,
        activeBuildingExteriorMapMessage: workspace.activeExteriorMapMessage,
        activeBuildingExteriorFocusPoint: workspace.activeExteriorFocusPoint,
        buildingSpringObjectsState: workspace.springObjectsState,
        onBuildingFilterChange: workspace.setBuildingFilter,
        onSelectBuilding: workspace.handleSelectBuilding,
        onSelectModBuilding: workspace.handleSelectModBuilding,
      }),
    [props, workspace],
  ) satisfies WorkspacePanelConfig[]
  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={props.workspaceLayoutRef}
      workspaceLayoutStorageKey={props.workspaceLayoutStorageKey}
      workspaceLayouts={props.workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={props.onPersistStateChange}
      onLayoutMetaChange={props.onLayoutMetaChange}
    />
  )
}
