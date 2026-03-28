import type { MapDocument } from '../maps/types'

export type WorkspaceStatus = {
  tone: 'idle' | 'working' | 'ready' | 'error'
  message: string
}

export type ResourcePreloadState = {
  active: boolean
  message: string
  completed: number
  total: number
  currentLabel: string
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
  preview: boolean
  dirty: boolean
}

export type AccentPreset = {
  id: string
  label: string
  color: string
}
