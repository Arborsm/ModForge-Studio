import type { MapDocument } from './mapTypes'

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
