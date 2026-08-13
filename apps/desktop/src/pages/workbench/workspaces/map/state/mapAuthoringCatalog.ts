import type { MapAssetSummary } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import { splitMapTargets } from '../model/mapPatchReducer'

export type MapCatalogCategory = 'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other'

export type MapCatalogEntry = {
  id: string
  target: string
  name: string
  category: MapCatalogCategory
  asset: MapAssetSummary
}

/** Returns the logical Content Patcher target represented by a scanned map file. */
export function mapTargetFromAsset(asset: Pick<MapAssetSummary, 'name'>): string {
  return `Maps/${asset.name
    .replaceAll('\\', '/')
    .replace(/^Maps\//iu, '')
    .replace(/\.(?:xnb|tbin|tmx)$/iu, '')}`
}

/** Normalizes a user-entered map name into a safe `Maps/` asset target. */
export function mapTargetFromName(name: string): string | null {
  const normalized = name
    .trim()
    .replaceAll('\\', '/')
    .replace(/^Maps\//iu, '')
    .replace(/\.(?:xnb|tbin|tmx)$/iu, '')
    .split('/')
    .map((part) => part.replaceAll(/[^\p{L}\p{N}._-]+/gu, '_').replaceAll(/^_+|_+$/gu, ''))
    .filter(Boolean)
    .join('/')
  return normalized ? `Maps/${normalized}` : null
}

/**
 * Resolves the Content Patcher target an EditMap patch should use for a
 * game-map catalog entry. Input targets are already `Maps/`-prefixed; this
 * normalizes separators and whitespace so repeated opens of the same game map
 * dedupe against the same patch target.
 */
export function resolveGameMapPatchTarget(entry: Pick<MapCatalogEntry, 'target'>): string {
  const target = entry.target.trim().replaceAll('\\', '/')
  return target === 'Maps' || target.startsWith('Maps/') ? target : `Maps/${target}`
}

/**
 * Resolves a patch target to the single literal `Maps/` game-map target a
 * patch-row thumbnail can render. Returns null for token expressions, for
 * multi-target Load patches, and for targets outside `Maps/`, so those rows
 * fall back to a static map icon instead of forcing a game-map load.
 */
export function resolvePatchThumbnailTarget(target: string): string | null {
  const split = splitMapTargets(target.trim().replaceAll('\\', '/'))
  if (split.length !== 1) return null
  const single = split[0]!.trim().replaceAll('\\', '/')
  if (single === '' || single.includes('{{') || !/^Maps\//iu.test(single)) return null
  return single.replace(/\.(?:xnb|tbin|tmx)$/iu, '')
}

/** Stable domain grouping used by both the catalog and shared map picker. */
export function mapCatalogCategory(target: string): MapCatalogCategory {
  const key = target.toLowerCase()
  if (/(festival|fair|luau|egg|spirits|winter|flowerdance|jellies)/u.test(key)) return 'festival'
  if (/(island|volcano|caldera)/u.test(key)) return 'island'
  if (/(mine|skull|cave|quarry|sewer)/u.test(key)) return 'mine'
  if (/(farm|greenhouse|cellar)/u.test(key)) return 'farm'
  if (/(town|community|joja|hospital|museum|blacksmith|saloon)/u.test(key)) return 'town'
  if (/(forest|woods|mountain|beach|desert|railroad|backwoods|busstop)/u.test(key)) return 'wild'
  if (/(house|shop|room|hut|guild|club|trailer|cabin)/u.test(key)) return 'interior'
  return 'other'
}

/**
 * Builds the game-map library entries shown by the map workspace gallery.
 *
 * Project maps are authored in the asset library and opened from there, so the
 * gallery only surfaces scanned game maps; clicking one opens (or reuses) the
 * EditMap patch for its target.
 */
export function buildMapCatalogEntries(assets: readonly MapAssetSummary[]): MapCatalogEntry[] {
  return assets
    .map((asset) => {
      const target = mapTargetFromAsset(asset)
      return {
        id: `game:${asset.id}`,
        target,
        name: asset.name,
        category: mapCatalogCategory(target),
        asset,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

/** Minimal editable document used when an author creates a map without a template. */
export function createBlankMapDocument(target: string, width: number, height: number): MapDocument {
  const safeWidth = Math.min(256, Math.max(5, Math.trunc(width)))
  const safeHeight = Math.min(256, Math.max(5, Math.trunc(height)))
  const name = target.replace(/^Maps\//iu, '')
  return {
    name,
    format: 'tmx',
    sourcePath: `assets/maps/${name.replaceAll('/', '_')}.tmx`,
    relativePath: `assets/maps/${name.replaceAll('/', '_')}.tmx`,
    width: safeWidth,
    height: safeHeight,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width: safeWidth,
        height: safeHeight,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: Array.from({ length: safeWidth * safeHeight }, () => 0) as unknown as Uint32Array,
        nonEmptyTiles: 0,
      },
    ],
    objectGroups: [],
  }
}
