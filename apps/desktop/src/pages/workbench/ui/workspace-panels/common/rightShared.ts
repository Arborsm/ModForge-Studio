import type { FocusedMapObjectTarget } from '@shared/contracts'
export {
  formatObjectPreviewMeta,
  getObjectDisplayName,
  getObjectInteractionTag,
  getObjectPropertyKeys,
  rankObjectForPreview,
} from '@entities/map'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import type { GameDirectoryInfo } from '@shared/contracts'
import type { ModuleBlueprint, WorkspaceTone } from '@locales/editor-shell'
import type { MapDocument, MapObject, MapObjectGroup } from '@shared/contracts'

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

export function getVisibilityGroupLabel(name: string, fallbackLabel: string) {
  const separatorIndex = name.indexOf(' / ')
  return separatorIndex >= 0 ? name.slice(0, separatorIndex) : fallbackLabel
}
