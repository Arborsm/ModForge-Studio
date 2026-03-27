import type { MapAssetSummary } from '../desktop'
import type { MapDocument } from '../maps/types'
import { getWorldAtlasNameAliases } from '../maps/world'
import { DEFAULT_WORLD_ATLAS_VIEW_ZOOM, WORLD_ATLAS_TAB_ID } from './constants'
import type { MapWorkspaceTab, WorldAtlasViewId } from './types'

export function getMapWorkspaceTabId(assetId: string) {
  return `map:${assetId}`
}

export function getPreferredScene(assets: MapAssetSummary[]) {
  return (
    assets.find((asset) => asset.format === 'xnb' && /^town$/i.test(asset.name)) ??
    assets.find((asset) => asset.format === 'xnb') ??
    null
  )
}

export function withWorldAtlasViewMetadata(document: MapDocument, viewId: WorldAtlasViewId, label: string): MapDocument {
  const townPlacement =
    viewId === 'main' ? document.atlas?.placements.find((placement) => /^town$/i.test(placement.mapName)) : null

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

export function pickWorldAtlasRootMapName(mapDocuments: MapDocument[], candidates: readonly string[]) {
  const availableNames = new Set(mapDocuments.map((document) => document.name.trim().toLowerCase()))
  for (const candidate of candidates) {
    if (availableNames.has(candidate.trim().toLowerCase())) {
      return candidate
    }
  }

  return mapDocuments[0]?.name ?? null
}

export function matchesWorldAtlasMapName(left: string, right: string) {
  const rightAliases = new Set(getWorldAtlasNameAliases(right))
  return getWorldAtlasNameAliases(left).some((alias) => rightAliases.has(alias))
}

export function isRemoteWorldAtlasDocument(document: MapDocument) {
  const normalizedName = document.name.trim().toLowerCase()
  const locationContext =
    typeof document.properties.LocationContext === 'string'
      ? document.properties.LocationContext.trim().toLowerCase()
      : ''

  return (
    normalizedName === 'desert' ||
    normalizedName === 'summit' ||
    normalizedName.startsWith('island_') ||
    locationContext === 'island'
  )
}

export function getDefaultVisibleLayerIds(nextDocument: MapDocument) {
  return nextDocument.layers.filter((layer) => layer.visible).map((layer) => layer.id)
}

export function getDefaultVisibleObjectGroupIds(nextDocument: MapDocument) {
  return nextDocument.objectGroups.filter((group) => group.visible).map((group) => group.id)
}

export function buildWorkspaceTabs(worldAtlasDocument: MapDocument | null, mapTabs: MapWorkspaceTab[]) {
  return [
    {
      id: WORLD_ATLAS_TAB_ID,
      title: worldAtlasDocument?.name ?? 'World Atlas',
      pathLabel: worldAtlasDocument?.relativePath ?? 'World Atlas',
      closable: false,
      pinned: true,
    },
    ...mapTabs.map((tab) => ({
      id: tab.id,
      title: tab.document.name,
      pathLabel: tab.document.relativePath,
      closable: true,
      pinned: false,
    })),
  ]
}
