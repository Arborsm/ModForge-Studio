import type { MapDocument, MapPropertyValue } from '../maps/types'

export type StageWorldOverlaySprite = {
  id: string
  textureName: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  pixelX: number
  pixelY: number
  width: number
  height: number
  zIndex: number
}

export type StageBuildingDataEntry = {
  Texture?: string | null
  Size?: { X: number; Y: number } | null
  SourceRect?: { X: number; Y: number; Width: number; Height: number } | null
  DrawOffset?: { X: number; Y: number } | null
  SortTileOffset?: number | null
}

const TILE_ID_MASK =
  ~(
    0x80000000 |
    0x40000000 |
    0x20000000 |
    0x10000000
  ) >>> 0

const STANDARD_OBJECT_SHEET_COLUMNS = 24

function normalizeMapNameToken(value: string) {
  return value.trim().toLowerCase()
}

function parseMapPointPropertyValue(value: MapPropertyValue | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const [rawX, rawY] = value.trim().split(/\s+/u)
  const x = Number.parseFloat(rawX ?? '')
  const y = Number.parseFloat(rawY ?? '')
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function getMapPropertyPoint(mapDocument: MapDocument, key: string) {
  return parseMapPointPropertyValue(mapDocument.properties[key])
}

function findTilesetForGid(mapDocument: MapDocument, gid: number) {
  const tileGid = gid & TILE_ID_MASK
  let candidate = null as MapDocument['tilesets'][number] | null

  for (const tileset of mapDocument.tilesets) {
    if (tileGid >= tileset.firstGid) {
      candidate = tileset
    } else {
      break
    }
  }

  return candidate ? { tileset: candidate, tileId: tileGid - candidate.firstGid } : null
}

function getStandardSheetSourceRect(tileIndex: number, tileWidth: number, tileHeight: number, columns = STANDARD_OBJECT_SHEET_COLUMNS) {
  return {
    x: (tileIndex % columns) * tileWidth,
    y: Math.floor(tileIndex / columns) * tileHeight,
    width: tileWidth,
    height: tileHeight,
  }
}

function getBushSourceRect(size: 0 | 1 | 2 | 4, tileX: number, isTownMap: boolean) {
  const townBush = isTownMap && (size === 0 || size === 1 || size === 2) && tileX % 5 !== 0
  switch (size) {
    case 0:
      return { x: 0, y: 224, width: 16, height: 32, effectiveSize: 0, townBush }
    case 1:
      return townBush
        ? { x: 0, y: 96, width: 32, height: 32, effectiveSize: 1, townBush }
        : { x: 0, y: 0, width: 32, height: 48, effectiveSize: 1, townBush }
    case 2:
      return townBush
        ? { x: 48, y: 176, width: 48, height: 48, effectiveSize: 2, townBush }
        : { x: 0, y: 128, width: 48, height: 48, effectiveSize: 2, townBush }
    case 4:
      return { x: 0, y: 320, width: 32, height: 32, effectiveSize: 1, townBush: false }
  }
}

function buildBushOverlaySprite(mapName: string, tileX: number, tileY: number, size: 0 | 1 | 2 | 4): StageWorldOverlaySprite {
  const sourceRect = getBushSourceRect(size, tileX, normalizeMapNameToken(mapName) === 'town')
  const anchorX = tileX * 64 + ((sourceRect.effectiveSize + 1) * 64) / 2
  const anchorY =
    (tileY + 1) * 64 -
    (sourceRect.effectiveSize > 0 && (!sourceRect.townBush || sourceRect.effectiveSize !== 1) && size !== 4 ? 64 : 0)
  const originX = ((sourceRect.effectiveSize + 1) * 16) / 2
  const originY = 32

  return {
    id: `bush:${size}:${tileX}:${tileY}`,
    textureName: 'TileSheets\\bushes',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    pixelX: anchorX - originX * 4,
    pixelY: anchorY - originY * 4,
    width: sourceRect.width * 4,
    height: sourceRect.height * 4,
    zIndex: Math.round((tileY + sourceRect.effectiveSize + 1) * 100),
  }
}

function getTreePreviewSourceRect(treeId: string) {
  switch (treeId) {
    case '1':
      return { x: 0, y: 0, width: 48, height: 96 }
    case '2':
      return { x: 48, y: 0, width: 48, height: 96 }
    case '3':
      return { x: 96, y: 0, width: 48, height: 96 }
    case '6':
      return { x: 240, y: 0, width: 48, height: 96 }
    case '8':
      return { x: 288, y: 0, width: 48, height: 96 }
    case '9':
      return { x: 336, y: 0, width: 48, height: 96 }
    default:
      return { x: 0, y: 0, width: 48, height: 96 }
  }
}

function buildTreeOverlaySprite(tileX: number, tileY: number, treeId: string): StageWorldOverlaySprite {
  const sourceRect = getTreePreviewSourceRect(treeId)
  const width = sourceRect.width * 4
  const height = sourceRect.height * 4

  return {
    id: `tree:${treeId}:${tileX}:${tileY}`,
    textureName: 'TileSheets\\trees',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    pixelX: tileX * 64 + 32 - width / 2,
    pixelY: (tileY + 1) * 64 - height,
    width,
    height,
    zIndex: Math.round((tileY + 1) * 100),
  }
}

function getGrassSourceRect(grassType: number) {
  const clampedType = Math.max(1, Math.min(7, grassType))
  return { x: (clampedType - 1) * 15, y: 0, width: 15, height: 20 }
}

function buildGrassOverlaySprite(tileX: number, tileY: number, grassType: number): StageWorldOverlaySprite {
  const sourceRect = getGrassSourceRect(grassType)
  const width = sourceRect.width * 4
  const height = sourceRect.height * 4

  return {
    id: `grass:${grassType}:${tileX}:${tileY}`,
    textureName: 'TileSheets\\grass',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    pixelX: tileX * 64 + 32 - width / 2,
    pixelY: (tileY + 1) * 64 - height,
    width,
    height,
    zIndex: Math.round((tileY + 1) * 100) - 10,
  }
}

function buildResourceClumpOverlaySprite(tileX: number, tileY: number, tileIndex: number): StageWorldOverlaySprite {
  const sourceRect = getStandardSheetSourceRect(tileIndex, 16, 16)

  return {
    id: `resource-clump:${tileIndex}:${tileX}:${tileY}`,
    textureName: 'Maps\\springobjects',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: 32,
    sourceHeight: 32,
    pixelX: tileX * 64,
    pixelY: tileY * 64,
    width: 128,
    height: 128,
    zIndex: Math.round((tileY + 2) * 100),
  }
}

function pickRandomTreePreviewId(mapDocument: MapDocument, tileX: number, tileY: number) {
  const seed = normalizeMapNameToken(mapDocument.name)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)

  return ['1', '2', '3'][(seed + tileX * 17 + tileY * 31) % 3] ?? '1'
}

function getTreePreviewIdForPathTile(
  mapDocument: MapDocument,
  tileId: number,
  tileProperties: Record<string, MapPropertyValue> | undefined,
  tileX: number,
  tileY: number,
) {
  switch (tileId) {
    case 9:
      return '1'
    case 10:
      return '2'
    case 11:
      return '3'
    case 12:
      return '6'
    case 23:
      return pickRandomTreePreviewId(mapDocument, tileX, tileY)
    case 31:
      return '9'
    case 32:
      return '8'
    case 34: {
      const spawnTree = tileProperties?.SpawnTree
      if (typeof spawnTree !== 'string') {
        return null
      }

      const [, rawId] = spawnTree.trim().split(/\s+/u)
      return rawId?.trim() || null
    }
    default:
      return null
  }
}

function getStarterFarmBuildings(mapDocument: MapDocument) {
  const normalizedName = normalizeMapNameToken(mapDocument.name)
  if (!normalizedName.startsWith('farm')) {
    return [] as Array<{ id: string; tileX: number; tileY: number }>
  }

  const farmhouseEntry = getMapPropertyPoint(mapDocument, 'FarmHouseEntry') ?? { x: 64, y: 15 }
  const greenhouseLocation =
    getMapPropertyPoint(mapDocument, 'GreenhouseLocation') ??
    (normalizedName === 'farm_fourcorners'
      ? { x: 36, y: 29 }
      : normalizedName === 'farm_island'
        ? { x: 14, y: 14 }
        : { x: 25, y: 10 })
  const shippingBinLocation = getMapPropertyPoint(mapDocument, 'ShippingBinLocation') ?? { x: 71, y: 14 }
  const petBowlLocation = getMapPropertyPoint(mapDocument, 'PetBowlLocation') ?? { x: 53, y: 7 }

  return [
    { id: 'Farmhouse', tileX: farmhouseEntry.x - 5, tileY: farmhouseEntry.y - 3 },
    { id: 'Greenhouse', tileX: greenhouseLocation.x, tileY: greenhouseLocation.y },
    { id: 'Shipping Bin', tileX: shippingBinLocation.x, tileY: shippingBinLocation.y },
    { id: 'Pet Bowl', tileX: petBowlLocation.x, tileY: petBowlLocation.y },
  ]
}

function buildDefaultBuildingOverlaySprites(
  mapDocument: MapDocument,
  buildingDataIndex: Record<string, StageBuildingDataEntry>,
): StageWorldOverlaySprite[] {
  return getStarterFarmBuildings(mapDocument)
    .map((placement) => {
      const data = buildingDataIndex[placement.id]
      const sourceRect = data?.SourceRect
      const size = data?.Size
      if (!data?.Texture || !sourceRect || !size) {
        return null
      }

      const drawOffset = data.DrawOffset ?? { X: 0, Y: 0 }
      const sortTileOffset = data.SortTileOffset ?? 0
      return {
        id: `building:${placement.id}:${placement.tileX}:${placement.tileY}`,
        textureName: data.Texture.replaceAll('/', '\\'),
        sourceX: sourceRect.X,
        sourceY: sourceRect.Y,
        sourceWidth: sourceRect.Width,
        sourceHeight: sourceRect.Height,
        pixelX: placement.tileX * 64 + drawOffset.X * 4,
        pixelY: placement.tileY * 64 + size.Y * 64 + drawOffset.Y * 4 - sourceRect.Height * 4,
        width: sourceRect.Width * 4,
        height: sourceRect.Height * 4,
        zIndex: Math.round((placement.tileY + size.Y - sortTileOffset) * 100),
      }
    })
    .filter((item): item is StageWorldOverlaySprite => item !== null)
}

function buildPathLayerWorldOverlaySprites(mapDocument: MapDocument): StageWorldOverlaySprite[] {
  const pathsLayer = mapDocument.layers.find((layer) => normalizeMapNameToken(layer.name) === 'paths')
  if (!pathsLayer) {
    return []
  }

  const overlays: StageWorldOverlaySprite[] = []
  for (let tileY = 0; tileY < pathsLayer.height; tileY += 1) {
    for (let tileX = 0; tileX < pathsLayer.width; tileX += 1) {
      const gid = pathsLayer.gids[tileY * pathsLayer.width + tileX] ?? 0
      if (!gid) {
        continue
      }

      const resolved = findTilesetForGid(mapDocument, gid)
      const tileId = resolved?.tileId ?? -1
      const tileProperties = resolved?.tileset.tileProperties[tileId]
      const treePreviewId = getTreePreviewIdForPathTile(mapDocument, tileId, tileProperties, tileX, tileY)

      if (treePreviewId) {
        overlays.push(buildTreeOverlaySprite(tileX, tileY, treePreviewId))
        continue
      }

      switch (tileId) {
        case 19:
          overlays.push(buildResourceClumpOverlaySprite(tileX, tileY, 602))
          break
        case 20:
          overlays.push(buildResourceClumpOverlaySprite(tileX, tileY, 672))
          break
        case 21:
          overlays.push(buildResourceClumpOverlaySprite(tileX, tileY, 600))
          break
        case 22:
          overlays.push(buildGrassOverlaySprite(tileX, tileY, 1))
          break
        case 24:
          overlays.push(buildBushOverlaySprite(mapDocument.name, tileX, tileY, 2))
          break
        case 25:
          overlays.push(buildBushOverlaySprite(mapDocument.name, tileX, tileY, 1))
          break
        case 26:
          overlays.push(buildBushOverlaySprite(mapDocument.name, tileX, tileY, 0))
          break
        case 33:
          overlays.push(buildBushOverlaySprite(mapDocument.name, tileX, tileY, 4))
          break
        case 36:
          overlays.push(buildGrassOverlaySprite(tileX, tileY, 7))
          break
        default:
          break
      }
    }
  }

  return overlays
}

export function buildStageWorldOverlaySprites(
  mapDocument: MapDocument | null,
  buildingDataIndex: Record<string, StageBuildingDataEntry>,
) {
  if (!mapDocument || mapDocument.format === 'atlas') {
    return []
  }

  return [...buildPathLayerWorldOverlaySprites(mapDocument), ...buildDefaultBuildingOverlaySprites(mapDocument, buildingDataIndex)]
}

export function buildAtlasWorldOverlaySprites(
  atlasDocument: MapDocument | null,
  resolvePlacementDocument: (sourcePath: string) => MapDocument | null,
  buildingDataIndex: Record<string, StageBuildingDataEntry>,
) {
  if (!atlasDocument?.atlas?.placements?.length) {
    return []
  }

  return atlasDocument.atlas.placements.flatMap((placement) => {
    const sourceDocument = resolvePlacementDocument(placement.sourcePath)
    if (!sourceDocument) {
      return []
    }

    const placementSprites = buildStageWorldOverlaySprites(sourceDocument, buildingDataIndex)
    if (placementSprites.length === 0) {
      return []
    }

    const pixelOffsetX = placement.offsetX * 64
    const pixelOffsetY = placement.offsetY * 64

    return placementSprites.map((sprite) => ({
      ...sprite,
      id: `${placement.mapName}:${sprite.id}`,
      pixelX: sprite.pixelX + pixelOffsetX,
      pixelY: sprite.pixelY + pixelOffsetY,
    }))
  })
}

export function buildBuildingDataIndex(content: string) {
  return JSON.parse(content) as Record<string, StageBuildingDataEntry>
}
