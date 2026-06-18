import { createContext, type PointerEvent } from 'react'
import type { LauncherPointerDragSource } from '../model/launcherLibraryDrag'

export type LauncherPointerDragContextValue = {
  startPointerDrag: (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => void
  handleDndPointerDown: (event: PointerEvent<HTMLElement>) => void
  setDraggableActivatorNodeRef: (node: HTMLElement | null) => void
}

export const LauncherPointerDragContext = createContext<LauncherPointerDragContextValue | null>(null)
