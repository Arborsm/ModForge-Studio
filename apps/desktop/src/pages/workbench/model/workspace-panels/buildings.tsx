import { Suspense, type ReactNode } from 'react'
import { DeferredWorkspacePlaceholder } from '@shared/ui/WorkspaceDeferred'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { BuildingWorkspace } from './LazyBuildingWorkspace'
import { BuildingBrowserPanel } from '../../ui/workspace-panels/building/BuildingBrowserPanel'
import { BuildingInspectorPanel } from '../../ui/workspace-panels/building/BuildingInspectorPanel'
import type { BuildBuildingPanelsOptions } from './types'

export function buildBuildingsWorkspacePanels(options: BuildBuildingPanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    locale,
    theme,
    accentColor,
    constructibleGroups,
    filteredConstructibleGroups,
    worldBuildings,
    filteredWorldBuildings,
    buildingBrowserSourceMode,
    onBuildingBrowserSourceModeChange,
    modBuildingGroups,
    activeModBuildingSelectionId,
    activeBuildingModSources,
    activeBuildingId,
    activeBuilding,
    activeUpgradeChain,
    buildingFilter,
    buildingStatusMessage,
    activeBuildingTextureState,
    activeBuildingChainTextureStates,
    activeBuildingIndoorMapDocument,
    activeBuildingIndoorMapPath,
    activeBuildingIndoorMapMessage,
    activeBuildingExteriorMapDocument,
    activeBuildingExteriorMapPath,
    activeBuildingExteriorMapMessage,
    activeBuildingExteriorFocusPoint,
    buildingSpringObjectsState,
    onBuildingFilterChange,
    onSelectBuilding,
    onSelectModBuilding,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName = 'workspace-panel-shell-flat building-workspace-panel-shell'

  const panels: WorkspacePanelConfig[] = [
    {
      id: 'building-browser/browser',
      title: copy.buildingsPanel.browserTitle,
      subtitle: buildingStatusMessage || copy.buildingsPanel.browserSubtitle,
      shellClassName,
      minWidth: 200,
      minHeight: 320,
      dockMinHeight: 220,
      defaultDock: 'left-top',
      defaultDockHeight: 760,
      content: (
        <BuildingBrowserPanel
          constructibleGroups={constructibleGroups}
          filteredConstructibleGroups={filteredConstructibleGroups}
          worldBuildings={worldBuildings}
          filteredWorldBuildings={filteredWorldBuildings}
          browserSourceMode={buildingBrowserSourceMode}
          onBrowserSourceModeChange={onBuildingBrowserSourceModeChange}
          modBuildingGroups={modBuildingGroups}
          activeModBuildingSelectionId={activeModBuildingSelectionId}
          activeBuildingId={activeBuildingId}
          activeBuildingGroupKey={activeBuilding?.groupKey ?? null}
          buildingFilter={buildingFilter}
          onBuildingFilterChange={onBuildingFilterChange}
          onSelectBuilding={onSelectBuilding}
          onSelectModBuilding={onSelectModBuilding}
        />
      ),
    },
    {
      id: 'building-browser/preview',
      title: copy.buildingsPanel.workspaceTitle,
      subtitle: activeBuilding?.displayName ?? buildingStatusMessage,
      hideDockHeader: true,
      shellClassName,
      minWidth: 360,
      minHeight: 420,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: (
        <Suspense
          fallback={
            <DeferredWorkspacePlaceholder
              title={copy.buildingsPanel.workspaceTitle}
              subtitle={copy.buildingsPanel.workspaceSubtitle}
              lines={5}
            />
          }
        >
          <BuildingWorkspace
            locale={locale}
            viewportLabels={copy.viewportLabels}
            theme={theme}
            accentColor={accentColor}
            building={activeBuilding}
            upgradeChain={activeUpgradeChain}
            activeTextureState={activeBuildingTextureState}
            chainTextureStates={activeBuildingChainTextureStates}
            activeIndoorMapDocument={activeBuildingIndoorMapDocument}
            activeIndoorMapPath={activeBuildingIndoorMapPath}
            activeIndoorMapMessage={activeBuildingIndoorMapMessage}
            activeExteriorMapDocument={activeBuildingExteriorMapDocument}
            activeExteriorMapPath={activeBuildingExteriorMapPath}
            activeExteriorMapMessage={activeBuildingExteriorMapMessage}
            activeExteriorFocusPoint={activeBuildingExteriorFocusPoint}
            springObjectsState={buildingSpringObjectsState}
            onSelectBuildingStage={onSelectBuilding}
          />
        </Suspense>
      ),
    },
    {
      id: 'building-browser/details',
      title: copy.buildingsPanel.detailsTitle,
      subtitle: activeBuilding?.displayName ?? buildingStatusMessage,
      shellClassName,
      minWidth: 220,
      minHeight: 320,
      dockMinHeight: 220,
      defaultDock: 'right-top',
      defaultDockHeight: 760,
      content: (
        <BuildingInspectorPanel
          building={activeBuilding}
          textureState={activeBuildingTextureState}
          activeIndoorMapPath={activeBuildingIndoorMapPath}
          activeExteriorMapPath={activeBuildingExteriorMapPath}
          modSources={activeBuildingModSources}
        />
      ),
    },
  ]

  return panels.map((panel, index) => ({
    ...panel,
    content: withPreviewReveal(`workbench-buildings-${panel.id}`, index, panel.content),
  }))
}
