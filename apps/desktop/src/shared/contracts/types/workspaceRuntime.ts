import type { MapDocument } from './maps'

/** Workspace status indicator — tone (idle/working/ready/error) and message. */
export type WorkspaceStatus = {
  tone: 'idle' | 'working' | 'ready' | 'error'
  message: string
}

/** Resource preload progress state — active flag, message, completed/total counts, and current label. */
export type ResourcePreloadState = {
  active: boolean
  message: string
  completed: number
  total: number
  currentLabel: string
}

/** View id for a world atlas tab — main or remote. */
export type WorldAtlasViewId = 'main' | 'remote'

/** One world atlas view — id, label, and the loaded map document. */
export type WorldAtlasView = {
  id: WorldAtlasViewId
  label: string
  document: MapDocument
}
