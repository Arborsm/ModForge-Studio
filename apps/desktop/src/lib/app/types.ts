import type { MapDocument } from '../maps/types'

export type WorkspaceStatus = {
  tone: 'idle' | 'working' | 'ready' | 'error'
  message: string
}

export type WorldAtlasViewId = 'main' | 'remote'

export type WorldAtlasView = {
  id: WorldAtlasViewId
  label: string
  document: MapDocument
}

export type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
}

export type AccentPreset = {
  id: string
  label: string
  color: string
}
