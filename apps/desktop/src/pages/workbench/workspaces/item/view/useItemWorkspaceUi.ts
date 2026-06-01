import { useCallback, useSyncExternalStore } from 'react'
import type { ItemBrowseCategory } from '../entities/item'
import type { DetailTab } from './itemWorkspaceTypes'

type ItemWorkspaceUiState = {
  activeBrowseTab: ItemBrowseCategory
  activeDetailTab: DetailTab
  hoveredItemId: string | null
  currentPage: number
  itemsPerPage: number
}

const DEFAULT_ITEM_WORKSPACE_UI_STATE: ItemWorkspaceUiState = {
  activeBrowseTab: 'all',
  activeDetailTab: 'info',
  hoveredItemId: null,
  currentPage: 1,
  itemsPerPage: 48,
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

  const setHoveredItemId = useCallback((itemKey: string | null) => {
    updateItemWorkspaceUiState({ hoveredItemId: itemKey })
  }, [])

  const setCurrentPage = useCallback((page: number) => {
    updateItemWorkspaceUiState({ currentPage: page })
  }, [])

  const setItemsPerPage = useCallback((itemsPerPage: number) => {
    updateItemWorkspaceUiState({ itemsPerPage })
  }, [])

  return {
    ...state,
    setActiveBrowseTab,
    setActiveDetailTab,
    setHoveredItemId,
    setCurrentPage,
    setItemsPerPage,
  }
}
