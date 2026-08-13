import type { EditorCopy } from '@locales/api'
import type { MapObject, MapObjectGroup } from '@entities/map'
import { asMapPropertyString } from './properties'

const INTERACTIVE_OBJECT_PROPERTY_KEYS = ['Action', 'TouchAction', 'Warp', 'NPCWarp', 'LockedDoorWarp', 'MagicWarp']
const LIGHT_MARKER_PROPERTY_KEYS = ['QualifiedItemId', 'qualifiedItemId', 'ItemId', 'itemId', 'IsOn', 'isOn']
const LIGHT_MARKER_FLAG_KEY = 'MFMarker'
const LIGHT_MARKER_FLAG_VALUE = 'light'

/**
 * Whether a `TileData` object is one of this editor's light markers rather
 * than a community/rule object. Matches objects carrying the editor's private
 * `MFMarker: 'light'` flag, objects holding a light-item property
 * (`QualifiedItemId`/`ItemId`/`IsOn` or their lower-case spellings), and —
 * as a migration heuristic for legacy plain markers — objects with no
 * properties at all but a real footprint (0×0 point objects never match).
 * Objects named other than `TileData` never match, and rule objects
 * (Action/NoSpawn/NPCBarrier/…) always carry properties so they never match.
 */
export function isLightMarkerObject(object: MapObject): boolean {
  if (object.name !== 'TileData') {
    return false
  }

  const { properties } = object
  if (asMapPropertyString(properties[LIGHT_MARKER_FLAG_KEY]) === LIGHT_MARKER_FLAG_VALUE) {
    return true
  }
  if (LIGHT_MARKER_PROPERTY_KEYS.some((key) => key in properties)) {
    return true
  }
  return Object.keys(properties).length === 0 && object.width > 0 && object.height > 0
}

export function getObjectDisplayName(object: MapObject, copy: EditorCopy) {
  return object.name || object.type || copy.common.objectLabel(object.id)
}

export function getObjectInteractionTag(object: MapObject) {
  for (const key of INTERACTIVE_OBJECT_PROPERTY_KEYS) {
    if (key in object.properties) {
      return key
    }
  }

  return null
}

export function getObjectPropertyKeys(group: MapObjectGroup) {
  const keys = new Set<string>()

  for (const object of group.objects) {
    for (const key of Object.keys(object.properties)) {
      keys.add(key)
      if (keys.size >= 4) {
        return Array.from(keys)
      }
    }
  }

  return Array.from(keys)
}

export function rankObjectForPreview(object: MapObject) {
  let score = 0

  if (getObjectInteractionTag(object)) {
    score += 100
  }
  if (object.name) {
    score += 40
  }
  if (object.type) {
    score += 20
  }
  if (object.width === 0 && object.height === 0) {
    score += 10
  }

  return score
}

export function formatObjectPreviewMeta(object: MapObject, copy: EditorCopy) {
  const segments = [
    object.type ? `${copy.common.type}: ${object.type}` : null,
    `${copy.common.bounds}: ${Math.round(object.x)}, ${Math.round(object.y)} / ${Math.round(object.width)} x ${Math.round(object.height)}`,
  ].filter((segment): segment is string => Boolean(segment))

  const interactionTag = getObjectInteractionTag(object)
  if (interactionTag) {
    segments.unshift(interactionTag)
  }

  return segments.join(' / ')
}
