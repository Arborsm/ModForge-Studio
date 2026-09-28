import { ItemCatalogPanel, ItemDetailPanel, ItemNavigationPanel } from '../../workspaces/item'
import type { ReactNode } from 'react'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import type { BuildItemPanelsOptions } from './types'

export function buildItemsWorkspacePanels(options: BuildItemPanelsOptions): WorkspacePanelConfig[] {
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
    onOpenItemInAuthoring,
    itemStatusMessage,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const panels: WorkspacePanelConfig[] = [
    {
      id: 'item-browser/navigation',
      title: copy.itemsPanel.filtersTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 160,
      minHeight: 320,
      area: 'left',
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
      id: 'item-browser/catalog',
      title: copy.itemsPanel.browserTitle,
      subtitle: itemStatusMessage,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 280,
      minHeight: 520,
      area: 'center',
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
      id: 'item-browser/details',
      title: copy.itemsPanel.workspaceTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat item-workspace-panel-shell',
      minWidth: 240,
      minHeight: 320,
      area: 'right',
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
          onOpenItemInAuthoring={onOpenItemInAuthoring}
        />
      ),
    },
  ]

  return panels.map((panel, index) => ({
    ...panel,
    content: withPreviewReveal(`workbench-items-${panel.id}`, index, panel.content),
  }))
}
