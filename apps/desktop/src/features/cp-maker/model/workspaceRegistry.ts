import type { ComponentType } from 'react'
import type { DraftPatch, CpMakerDraft, GameDirectoryInfo, WorkspaceId } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import type { PlayerAppearanceProfile } from '@entities/event'

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
  draft: CpMakerDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset?: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  selectedEventKey?: string | null
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
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
  icon: string
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

/** Registers a CP Maker workspace editor plugin during workbench assembly. */
export function registerWorkspacePlugin(plugin: WorkspacePlugin) {
  workspaceRegistry.set(plugin.id, plugin)
}

/** Returns a registered CP Maker workspace editor plugin by workspace id. */
export function getWorkspacePlugin(id: WorkspaceId): WorkspacePlugin | undefined {
  return workspaceRegistry.get(id)
}

/** Lists registered CP Maker workspace editor plugins in registration order. */
export function listWorkspacePlugins(): WorkspacePlugin[] {
  return Array.from(workspaceRegistry.values())
}

/** Lists registered CP Maker workspace editor ids in registration order. */
export function getWorkspacePluginIds(): WorkspaceId[] {
  return Array.from(workspaceRegistry.keys())
}
