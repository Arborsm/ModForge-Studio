import { useCallback, useSyncExternalStore } from 'react'
import type { ItemBrowseCategory } from '@entities/item'
import type { DetailTab } from './itemWorkspaceTypes'

export type CatalogViewMode = 'list' | 'grid'

type ItemWorkspaceUiState = {
  activeBrowseTab: ItemBrowseCategory
  activeDetailTab: DetailTab
  currentPage: number
  itemsPerPage: number
  catalogViewMode: CatalogViewMode
}

const DEFAULT_ITEM_WORKSPACE_UI_STATE: ItemWorkspaceUiState = {
  activeBrowseTab: 'all',
  activeDetailTab: 'info',
  currentPage: 1,
  itemsPerPage: 12,
  catalogViewMode: 'grid',
}

let itemWorkspaceUiState = DEFAULT_ITEM_WORKSPACE_UI_STATE
const itemWorkspaceUiListeners = new Set<() => void>()

function subscribeItemWorkspaceUi(listener: () => void) {
  itemWorkspaceUiListeners.add(listener)
  return () => itemWorkspaceUiListeners.delete(listener)
}

function getItemWorkspaceUiSnapshot() {
  return itemWorkspaceUiState
}

function updateItemWorkspaceUiState(partial: Partial<ItemWorkspaceUiState>) {
  itemWorkspaceUiState = {
    ...itemWorkspaceUiState,
    ...partial,
  }

  itemWorkspaceUiListeners.forEach((listener) => listener())
}

export function useItemWorkspaceUi() {
  const state = useSyncExternalStore(subscribeItemWorkspaceUi, getItemWorkspaceUiSnapshot)

  const setActiveBrowseTab = useCallback((tab: ItemBrowseCategory) => {
    updateItemWorkspaceUiState({ activeBrowseTab: tab, currentPage: 1 })
  }, [])

  const setActiveDetailTab = useCallback((tab: DetailTab) => {
    updateItemWorkspaceUiState({ activeDetailTab: tab })
  }, [])

  const setCurrentPage = useCallback((page: number) => {
    updateItemWorkspaceUiState({ currentPage: page })
  }, [])

  const setItemsPerPage = useCallback((itemsPerPage: number) => {
    updateItemWorkspaceUiState({ itemsPerPage })
  }, [])

  const setCatalogViewMode = useCallback((mode: CatalogViewMode) => {
    updateItemWorkspaceUiState({ catalogViewMode: mode, currentPage: 1 })
  }, [])

  return {
    ...state,
    setActiveBrowseTab,
    setActiveDetailTab,
    setCurrentPage,
    setItemsPerPage,
    setCatalogViewMode,
  }
}
