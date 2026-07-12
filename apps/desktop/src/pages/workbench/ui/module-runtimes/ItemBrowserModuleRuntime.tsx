import { useMemo } from 'react'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { useItemWorkspace } from '../../workspaces/item'
import { buildItemsWorkspacePanels } from '../../model/workspace-panels/items'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useEntityBrowserRuntimeProps } from './entityBrowserRuntimeProps'

export default function ItemBrowserModuleRuntime() {
  const props = useEntityBrowserRuntimeProps()
  const workspace = useItemWorkspace({ directoryInfo: props.directoryInfo, locale: props.locale, copy: props.copy.itemsPanel })
  const workspacePanels = useMemo(
    () =>
      buildItemsWorkspacePanels({
        copy: props.copy,
        items: workspace.items,
        filteredItems: workspace.filteredItems,
        itemBrowserSourceMode: workspace.browserSourceMode,
        onItemBrowserSourceModeChange: workspace.setBrowserSourceMode,
        modItemGroups: workspace.modItemGroups,
        activeModItemSelectionId: workspace.activeModItemSelectionId,
        activeItemModSources: workspace.activeItemModSources,
        activeItemId: workspace.activeItemId,
        activeItem: workspace.activeItem,
        itemLookup: workspace.itemLookup,
        itemFilter: workspace.itemFilter,
        itemStatusMessage: workspace.itemStatusMessage,
        itemTextureStatesByAssetName: workspace.textureStatesByAssetName,
        ensureItemTextureAssetStates: workspace.ensureTextureAssetStates,
        onItemFilterChange: workspace.setItemFilter,
        onSelectItem: workspace.handleSelectItem,
        onSelectModItem: workspace.handleSelectModItem,
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
