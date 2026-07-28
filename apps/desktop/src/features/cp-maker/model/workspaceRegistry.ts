import type { ComponentType } from 'react'
import type { AssetSchema } from '@entities/asset-schema'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { AssetDraftPort } from './draftPort'
import type { DraftPatch, WorkspaceId } from './types'

/** Host environment an editor renders against; never carries locale copy. */
export type EditorResources = {
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
}

/**
 * Everything a registered editor receives. `schema` is null when the patch
 * target has no registered `AssetSchema`, which is the only case that routes to
 * the raw JSON escape hatch. Copy is not passed: editors consume their own
 * typed locale bundles.
 */
export type EditorProps = {
  patch: DraftPatch
  schema: AssetSchema | null
  draftPort: AssetDraftPort
  resources: EditorResources
}

export type EditorComponent = ComponentType<EditorProps>

export interface WorkspacePlugin {
  id: WorkspaceId
  editMode: {
    editor: EditorComponent
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
