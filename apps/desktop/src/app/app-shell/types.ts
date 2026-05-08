import type { MapDocument } from '@shared/contracts'
export type { ResourcePreloadState, WorkspaceStatus, WorldAtlasView, WorldAtlasViewId } from '@shared/contracts'

export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
  preview: boolean
  dirty: boolean
}

export type AccentPreset = {
  id: string
  label: string
  color: string
}
