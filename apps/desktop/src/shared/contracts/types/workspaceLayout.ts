import type { ReactNode } from 'react'

export type WorkspacePanelArea = 'left' | 'center' | 'right' | 'bottom'
export type WorkspaceResizeRail = 'left' | 'right' | 'bottom'

export type WorkspacePanelConfig = {
  id: string
  title: string
  subtitle: string
  content: ReactNode
  area: WorkspacePanelArea
  hideDockHeader?: boolean
  shellClassName?: string
  minWidth: number
  minHeight: number
}

export type WorkspaceChromeState = {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  leftSplit: number
  rightSplit: number
  bottomSplit: number
}

export type WorkspaceLayoutState = {
  chrome: WorkspaceChromeState
}

/** Persisted proportions for one fixed workbench layout. */
export type WorkspaceStoredState = WorkspaceLayoutState

export type WorkspaceLayoutHandle = {
  resetLayout: () => void
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
  areaRects: Record<WorkspacePanelArea, PanelRect | null>
  panelRects: Record<string, PanelRect>
  splitResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>
  edgeResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>
}
