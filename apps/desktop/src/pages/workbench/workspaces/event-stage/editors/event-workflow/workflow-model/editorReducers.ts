import { type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { type ResourceRegistry } from '@entities/game/api'

export type ItemCatalogState = {
  entries: ItemWorkspaceEntry[]
  texturesByAssetName: Record<string, ItemTextureAssetState>
}

export type ItemCatalogAction =
  | { type: 'reset' }
  | { type: 'entries'; entries: ItemWorkspaceEntry[] }
  | { type: 'textures'; texturesByAssetName: Record<string, ItemTextureAssetState> }

export function itemCatalogReducer(state: ItemCatalogState, action: ItemCatalogAction): ItemCatalogState {
  switch (action.type) {
    case 'reset':
      return { entries: [], texturesByAssetName: {} }
    case 'entries':
      return { entries: action.entries, texturesByAssetName: {} }
    case 'textures':
      return { ...state, texturesByAssetName: action.texturesByAssetName }
  }
}

export type GlobalResourceRegistryAction = { type: 'reset' } | { type: 'loaded'; registry: ResourceRegistry }

export function globalResourceRegistryReducer(
  _state: ResourceRegistry | null,
  action: GlobalResourceRegistryAction,
): ResourceRegistry | null {
  switch (action.type) {
    case 'reset':
      return null
    case 'loaded':
      return action.registry
  }
}
