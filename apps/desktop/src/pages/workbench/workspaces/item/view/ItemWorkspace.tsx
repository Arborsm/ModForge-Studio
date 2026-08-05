import { useCallback, useEffect, useMemo } from 'react'
import { useItemsCopy } from '@locales/provider'
import type { ModBrowserEntry } from '@pages/workbench/workspaces/mod'
import type { ItemWorkspaceEntry } from '@entities/item'
import { paginateItems, sortItemsBySearchPriority } from './itemCatalogPagination'
import { CatalogPane } from './ItemCatalogPane'
import { DetailPane } from './ItemDetailPane'
import { NavigationPane } from './ItemNavigationPane'
import {
  buildHeroChips,
  buildInfoRows,
  buildObjectDataCards,
  buildResourceRows,
  buildSignalCards,
  buildSourceCards,
  buildSpecificSections,
  createMachineUseCard,
  createRecipeUseCard,
  getTabDefinitions,
  getWorkspaceText,
} from './itemWorkspaceRows'
import type { DetailTab, ItemWorkspaceProps } from './itemWorkspaceTypes'
import { useItemWorkspaceUi } from './useItemWorkspaceUi'

function useItemWorkspaceViewModel({
  item,
  items,
  filteredItems,
  browserSourceMode,
  onBrowserSourceModeChange,
  modItemGroups,
  activeItemModSources,
  activeItemId,
  activeModItemSelectionId,
  itemFilter,
  itemLookup,
  textureStatesByAssetName,
  ensureTextureAssetStates,
  onItemFilterChange,
  onSelectItem,
  onSelectModItem,
  onOpenItemInAuthoring,
}: ItemWorkspaceProps) {
  const copy = useItemsCopy()
  const ui = useItemWorkspaceUi()
  const text = useMemo(() => getWorkspaceText(copy), [copy])
  const tabs = useMemo(() => getTabDefinitions(copy, items), [copy, items])
  const matchedKeys = useMemo(() => new Set(filteredItems.map((entry) => entry.key)), [filteredItems])

  const visibleItems = useMemo(
    () => items.filter((entry) => ui.activeBrowseTab === 'all' || entry.browseCategories.includes(ui.activeBrowseTab)),
    [ui.activeBrowseTab, items],
  )
  const matchingVisibleItems = useMemo(
    () =>
      sortItemsBySearchPriority(
        visibleItems.filter((entry) => !itemFilter || matchedKeys.has(entry.key)),
        itemFilter,
      ),
    [itemFilter, matchedKeys, visibleItems],
  )
  const pagination = useMemo(
    () => paginateItems(matchingVisibleItems, ui.currentPage, ui.itemsPerPage),
    [matchingVisibleItems, ui.currentPage, ui.itemsPerPage],
  )
  const paginatedItems = pagination.items
  const currentPage = pagination.currentPage
  const pageCount = pagination.pageCount

  useEffect(() => {
    if (currentPage !== ui.currentPage) {
      ui.setCurrentPage(currentPage)
    }
  }, [currentPage, ui])

  useEffect(() => {
    const assetNames =
      browserSourceMode === 'mod'
        ? modItemGroups.flatMap((group) => group.items.flatMap(({ value }) => (value.textureAssetName ? [value.textureAssetName] : [])))
        : paginatedItems.flatMap((entry) => (entry.textureAssetName ? [entry.textureAssetName] : []))
    ensureTextureAssetStates(assetNames)
  }, [browserSourceMode, ensureTextureAssetStates, modItemGroups, paginatedItems])

  const activeTextureState = item?.textureAssetName ? (textureStatesByAssetName[item.textureAssetName] ?? null) : null
  const heroChips = item ? buildHeroChips(item, copy) : []
  const sourceCards = item ? buildSourceCards(item, copy) : []
  const recipeUseCards = item ? item.recipesUsing.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const machineUseCards = item ? item.machineInputs.map((machine) => createMachineUseCard(machine, item, copy)) : []
  const recipeOutputCards = item ? item.recipesProduced.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const signalCards = item ? buildSignalCards(item, copy, sourceCards, recipeUseCards, machineUseCards, recipeOutputCards) : []
  const infoRows = item ? buildInfoRows(item, copy) : []
  const resourceRows = item ? buildResourceRows(item, activeTextureState, copy, text.spriteSizeLabel) : []
  const objectDataCards = item ? buildObjectDataCards(item, copy) : []
  const specificSections = item ? buildSpecificSections(item, copy) : []

  const handleSelectItem = useCallback(
    (itemKey: string, tab: DetailTab = 'info') => {
      ui.setActiveDetailTab(tab)
      onSelectItem(itemKey)
    },
    [onSelectItem, ui],
  )
  const handleSelectModItem = useCallback(
    (entry: ModBrowserEntry<ItemWorkspaceEntry>, tab: DetailTab = 'info') => {
      ui.setActiveDetailTab(tab)
      onSelectModItem(entry)
    },
    [onSelectModItem, ui],
  )

  const handleItemFilterChange = useCallback(
    (value: string) => {
      ui.setCurrentPage(1)
      onItemFilterChange(value)
    },
    [onItemFilterChange, ui],
  )

  return {
    item,
    items,
    browserSourceMode,
    onBrowserSourceModeChange,
    modItemGroups,
    activeItemModSources,
    activeItemId,
    activeModItemSelectionId,
    itemFilter,
    itemLookup,
    textureStatesByAssetName,
    onItemFilterChange: handleItemFilterChange,
    text,
    tabs,
    visibleItems,
    matchingVisibleItems,
    navigationVisibleCount:
      browserSourceMode === 'mod' ? modItemGroups.reduce((total, group) => total + group.items.length, 0) : matchingVisibleItems.length,
    navigationTotalVisibleCount:
      browserSourceMode === 'mod' ? modItemGroups.reduce((total, group) => total + group.items.length, 0) : visibleItems.length,
    paginatedItems,
    currentPage,
    pageCount,
    itemsPerPage: ui.itemsPerPage,
    activeTextureState,
    heroChips,
    sourceCards,
    recipeUseCards,
    machineUseCards,
    recipeOutputCards,
    signalCards,
    infoRows,
    resourceRows,
    objectDataCards,
    modSources: activeItemModSources,
    specificSections,
    activeBrowseTab: ui.activeBrowseTab,
    setActiveBrowseTab: ui.setActiveBrowseTab,
    setCurrentPage: ui.setCurrentPage,
    setItemsPerPage: ui.setItemsPerPage,
    activeDetailTab: ui.activeDetailTab,
    setActiveDetailTab: ui.setActiveDetailTab,
    catalogViewMode: ui.catalogViewMode,
    setCatalogViewMode: ui.setCatalogViewMode,
    handleSelectItem,
    handleSelectModItem,
    onOpenItemInAuthoring,
  }
}

export function ItemNavigationPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <NavigationPane
      text={view.text}
      browserSourceMode={view.browserSourceMode}
      onBrowserSourceModeChange={view.onBrowserSourceModeChange}
      tabs={view.tabs}
      activeBrowseTab={view.activeBrowseTab}
      onBrowseTabChange={view.setActiveBrowseTab}
      itemFilter={view.itemFilter}
      onItemFilterChange={view.onItemFilterChange}
      item={view.item}
      textureState={view.activeTextureState}
      visibleCount={view.navigationVisibleCount}
      totalVisibleCount={view.navigationTotalVisibleCount}
    />
  )
}

export function ItemCatalogPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <CatalogPane
      text={view.text}
      browserSourceMode={view.browserSourceMode}
      modItemGroups={view.modItemGroups}
      items={view.paginatedItems}
      totalItems={view.matchingVisibleItems.length}
      currentPage={view.currentPage}
      pageCount={view.pageCount}
      itemsPerPage={view.itemsPerPage}
      activeItemId={view.activeItemId}
      activeModItemSelectionId={view.activeModItemSelectionId}
      textureStatesByAssetName={view.textureStatesByAssetName}
      onSelectItem={view.handleSelectItem}
      onSelectModItem={view.handleSelectModItem}
      onPageChange={view.setCurrentPage}
      onItemsPerPageChange={view.setItemsPerPage}
      catalogViewMode={view.catalogViewMode}
      onCatalogViewModeChange={view.setCatalogViewMode}
    />
  )
}

export function ItemDetailPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <DetailPane
      text={view.text}
      item={view.item}
      textureState={view.activeTextureState}
      heroChips={view.heroChips}
      signalCards={view.signalCards}
      infoRows={view.infoRows}
      resourceRows={view.resourceRows}
      objectDataCards={view.objectDataCards}
      modSources={view.modSources}
      sourceCards={view.sourceCards}
      recipeUseCards={view.recipeUseCards}
      machineUseCards={view.machineUseCards}
      recipeOutputCards={view.recipeOutputCards}
      specificSections={view.specificSections}
      activeDetailTab={view.activeDetailTab}
      onDetailTabChange={view.setActiveDetailTab}
      itemLookup={view.itemLookup}
      textureStatesByAssetName={view.textureStatesByAssetName}
      onOpenItemInAuthoring={view.onOpenItemInAuthoring}
    />
  )
}

export default function ItemWorkspace({ ...props }: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <div
      className="bg-surface-app flex h-full flex-col overflow-hidden"
      style={{
        background:
          'radial-gradient(circle 32.5rem at 14% -6%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 68%), radial-gradient(circle 28.75rem at 98% -2%, color-mix(in srgb, var(--info) 6%, transparent), transparent 70%), linear-gradient(color-mix(in srgb, var(--border-color) 22%, transparent) 1px, transparent 1px) 0 0 / 2.5rem 2.5rem, linear-gradient(90deg, color-mix(in srgb, var(--border-color) 22%, transparent) 1px, transparent 1px) 0 0 / 2.5rem 2.5rem, var(--bg-app)',
      }}
    >
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 xl:px-5 xl:py-5">
        <div className="mx-auto grid w-full max-w-[1880px] gap-4 xl:grid-cols-[260px_1rem_minmax(0,920px)_1rem_620px] xl:gap-0">
          <NavigationPane
            text={view.text}
            browserSourceMode={view.browserSourceMode}
            onBrowserSourceModeChange={view.onBrowserSourceModeChange}
            tabs={view.tabs}
            activeBrowseTab={view.activeBrowseTab}
            onBrowseTabChange={view.setActiveBrowseTab}
            itemFilter={view.itemFilter}
            onItemFilterChange={view.onItemFilterChange}
            item={view.item}
            textureState={view.activeTextureState}
            visibleCount={view.navigationVisibleCount}
            totalVisibleCount={view.navigationTotalVisibleCount}
          />

          <div className="item-workspace-divider hidden xl:block" aria-hidden="true" />

          <CatalogPane
            text={view.text}
            browserSourceMode={view.browserSourceMode}
            modItemGroups={view.modItemGroups}
            items={view.paginatedItems}
            totalItems={view.matchingVisibleItems.length}
            currentPage={view.currentPage}
            pageCount={view.pageCount}
            itemsPerPage={view.itemsPerPage}
            activeItemId={view.activeItemId}
            activeModItemSelectionId={view.activeModItemSelectionId}
            textureStatesByAssetName={view.textureStatesByAssetName}
            onSelectItem={view.handleSelectItem}
            onSelectModItem={view.handleSelectModItem}
            onPageChange={view.setCurrentPage}
            onItemsPerPageChange={view.setItemsPerPage}
            catalogViewMode={view.catalogViewMode}
            onCatalogViewModeChange={view.setCatalogViewMode}
          />

          <div className="item-workspace-divider hidden xl:block" aria-hidden="true" />

          <DetailPane
            text={view.text}
            item={view.item}
            textureState={view.activeTextureState}
            heroChips={view.heroChips}
            signalCards={view.signalCards}
            infoRows={view.infoRows}
            resourceRows={view.resourceRows}
            objectDataCards={view.objectDataCards}
            modSources={view.modSources}
            sourceCards={view.sourceCards}
            recipeUseCards={view.recipeUseCards}
            machineUseCards={view.machineUseCards}
            recipeOutputCards={view.recipeOutputCards}
            specificSections={view.specificSections}
            activeDetailTab={view.activeDetailTab}
            onDetailTabChange={view.setActiveDetailTab}
            itemLookup={view.itemLookup}
            textureStatesByAssetName={view.textureStatesByAssetName}
            onOpenItemInAuthoring={view.onOpenItemInAuthoring}
          />
        </div>
      </div>
    </div>
  )
}
