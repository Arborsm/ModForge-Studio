import type { MapAssetSummary } from '@shared/contracts'
import type { MapDocument } from '@shared/contracts'
import type { WorldAtlasViewId } from '@shared/contracts'
import { getWorldAtlasNameAliases } from './lib/world'

/** Stable tab id for the generated world atlas view. */
export const WORLD_ATLAS_TAB_ID = 'world-atlas'
/** Stable tab id for the transient map preview tab. */
export const MAP_PREVIEW_TAB_ID = 'map:preview'
/** Default zoom used when centering generated world atlas views. */
export const DEFAULT_WORLD_ATLAS_VIEW_ZOOM = 1

/** Open map tab state owned by the map workspace. */
export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
  preview: boolean
  dirty: boolean
}

/** Builds the stable workspace tab id for a loaded map asset. */
export function getMapWorkspaceTabId(assetId: string) {
  return `map:${assetId}`
}

function getPathFileStem(path: string) {
  const normalizedPath = path.trim().replaceAll('\\', '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  return fileName.replace(/\.[^.]+$/u, '')
}

/** Chooses the best human-readable title for a map document. */
export function getMapDocumentDisplayTitle(mapDocument: MapDocument | null | undefined) {
  const documentName = mapDocument?.name?.trim()
  if (documentName) {
    return documentName
  }

  const relativePathName = mapDocument?.relativePath ? getPathFileStem(mapDocument.relativePath) : ''
  if (relativePathName) {
    return relativePathName
  }

  const sourcePathName = mapDocument?.sourcePath ? getPathFileStem(mapDocument.sourcePath) : ''
  return sourcePathName || 'Untitled Map'
}

/** Chooses the best path label for a map document tab or status surface. */
export function getMapDocumentPathLabel(mapDocument: MapDocument | null | undefined) {
  const relativePath = mapDocument?.relativePath?.trim()
  if (relativePath) {
    return relativePath
  }

  const sourcePath = mapDocument?.sourcePath?.trim()
  return sourcePath || getMapDocumentDisplayTitle(mapDocument)
}

/** Picks the best default scene from scanned map assets, preferring vanilla Town. */
export function getPreferredScene(assets: MapAssetSummary[]) {
  return (
    assets.find((asset) => asset.format === 'xnb' && /^town$/i.test(asset.name)) ?? assets.find((asset) => asset.format === 'xnb') ?? null
  )
}

/** Adds view metadata and default viewport hints to a generated world atlas document. */
export function withWorldAtlasViewMetadata(document: MapDocument, viewId: WorldAtlasViewId, label: string): MapDocument {
  const townPlacement = viewId === 'main' ? document.atlas?.placements.find((placement) => /^town$/i.test(placement.mapName)) : null

  return {
    ...document,
    name: `World Atlas / ${label}`,
    relativePath: `World Atlas / ${label}`,
    properties: {
      ...document.properties,
      atlasViewId: viewId,
      atlasViewLabel: label,
      ...(townPlacement
        ? {
            defaultViewportCenterX: (townPlacement.offsetX + townPlacement.width / 2) * document.tileWidth,
            defaultViewportCenterY: (townPlacement.offsetY + townPlacement.height / 2) * document.tileHeight,
            defaultViewportZoom: DEFAULT_WORLD_ATLAS_VIEW_ZOOM,
          }
        : {}),
    },
  }
}

/** Picks a root map name for atlas building from preferred candidates and available maps. */
export function pickWorldAtlasRootMapName(mapDocuments: MapDocument[], candidates: readonly string[]) {
  const availableNames = new Set(mapDocuments.map((document) => document.name.trim().toLowerCase()))
  for (const candidate of candidates) {
    if (availableNames.has(candidate.trim().toLowerCase())) {
      return candidate
    }
  }

  return mapDocuments[0]?.name ?? null
}

/** Compares map names using known world-atlas aliases. */
export function matchesWorldAtlasMapName(left: string, right: string) {
  const rightAliases = new Set(getWorldAtlasNameAliases(right))
  return getWorldAtlasNameAliases(left).some((alias) => rightAliases.has(alias))
}

/** Returns true for generated atlas documents that represent remote world regions. */
export function isRemoteWorldAtlasDocument(document: MapDocument) {
  const normalizedName = document.name.trim().toLowerCase()
  const locationContext =
    typeof document.properties.LocationContext === 'string' ? document.properties.LocationContext.trim().toLowerCase() : ''

  return normalizedName === 'desert' || normalizedName === 'summit' || normalizedName.startsWith('island_') || locationContext === 'island'
}

/** Returns visible tile layer ids for a newly loaded map document. */
export function getDefaultVisibleLayerIds(nextDocument: MapDocument) {
  return nextDocument.layers.filter((layer) => layer.visible).map((layer) => layer.id)
}

/** Returns visible object group ids for a newly loaded map document. */
export function getDefaultVisibleObjectGroupIds(nextDocument: MapDocument) {
  return nextDocument.objectGroups.filter((group) => group.visible).map((group) => group.id)
}

/** Builds tab view models for the world atlas plus user-opened map tabs. */
export function buildMapWorkspaceTabs(worldAtlasDocument: MapDocument | null, mapTabs: MapWorkspaceTab[]) {
  return [
    {
      id: WORLD_ATLAS_TAB_ID,
      title: getMapDocumentDisplayTitle(worldAtlasDocument),
      pathLabel: getMapDocumentPathLabel(worldAtlasDocument),
      closable: false,
      pinned: true,
    },
    ...mapTabs.map((tab) => ({
      id: tab.id,
      title: getMapDocumentDisplayTitle(tab.document),
      pathLabel: getMapDocumentPathLabel(tab.document),
      closable: true,
      pinned: false,
    })),
  ]
}
