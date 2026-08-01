import type { MapAssetSummary } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import type { DraftPatch, ProjectAssetRef } from '@features/cp-maker'

export type MapCatalogCategory = 'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other'

export type MapCatalogEntry = {
  id: string
  target: string
  name: string
  category: MapCatalogCategory
  sourceKind: 'project' | 'game'
  patch: DraftPatch | null
  asset: MapAssetSummary | null
  projectAsset: ProjectAssetRef | null
  embeddedDocument: MapDocument | null
}

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
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

function embeddedMapDocument(patch: DraftPatch): MapDocument | null {
  const state = patch.editorState
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null
  const document = (state as Record<string, unknown>)['mapDocument']
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return null
  return document as MapDocument
}

function mapTargetFromProjectAsset(asset: ProjectAssetRef): string {
  const fileName = asset.relativePath.replaceAll('\\', '/').split('/').at(-1) ?? asset.relativePath
  return `Maps/${fileName.replace(/\.(?:tmx|tbin)$/iu, '')}`
}

/** Builds distinct project-file, map-change, and game-map entries for the map library. */
export function buildMapCatalogEntries(
  patches: readonly DraftPatch[],
  assets: readonly MapAssetSummary[],
  projectAssets: readonly ProjectAssetRef[] = [],
): MapCatalogEntry[] {
  const mapPatches = patches.filter(
    (patch) => (patch.action === 'EditMap' || patch.action === 'Load') && normalizeTarget(patch.target).startsWith('maps/'),
  )
  const patchByTarget = new Map(mapPatches.map((patch) => [normalizeTarget(patch.target), patch]))
  const assetByTarget = new Map(assets.map((asset) => [normalizeTarget(mapTargetFromAsset(asset)), asset]))
  const entries: MapCatalogEntry[] = []

  for (const patch of mapPatches) {
    const target = patch.target.trim().replaceAll('\\', '/') || 'Maps/Untitled'
    const asset = assetByTarget.get(normalizeTarget(target)) ?? null
    entries.push({
      id: `project:${patch.id}`,
      target,
      name: target.replace(/^Maps\//iu, ''),
      category: mapCatalogCategory(target),
      sourceKind: 'project',
      patch,
      asset,
      projectAsset: null,
      embeddedDocument: embeddedMapDocument(patch),
    })
  }

  for (const projectAsset of projectAssets.filter((asset) => /\.(?:tmx|tbin)$/iu.test(asset.relativePath))) {
    const target = mapTargetFromProjectAsset(projectAsset)
    entries.push({
      id: `project-asset:${projectAsset.relativePath.toLowerCase()}`,
      target,
      name: projectAsset.relativePath.split('/').at(-1) ?? projectAsset.relativePath,
      category: mapCatalogCategory(target),
      sourceKind: 'project',
      patch: null,
      asset: null,
      projectAsset,
      embeddedDocument: null,
    })
  }

  for (const asset of assets) {
    const target = mapTargetFromAsset(asset)
    if (patchByTarget.has(normalizeTarget(target))) continue
    entries.push({
      id: `game:${asset.id}`,
      target,
      name: asset.name,
      category: mapCatalogCategory(target),
      sourceKind: 'game',
      patch: null,
      asset,
      projectAsset: null,
      embeddedDocument: null,
    })
  }

  return entries.sort((left, right) => {
    if (left.sourceKind !== right.sourceKind) return left.sourceKind === 'project' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
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
