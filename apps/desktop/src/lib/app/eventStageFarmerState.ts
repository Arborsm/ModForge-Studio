import type { MapDocument, MapLayer, MapTileset } from '../maps/types'
import type { EventActorState } from './eventStageShared'

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
const FLIPPED_VERTICALLY_FLAG = 0x40000000
const FLIPPED_DIAGONALLY_FLAG = 0x20000000
const FLAG_MASK = (FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG) >>> 0
const TILE_ID_MASK = (~FLAG_MASK) >>> 0

function findTileset(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}

function getLayerByName(mapDocument: MapDocument, layerName: string) {
  const normalizedLayerName = layerName.trim().toLowerCase()
  return mapDocument.layers.find((layer) => layer.name.trim().toLowerCase() === normalizedLayerName) ?? null
}

function getLayerTileGid(layer: MapLayer | null, mapDocument: MapDocument, tileX: number, tileY: number) {
  if (!layer || tileX < 0 || tileY < 0 || tileX >= mapDocument.width || tileY >= mapDocument.height) {
    return 0
  }

  const index = tileY * layer.width + tileX
  return layer.gids[index] ?? 0
}

function getTileProperty(mapDocument: MapDocument, layerName: string, tileX: number, tileY: number, propertyName: string) {
  const layer = getLayerByName(mapDocument, layerName)
  const rawGid = getLayerTileGid(layer, mapDocument, tileX, tileY)
  const gid = (rawGid >>> 0) & TILE_ID_MASK
  if (gid === 0) {
    return null
  }

  const tileset = findTileset(mapDocument.tilesets, gid)
  if (!tileset) {
    return null
  }

  const tileId = gid - tileset.firstGid
  return tileset.tileProperties[tileId]?.[propertyName] ?? null
}

export function deriveMapDrivenFarmerBedState(mapDocument: MapDocument | null, actor: EventActorState) {
  const timeOfDay = actor.farmerRenderState?.timeOfDay ?? 0
  const previousTimeWentToBed = actor.farmerRenderState?.timeWentToBed ?? 0
  const tileX = Math.floor(actor.tileX)
  const tileY = Math.floor(actor.tileY)
  const hasBedTile = mapDocument ? getTileProperty(mapDocument, 'Back', tileX, tileY, 'Bed') != null : false
  const isInBed = hasBedTile

  return {
    isInBed,
    timeWentToBed: isInBed ? (previousTimeWentToBed || timeOfDay) : 0,
  }
}
