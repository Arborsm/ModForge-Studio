import { ItemCatalogPanel, ItemDetailPanel, ItemNavigationPanel } from '../../workspaces/item'
import type { ReactNode } from 'react'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import type { BuildWorkspacePanelsOptions } from './types'

export function buildItemsWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    items,
    filteredItems,
    itemBrowserSourceMode,
    onItemBrowserSourceModeChange,
    modItemGroups,
    activeItemModSources,
    activeItemId,
    activeModItemSelectionId,
    activeItem,
    itemFilter,
    itemLookup,
    itemTextureStatesByAssetName,
    ensureItemTextureAssetStates,
    onItemFilterChange,
    onSelectItem,
    onSelectModItem,
    itemStatusMessage,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const panels: WorkspacePanelConfig[] = [
    {
      id: 'item-navigation',
      title: copy.itemsPanel.filtersTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 160,
      minHeight: 320,
      dockMinHeight: 220,
      defaultDock: 'left-top',
      defaultDockHeight: 760,
      content: (
        <ItemNavigationPanel
          item={activeItem}
          items={items}
          filteredItems={filteredItems}
          browserSourceMode={itemBrowserSourceMode}
          onBrowserSourceModeChange={onItemBrowserSourceModeChange}
          modItemGroups={modItemGroups}
          activeItemModSources={activeItemModSources}
          activeItemId={activeItemId}
          activeModItemSelectionId={activeModItemSelectionId}
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
          onSelectModItem={onSelectModItem}
        />
      ),
    },
    {
      id: 'item-catalog',
      title: copy.itemsPanel.browserTitle,
      subtitle: itemStatusMessage,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 280,
      minHeight: 520,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: (
        <ItemCatalogPanel
          item={activeItem}
          items={items}
          filteredItems={filteredItems}
          browserSourceMode={itemBrowserSourceMode}
          onBrowserSourceModeChange={onItemBrowserSourceModeChange}
          modItemGroups={modItemGroups}
          activeItemModSources={activeItemModSources}
          activeItemId={activeItemId}
          activeModItemSelectionId={activeModItemSelectionId}
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
          onSelectModItem={onSelectModItem}
        />
      ),
    },
    {
      id: 'item-details',
      title: copy.itemsPanel.workspaceTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 240,
      minHeight: 320,
      dockMinHeight: 220,
      defaultDock: 'right-top',
      defaultDockHeight: 760,
      content: (
        <ItemDetailPanel
          item={activeItem}
          items={items}
          filteredItems={filteredItems}
          browserSourceMode={itemBrowserSourceMode}
          onBrowserSourceModeChange={onItemBrowserSourceModeChange}
          modItemGroups={modItemGroups}
          activeItemModSources={activeItemModSources}
          activeItemId={activeItemId}
          activeModItemSelectionId={activeModItemSelectionId}
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
          onSelectModItem={onSelectModItem}
        />
      ),
    },
  ]

  return panels.map((panel, index) => ({
    ...panel,
    content: withPreviewReveal(`workbench-items-${panel.id}`, index, panel.content),
  }))
}
