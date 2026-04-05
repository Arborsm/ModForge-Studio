import { ItemCatalogPanel, ItemDetailPanel, ItemNavigationPanel } from '../../../components/ItemWorkspace'
import type { WorkspacePanelConfig } from '../../../components/WorkspaceLayout'
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
    activeItem,
    itemFilter,
    itemLookup,
    itemTextureStatesByAssetName,
    ensureItemTextureAssetStates,
    onItemFilterChange,
    onSelectItem,
    itemStatusMessage,
  } = options

  return [
    {
      id: 'item-navigation',
      title: copy.itemsPanel.filtersTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat',
      minWidth: 220,
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
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
        />
      ),
    },
    {
      id: 'item-catalog',
      title: copy.itemsPanel.browserTitle,
      subtitle: itemStatusMessage,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat',
      minWidth: 520,
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
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
        />
      ),
    },
    {
      id: 'item-details',
      title: copy.itemsPanel.workspaceTitle,
      subtitle: activeItem?.displayName ?? itemStatusMessage,
      shellClassName: 'workspace-panel-shell-flat',
      minWidth: 520,
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
          itemFilter={itemFilter}
          itemLookup={itemLookup}
          textureStatesByAssetName={itemTextureStatesByAssetName}
          ensureTextureAssetStates={ensureItemTextureAssetStates}
          onItemFilterChange={onItemFilterChange}
          onSelectItem={onSelectItem}
        />
      ),
    },
  ]
}

