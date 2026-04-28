import type { ComponentType } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../app/useGeneratedProject'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../editor-shell'

export type WorkspaceId = 'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items'

export interface PatchListField {
  key: string
  label: string
  width?: number
}

export interface TargetPickerResult {
  target: string
  action: DraftPatch['action']
}

export type TargetPickerComponent = ComponentType<{
  gameRootPath: string | null
  onSelect: (result: TargetPickerResult) => void
  onCancel: () => void
}>

export type EditorComponent = ComponentType<{
  patch: DraftPatch
  draft: GeneratedProjectDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: {
    relativePath: string
    mediaType: string
    bytesBase64: string
  }) => void
  onRemoveVirtualAsset?: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  selectedEventKey?: string | null
  gameRootPath?: string | null
}>

export type PreviewRendererComponent = ComponentType<{
  gameRootPath: string | null
  directoryInfo: {
    rootPath: string
    executablePath: string
    mapsPath: string | null
    mapCount: number
  } | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  viewportLabels: ViewportLabels
}>

export interface WorkspacePlugin {
  id: WorkspaceId
  label: string
  icon: string // lucide icon name

  editMode: {
    patchListFields: PatchListField[]
    targetPicker: TargetPickerComponent
    editor: EditorComponent
  }

  previewMode?: {
    renderer: PreviewRendererComponent
  }

  serializer: {
    toChangeEntry: (patch: DraftPatch) => Record<string, unknown>
    fromChangeEntry: (change: Record<string, unknown>) => unknown
  }
}

const workspaceRegistry = new Map<WorkspaceId, WorkspacePlugin>()

export function registerWorkspacePlugin(plugin: WorkspacePlugin) {
  workspaceRegistry.set(plugin.id, plugin)
}

export function getWorkspacePlugin(id: WorkspaceId): WorkspacePlugin | undefined {
  return workspaceRegistry.get(id)
}

export function listWorkspacePlugins(): WorkspacePlugin[] {
  return Array.from(workspaceRegistry.values())
}

export function getWorkspacePluginIds(): WorkspaceId[] {
  return Array.from(workspaceRegistry.keys())
}
