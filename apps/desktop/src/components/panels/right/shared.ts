import type { FocusedMapObjectTarget } from '../../MapViewport'
import type { ModSourceEntry } from '../../../lib/app/modAssetIndex'
import type { GameDirectoryInfo } from '../../../lib/desktop'
import type { EditorCopy, ModuleBlueprint, WorkspaceTone } from '../../../lib/editor-shell'
import type { MapDocument, MapObject, MapObjectGroup } from '../../../lib/maps/types'

export type VisibilityListItem = {
  id: number
  name: string
  meta: string
  visible: boolean
  active?: boolean
  groupLabel: string
  setVisible: (visible: boolean) => void
}

export type ObjectGroupListItem = {
  id: number
  name: string
  groupLabel: string
  visible: boolean
  objectCount: number
  pointCount: number
  interactionCount: number
  propertyKeys: string[]
  previewObjects: MapObject[]
  group: MapObjectGroup
  setVisible: (visible: boolean) => void
}

export type InspectorPanelProps = {
  mapDocument: MapDocument | null
  modSources?: ModSourceEntry[]
  moduleBlueprint?: ModuleBlueprint
}

export type LayersPanelProps = {
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  onToggleLayer: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
}

export type ObjectGroupsPanelProps = {
  mapDocument: MapDocument | null
  visibleObjectGroupIds: number[]
  onToggleObjectGroup: (id: number) => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}

export type DiagnosticsPanelProps = {
  directoryInfo: GameDirectoryInfo | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  workspaceStatus: {
    tone: WorkspaceTone
    message: string
  }
}

const INTERACTIVE_OBJECT_PROPERTY_KEYS = ['Action', 'TouchAction', 'Warp', 'NPCWarp', 'LockedDoorWarp', 'MagicWarp']

export function getVisibilityGroupLabel(name: string, fallbackLabel: string) {
  const separatorIndex = name.indexOf(' / ')
  return separatorIndex >= 0 ? name.slice(0, separatorIndex) : fallbackLabel
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
