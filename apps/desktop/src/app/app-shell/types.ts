import type { MapDocument } from '@shared/contracts'
import type { ThemePreset } from '@shared/lib/theme/presets'
export type { ResourcePreloadState, WorkspaceStatus, WorldAtlasView, WorldAtlasViewId } from '@shared/contracts'
export type { ThemePreset }

export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
  preview: boolean
  dirty: boolean
}
