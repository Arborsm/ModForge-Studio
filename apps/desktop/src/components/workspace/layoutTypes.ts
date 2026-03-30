import type { ReactNode } from 'react'

export type DockArea =
  | 'left-top'
  | 'left-bottom'
  | 'right-top'
  | 'right-bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

export type PanelMode = 'docked' | 'floating' | 'hidden'
export type RailId = 'left' | 'right' | 'bottom'
export type SlotId = Exclude<DockArea, 'center'>

export type WorkspacePanelConfig = {
  id: string
  title: string
  subtitle: string
  content: ReactNode
  hideDockHeader?: boolean
  shellClassName?: string
  minWidth: number
  minHeight: number
  dockMinHeight?: number
  dockMaxHeight?: number
  dockAutoHeight?: boolean
  defaultMode?: Exclude<PanelMode, 'hidden'>
  defaultDock?: DockArea
  defaultFloat?: {
    x: number
    y: number
    width: number
    height: number
  }
  defaultDockHeight?: number
}

export type WorkspacePanelState = {
  mode: PanelMode
  lastMode: Exclude<PanelMode, 'hidden'>
  dock: DockArea
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type WorkspaceSlotState = {
  activePanelId: string | null
  expanded: boolean
  panelOrder: string[]
}

export type WorkspaceChromeState = {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  leftSplit: number
  rightSplit: number
  bottomSplit: number
}

export type WorkspaceSnapshot = {
  panels: Record<string, WorkspacePanelState>
  slots: Record<SlotId, WorkspaceSlotState>
  chrome: WorkspaceChromeState
}

export type WorkspaceStoredState = WorkspaceSnapshot & {
  presets: Record<string, WorkspaceSnapshot>
}

export type WorkspacePanelMeta = {
  id: string
  title: string
  visible: boolean
  mode: PanelMode
  dock: DockArea
}

export type WorkspaceLayoutHandle = {
  resetLayout: () => void
  savePreset: (name: string) => void
  loadPreset: (name: string) => void
  deletePreset: (name: string) => void
  getPresetNames: () => string[]
  getPanelMeta: () => WorkspacePanelMeta[]
  setPanelVisibility: (id: string, visible: boolean) => void
}

export type WorkspaceSize = {
  width: number
  height: number
}

export type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

export type WorkspaceGeometry = {
  centerRect: PanelRect
  rails: Record<RailId, PanelRect | null>
  railContainers: Record<RailId, PanelRect | null>
  dockedRects: Record<string, PanelRect>
  splitResizers: Partial<Record<RailId, PanelRect>>
  edgeResizers: Partial<Record<RailId, PanelRect>>
}
