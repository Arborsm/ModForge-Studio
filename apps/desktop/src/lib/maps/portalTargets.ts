import { asMapPropertyString } from './properties'
import { stripTileGidFlags } from './tileFlags'
import { findTilesetForGid } from './tilesets'
import type { MapDocument, MapPropertyValue } from './types'

export function parsePortalTargetMapFromAction(rawAction: string) {
  const tokens = rawAction.trim().split(/\s+/u)
  if (!tokens.length) {
    return null
  }

  const actionName = tokens[0]
  if (actionName === 'LockedDoorWarp' && tokens.length >= 4) {
    return tokens[3]
  }

  if (actionName === 'MagicWarp' && tokens.length >= 2) {
    return tokens[1]
  }

  if (actionName === 'Warp') {
    if (tokens.length >= 4 && Number.isFinite(Number(tokens[1])) && Number.isFinite(Number(tokens[2]))) {
      return tokens[3]
    }

    if (tokens.length >= 2) {
      return tokens[1]
    }
  }

  return null
}

export function getPortalTargetMapFromProperties(properties: Record<string, MapPropertyValue>) {
  for (const propertyName of ['Action', 'TouchAction']) {
    const rawAction = asMapPropertyString(properties[propertyName]).trim()
    if (!rawAction) {
      continue
    }

    const targetMap = parsePortalTargetMapFromAction(rawAction)
    if (targetMap) {
      return targetMap
    }
  }

  return null
}

export function getActionTargetMap(rawGid: number, sourceDocument: Pick<MapDocument, 'tilesets'>) {
  const baseGid = stripTileGidFlags(rawGid)
  if (baseGid === 0) {
    return null
  }

  const tileset = findTilesetForGid(sourceDocument.tilesets, baseGid)
  if (!tileset) {
    return null
  }

  const tileId = baseGid - tileset.firstGid
  const tileProperties = tileset.tileProperties[tileId]
  if (!tileProperties) {
    return null
  }

  return getPortalTargetMapFromProperties(tileProperties)
}
