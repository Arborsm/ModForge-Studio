import type { ComponentType } from 'react'
import type { AssetSchema } from '@entities/asset-schema'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { AssetDraftPort } from './draftPort'
import type { DraftPatch, ProjectAssetRef, WorkspaceId } from './types'

/** Host environment an editor renders against; never carries locale copy. */
export type EditorResources = {
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  /** Returns an asset-group editor to its first-level resource library. */
  onReturnToLibrary?: () => void
  /** Opens a project map file in the standalone map-asset editor. */
  onOpenMapAsset?: (relativePath: string) => void
  /**
   * Opens a patch-tiles editing session for one tiles change card, seeding the
   * session from that card's staged MapTiles and writing the delta back on
   * completion. Hosts without a game directory or with token targets never
   * trigger this.
   */
  onEditPatchTiles?: (args: { patchId: string; cardId: string; target: string }) => void
  /** Reads a project asset's persisted bytes so an editor can preview it. */
  onReadProjectAsset?: (relativePath: string) => Promise<{ asset: ProjectAssetRef; bytesBase64: string }>
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
