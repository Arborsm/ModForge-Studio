/**
 * Which editor a CP Maker patch opens in.
 *
 * Routing is a declared table, not a heuristic: the Content Patcher action
 * decides the asset family, and `EditData` targets are looked up by asset id
 * against the editors that actually exist. Anything unlisted falls to `raw`,
 * the explicit JSON escape hatch, so an unsupported asset says so instead of
 * pretending to be edited by a nearby editor.
 */

import { BUILDING_DATA_ASSET_ID } from '@entities/building'
import { CHARACTER_DATA_ASSET_ID } from '@entities/character'
import { OBJECT_DATA_ASSET_ID } from '@entities/item'

export type EditorKind = 'map' | 'image' | 'character-data' | 'building-data' | 'item-data' | 'events' | 'raw'

/** Minimal structural view of a patch needed to pick its editor. */
export type EditorRoutingPatch = {
  action: string
  target: string
}

type AssetRoute = {
  assetId: string
  match: 'exact' | 'prefix'
  kind: EditorKind
}

/**
 * `EditData` targets with a structured editor. `exact` entries name a single
 * asset (and carry a registered `AssetSchema`); `prefix` entries name an asset
 * family whose per-location members share one editor.
 */
const DATA_ASSET_ROUTES: readonly AssetRoute[] = [
  { assetId: CHARACTER_DATA_ASSET_ID, match: 'exact', kind: 'character-data' },
  { assetId: BUILDING_DATA_ASSET_ID, match: 'exact', kind: 'building-data' },
  // Only the object family is modelled this round; `Data/Weapons` and the rest
  // deliberately fall through to `raw`.
  { assetId: OBJECT_DATA_ASSET_ID, match: 'exact', kind: 'item-data' },
  { assetId: 'Data/Events/', match: 'prefix', kind: 'events' },
]

/** Asset families a whole-file `Load` replaces through the image editor. */
const LOAD_IMAGE_PREFIXES = ['Portraits/', 'Characters/', 'TileSheets/', 'LooseSprites/', 'Animals/', 'Buildings/'] as const

/** Asset family a whole-file `Load` replaces through the map editor. */
const LOAD_MAP_PREFIX = 'Maps/'

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

function dataAssetKind(target: string): EditorKind {
  const normalized = normalizeTarget(target)
  for (const route of DATA_ASSET_ROUTES) {
    const routeId = normalizeTarget(route.assetId)
    if (route.match === 'exact' ? normalized === routeId : normalized.startsWith(routeId)) {
      return route.kind
    }
  }
  return 'raw'
}

function loadKind(target: string): EditorKind {
  const normalized = normalizeTarget(target)
  if (normalized.startsWith(normalizeTarget(LOAD_MAP_PREFIX))) {
    return 'map'
  }
  return LOAD_IMAGE_PREFIXES.some((prefix) => normalized.startsWith(normalizeTarget(prefix))) ? 'image' : 'raw'
}

/** Resolves the editor a patch opens in; `raw` means no structured editor exists. */
export function selectEditorKind(patch: EditorRoutingPatch): EditorKind {
  switch (patch.action) {
    case 'EditMap':
      return 'map'
    case 'EditImage':
      return 'image'
    case 'Load':
      return loadKind(patch.target)
    case 'EditData':
      return dataAssetKind(patch.target)
    default:
      return 'raw'
  }
}
