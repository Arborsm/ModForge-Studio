import type { EditorCopy } from '../lib/editor-shell'
import type { MapObject, MapObjectGroup } from '../lib/maps/types'

const INTERACTIVE_OBJECT_PROPERTY_KEYS = ['Action', 'TouchAction', 'Warp', 'NPCWarp', 'LockedDoorWarp', 'MagicWarp']

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
