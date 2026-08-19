import type { ReactNode } from 'react'

/** Dock area position in the workbench layout — left, center, right, or bottom. */
export type WorkspacePanelArea = 'left' | 'center' | 'right' | 'bottom'
/** Resize rail edge in the workbench layout — left, right, or bottom. */
export type WorkspaceResizeRail = 'left' | 'right' | 'bottom'

/** Configuration for one panel placed in a workbench dock area. */
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

/** Runtime chrome state — dock widths/heights and split positions for the workbench layout. */
export type WorkspaceChromeState = {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  leftSplit: number
  rightSplit: number
  bottomSplit: number
}

/** Full workbench layout state — chrome dimensions and split positions. */
export type WorkspaceLayoutState = {
  chrome: WorkspaceChromeState
}

/** Persisted proportions for one fixed workbench layout. */
export type WorkspaceStoredState = WorkspaceLayoutState

/** Handle for resetting the workbench layout to defaults. */
export type WorkspaceLayoutHandle = {
  resetLayout: () => void
}

/** Width/height dimensions for a workspace area or panel. */
export type WorkspaceSize = {
  width: number
  height: number
}

/** Axis-aligned rectangle (x, y, width, height) used for panel geometry. */
export type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Computed geometry for the workbench layout — center rect, area rects, panel rects, and resizer rects. */
export type WorkspaceGeometry = {
  centerRect: PanelRect
  areaRects: Record<WorkspacePanelArea, PanelRect | null>
  panelRects: Record<string, PanelRect>
  splitResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>
  edgeResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>
}
