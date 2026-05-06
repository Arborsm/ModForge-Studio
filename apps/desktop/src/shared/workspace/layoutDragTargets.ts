import type { DockGuide } from './layoutGeometry'
import { getOrderedPanelIdsForSlot } from './layoutState'
import type {
  DockArea,
  SlotId,
  WorkspacePanelConfig,
  WorkspacePanelState,
  WorkspaceSlotState,
} from '@shared/contracts'

export type DragPointer = {
  x: number
  y: number
}

export type RailSortTarget = {
  slot: SlotId
  index: number
  panelId: string
  position: 'before' | 'after'
} | null

export type RailButtonBounds = {
  slot: SlotId
  panelId: string
  rect: {
    left: number
    right: number
    top: number
    bottom: number
    width: number
    height: number
  }
}

export function findDockTarget(dockGuides: DockGuide[], pointer: DragPointer): DockArea | null {
  const target = dockGuides.find(({ rect }) => {
    return (
      pointer.x >= rect.x &&
      pointer.x <= rect.x + rect.width &&
      pointer.y >= rect.y &&
      pointer.y <= rect.y + rect.height
    )
  })

  return target?.area ?? null
}

export function getRailSortTarget(
  buttons: RailButtonBounds[],
  pointer: DragPointer,
  draggingPanelId: string,
  panels: WorkspacePanelConfig[],
  panelStates: Record<string, WorkspacePanelState>,
  slotStates: Record<SlotId, WorkspaceSlotState>,
): RailSortTarget {
  for (const button of buttons) {
    if (button.panelId === draggingPanelId) {
      continue
    }

    const rect = button.rect
    if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) {
      continue
    }

    const orderedIds = getOrderedPanelIdsForSlot(panels, panelStates, slotStates, button.slot)
    const targetIndex = orderedIds.indexOf(button.panelId)
    if (targetIndex === -1) {
      continue
    }

    const isBottomSlot = button.slot === 'bottom-left' || button.slot === 'bottom-right'
    const position = isBottomSlot
      ? pointer.x >= rect.left + rect.width / 2
        ? 'after'
        : 'before'
      : pointer.y >= rect.top + rect.height / 2
        ? 'after'
        : 'before'

    return {
      slot: button.slot,
      index: targetIndex + (position === 'after' ? 1 : 0),
      panelId: button.panelId,
      position,
    }
  }

  return null
}
