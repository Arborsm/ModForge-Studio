import type { MapDocument } from '@entities/map'
import type { ThemePreset } from '@shared/lib/theme/presets'
export type { ResourcePreloadState, WorkspaceStatus, WorldAtlasView, WorldAtlasViewId } from '@entities/map'
export type { ThemePreset }

export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
  preview: boolean
  dirty: boolean
}
