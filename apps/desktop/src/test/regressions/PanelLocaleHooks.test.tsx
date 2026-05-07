import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BuildingWorkspaceEntry, ConstructibleBuildingGroup } from '@pages/workbench/workspaces/building'
import { editorCopy } from '@locales/editor-shell'
import { AssetBrowserPanel } from '@pages/workbench/ui/workspace-panels/left/AssetBrowserPanel.tsx'
import { BuildingBrowserPanel } from '@pages/workbench/ui/workspace-panels/left/BuildingBrowserPanel.tsx'
import { ItemBrowserPanel } from '@pages/workbench/ui/workspace-panels/left/ItemBrowserPanel.tsx'
import { ItemInspectorPanel } from '@pages/workbench/ui/workspace-panels/right/ItemInspectorPanel.tsx'
import { ItemRecipesPanel } from '@pages/workbench/ui/workspace-panels/right/ItemRecipesPanel.tsx'
import { ItemSourcesPanel } from '@pages/workbench/ui/workspace-panels/right/ItemSourcesPanel.tsx'
import { renderWithLocale } from '../renderWithLocale'

function createConstructibleGroup(): ConstructibleBuildingGroup {
  const entry = {
    key: 'Barn',
    displayName: 'Barn',
  } as BuildingWorkspaceEntry

  return {
    key: 'Barn',
    displayName: 'Barn',
    searchText: 'barn',
    rootEntry: entry,
    entries: [entry],
    stageCount: 1,
    hasIndoorMap: false,
    builderLabel: 'Robin',
  }
}

describe('panel locale hooks regressions', () => {
  it('reads left and item panel copy from LocaleProvider without requiring copy props', () => {
    const copy = editorCopy['en-US']

    renderWithLocale(
      <>
        <AssetBrowserPanel
          mapAssets={[]}
          filteredAssets={[]}
          browserSourceMode="original"
          onBrowserSourceModeChange={vi.fn()}
          modMapGroups={[]}
          activeModMapSelectionId={null}
          activeMapId={null}
          assetFilter=""
          onAssetFilterChange={vi.fn()}
          onOpenAsset={vi.fn()}
          onOpenModAsset={vi.fn()}
        />
        <ItemBrowserPanel
          items={[]}
          filteredItems={[]}
          activeItemId={null}
          itemFilter=""
          textureStatesByAssetName={{}}
          onItemFilterChange={vi.fn()}
          onSelectItem={vi.fn()}
        />
        <ItemInspectorPanel noneLabel={copy.itemsPanel.noneLabel} item={null} textureState={null} />
        <ItemRecipesPanel item={null} />
        <ItemSourcesPanel item={null} />
      </>,
    )

    expect(screen.getByText(copy.leftDock.noMapsFound)).toBeInTheDocument()
    expect(screen.getByText(copy.itemsPanel.browserUnloadedEmpty)).toBeInTheDocument()
    expect(screen.getByText(copy.itemsPanel.inspectorEmpty)).toBeInTheDocument()
    expect(screen.getByText(copy.itemsPanel.recipesPanelEmpty)).toBeInTheDocument()
    expect(screen.getByText(copy.itemsPanel.sourcesPanelEmpty)).toBeInTheDocument()
  })

  it('reads constructible building copy inside nested panel buttons without passing copy props through the tree', () => {
    const copy = editorCopy['en-US'].buildingsPanel

    renderWithLocale(
      <BuildingBrowserPanel
        constructibleGroups={[createConstructibleGroup()]}
        filteredConstructibleGroups={[createConstructibleGroup()]}
        worldBuildings={[]}
        filteredWorldBuildings={[]}
        browserSourceMode="original"
        onBrowserSourceModeChange={vi.fn()}
        modBuildingGroups={[]}
        activeModBuildingSelectionId={null}
        activeBuildingId={null}
        activeBuildingGroupKey={null}
        buildingFilter=""
        onBuildingFilterChange={vi.fn()}
        onSelectBuilding={vi.fn()}
        onSelectModBuilding={vi.fn()}
      />,
    )

    expect(screen.getByText(copy.browserConstructibleBadge)).toBeInTheDocument()
  })
})
