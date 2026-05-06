import { describe, expect, it } from 'vitest'
import { findDockTarget, getRailSortTarget, type RailButtonBounds } from '@shared/workspace/layoutDragTargets'
import type { DockGuide } from '@shared/workspace/layoutGeometry'
import type {
  DockArea,
  SlotId,
  WorkspacePanelConfig,
  WorkspacePanelState,
  WorkspaceSlotState,
} from '@shared/contracts'

const panels: WorkspacePanelConfig[] = [
  { id: 'alpha', title: 'Alpha', subtitle: '', content: null, minWidth: 200, minHeight: 200 },
  { id: 'beta', title: 'Beta', subtitle: '', content: null, minWidth: 200, minHeight: 200 },
  { id: 'gamma', title: 'Gamma', subtitle: '', content: null, minWidth: 200, minHeight: 200 },
  { id: 'delta', title: 'Delta', subtitle: '', content: null, minWidth: 200, minHeight: 200 },
]

const buildPanelState = (dock: DockArea, zIndex: number): WorkspacePanelState => ({
  mode: 'docked',
  lastMode: 'docked',
  dock,
  x: 0,
  y: 0,
  width: 240,
  height: 180,
  zIndex,
})

const buildSlot = (panelOrder: string[]): WorkspaceSlotState => ({
  activePanelId: panelOrder[0] ?? null,
  expanded: panelOrder.length > 0,
  panelOrder,
})

const panelStates: Record<string, WorkspacePanelState> = {
  alpha: buildPanelState('left-top', 1),
  beta: buildPanelState('left-top', 2),
  gamma: buildPanelState('left-top', 3),
  delta: buildPanelState('bottom-left', 4),
}

const slotStates: Record<SlotId, WorkspaceSlotState> = {
  'left-top': buildSlot(['alpha', 'beta', 'gamma']),
  'left-bottom': buildSlot([]),
  'right-top': buildSlot([]),
  'right-bottom': buildSlot([]),
  'bottom-left': buildSlot(['delta']),
  'bottom-right': buildSlot([]),
}

describe('layoutDragTargets', () => {
  it('finds the dock guide under the pointer', () => {
    const guides: DockGuide[] = [
      { area: 'left-top', label: 'Left', rect: { x: 0, y: 0, width: 100, height: 100 } },
      { area: 'right-top', label: 'Right', rect: { x: 200, y: 0, width: 100, height: 100 } },
    ]

    expect(findDockTarget(guides, { x: 24, y: 24 })).toBe('left-top')
    expect(findDockTarget(guides, { x: 150, y: 24 })).toBeNull()
  })

  it('computes rail sort targets based on vertical position', () => {
    const buttons: RailButtonBounds[] = [
      {
        slot: 'left-top',
        panelId: 'beta',
        rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
      },
    ]

    const before = getRailSortTarget(buttons, { x: 12, y: 12 }, 'alpha', panels, panelStates, slotStates)
    const after = getRailSortTarget(buttons, { x: 12, y: 80 }, 'alpha', panels, panelStates, slotStates)

    expect(before).toEqual({ slot: 'left-top', index: 1, panelId: 'beta', position: 'before' })
    expect(after).toEqual({ slot: 'left-top', index: 2, panelId: 'beta', position: 'after' })
  })

  it('uses horizontal sorting for bottom slots', () => {
    const buttons: RailButtonBounds[] = [
      {
        slot: 'bottom-left',
        panelId: 'delta',
        rect: { left: 0, top: 0, right: 120, bottom: 40, width: 120, height: 40 },
      },
    ]

    const target = getRailSortTarget(buttons, { x: 90, y: 18 }, 'alpha', panels, panelStates, slotStates)

    expect(target).toEqual({ slot: 'bottom-left', index: 1, panelId: 'delta', position: 'after' })
  })
})
