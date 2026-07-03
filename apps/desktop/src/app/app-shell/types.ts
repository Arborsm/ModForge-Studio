import type { MapDocument } from '@shared/contracts'
export type { ResourcePreloadState, WorkspaceStatus, WorldAtlasView, WorldAtlasViewId } from '@shared/contracts'

export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
  preview: boolean
  dirty: boolean
}

export type ThemePreset = {
  id: string
  label: string
  /** Accent hex consumed by canvas/preview renderers that need a raw color value. */
  accent: string
  /** Representative colors shown in the settings theme card. */
  preview: {
    surface: string
    panel: string
    text: string
  }
}
