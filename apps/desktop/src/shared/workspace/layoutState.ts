import { LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS, SLOT_IDS } from './layoutConstants'
import type {
  DockArea,
  SlotId,
  WorkspaceChromeState,
  WorkspacePanelConfig,
  WorkspacePanelState,
  WorkspaceSlotState,
  WorkspaceSnapshot,
  WorkspaceStoredState,
} from '@shared/contracts'

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function isItemsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return panels?.some((panel) => panel.id === 'item-navigation') || panels?.some((panel) => panel.id === 'item-details') || false
}

export function isBuildingsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'building-browser') ||
    panels?.some((panel) => panel.id === 'building-details') ||
    panels?.some((panel) => panel.id === 'building-preview') ||
    false
  )
}

export function isEventsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'event-browser') ||
    panels?.some((panel) => panel.id === 'event-stage') ||
    panels?.some((panel) => panel.id === 'event-detail') ||
    false
  )
}

export function getForcedDockForPanel(): DockArea | null {
  return null
}

function isRequiredCenterPanel(panel: WorkspacePanelConfig) {
  const forcedDock = getForcedDockForPanel()
  return (forcedDock ?? panel.defaultDock ?? null) === 'center'
}

export function getDockedPanelIdsForSlot(panels: WorkspacePanelConfig[], states: Record<string, WorkspacePanelState>, slot: SlotId) {
  return panels.filter((panel) => states[panel.id]?.mode === 'docked' && states[panel.id]?.dock === slot).map((panel) => panel.id)
}

export function getOrderedPanelIdsForSlot(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  slots: Record<SlotId, WorkspaceSlotState>,
  slot: SlotId,
) {
  const panelIds = getDockedPanelIdsForSlot(panels, states, slot)
  const currentOrder = slots[slot]?.panelOrder ?? []
  return [...currentOrder.filter((id) => panelIds.includes(id)), ...panelIds.filter((id) => !currentOrder.includes(id))]
}

export function movePanelInOrder(order: string[], panelId: string, index: number) {
  const next = order.filter((id) => id !== panelId)
  const insertionIndex = clamp(index, 0, next.length)
  next.splice(insertionIndex, 0, panelId)
  return next
}

export function getDockedPanelIdsForRail(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  rail: 'left' | 'right' | 'bottom',
) {
  const slots = rail === 'left' ? LEFT_SLOTS : rail === 'right' ? RIGHT_SLOTS : BOTTOM_SLOTS
  return slots.flatMap((slot) => getDockedPanelIdsForSlot(panels, states, slot))
}

export function getDefaultSlots(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
): Record<SlotId, WorkspaceSlotState> {
  return Object.fromEntries(
    SLOT_IDS.map((slot) => {
      const panelIds = getDockedPanelIdsForSlot(panels, states, slot)
      return [
        slot,
        {
          activePanelId: panelIds[0] ?? null,
          expanded: panelIds.length > 0,
          panelOrder: panelIds,
        },
      ]
    }),
  ) as Record<SlotId, WorkspaceSlotState>
}

export function getDefaultChrome(panels?: WorkspacePanelConfig[]): WorkspaceChromeState {
  const isItemsWorkspace = isItemsWorkspacePanels(panels)
  const isBuildingsWorkspace = isBuildingsWorkspacePanels(panels)
  const isEventsWorkspace = isEventsWorkspacePanels(panels)

  if (isItemsWorkspace) {
    return {
      leftWidth: 0.15,
      rightWidth: 0.5,
      bottomHeight: 220,
      leftSplit: 0.44,
      rightSplit: 0.34,
      bottomSplit: 0.5,
    }
  }

  // Buildings / events: default both side rails to the narrowest allowed chrome ratio.
  if (isBuildingsWorkspace || isEventsWorkspace) {
    return {
      leftWidth: 0.14,
      rightWidth: 0.16,
      bottomHeight: 220,
      leftSplit: 0.44,
      rightSplit: 0.34,
      bottomSplit: 0.5,
    }
  }

  return {
    leftWidth: 0.22,
    rightWidth: 0.24,
    bottomHeight: 220,
    leftSplit: 0.44,
    rightSplit: 0.34,
    bottomSplit: 0.5,
  }
}

export function normalizeSlots(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  slots: Record<SlotId, WorkspaceSlotState>,
): Record<SlotId, WorkspaceSlotState> {
  return Object.fromEntries(
    SLOT_IDS.map((slot) => {
      const panelIds = getOrderedPanelIdsForSlot(panels, states, slots, slot)
      const current = slots[slot]
      const activePanelId = panelIds.includes(current.activePanelId ?? '') ? current.activePanelId : (panelIds[0] ?? null)

      return [
        slot,
        {
          activePanelId,
          expanded: panelIds.length > 0 ? Boolean(activePanelId) && current.expanded : false,
          panelOrder: panelIds,
        },
      ]
    }),
  ) as Record<SlotId, WorkspaceSlotState>
}

export function normalizeChrome(chrome: WorkspaceChromeState, panels?: WorkspacePanelConfig[]) {
  const isItemsWorkspace = isItemsWorkspacePanels(panels)

  return {
    leftWidth: clamp(chrome.leftWidth, isItemsWorkspace ? 0.12 : 0.14, isItemsWorkspace ? 0.24 : 0.32),
    rightWidth: clamp(chrome.rightWidth, isItemsWorkspace ? 0.38 : 0.16, isItemsWorkspace ? 0.62 : 0.36),
    bottomHeight: clamp(chrome.bottomHeight, 180, 280),
    leftSplit: clamp(chrome.leftSplit, 0.2, 0.8),
    rightSplit: clamp(chrome.rightSplit, 0.2, 0.8),
    bottomSplit: clamp(chrome.bottomSplit, 0.2, 0.8),
  } satisfies WorkspaceChromeState
}

export function buildDefaultSnapshot(panels: WorkspacePanelConfig[]): WorkspaceSnapshot {
  const defaultPanels: Record<string, WorkspacePanelState> = {}

  panels.forEach((panel, index) => {
    const float = panel.defaultFloat ?? {
      x: 24 + index * 32,
      y: 24 + index * 24,
      width: Math.max(panel.minWidth, 360),
      height: Math.max(panel.minHeight, 280),
    }

    const forcedDock = getForcedDockForPanel()

    defaultPanels[panel.id] = {
      mode: panel.defaultMode ?? 'docked',
      lastMode: panel.defaultMode ?? 'docked',
      dock: forcedDock ?? panel.defaultDock ?? 'right-top',
      x: float.x,
      y: float.y,
      width: float.width,
      height: float.height,
      zIndex: index + 1,
    }
  })

  return {
    panels: defaultPanels,
    slots: getDefaultSlots(panels, defaultPanels),
    chrome: getDefaultChrome(panels),
  }
}

export function sanitizeSnapshot(snapshot: Partial<WorkspaceSnapshot> | undefined, panels: WorkspacePanelConfig[]): WorkspaceSnapshot {
  const defaults = buildDefaultSnapshot(panels)
  const mergedPanels: Record<string, WorkspacePanelState> = {}

  panels.forEach((panel) => {
    const forcedDock = getForcedDockForPanel()
    const nextPanelState: WorkspacePanelState = {
      ...defaults.panels[panel.id],
      ...snapshot?.panels?.[panel.id],
      ...(forcedDock ? { dock: forcedDock } : {}),
    }

    if (isRequiredCenterPanel(panel)) {
      nextPanelState.mode = 'docked'
      nextPanelState.lastMode = 'docked'
      nextPanelState.dock = 'center'
    }

    mergedPanels[panel.id] = nextPanelState
  })

  const mergedSlots = Object.fromEntries(
    SLOT_IDS.map((slot) => [
      slot,
      {
        ...defaults.slots[slot],
        ...snapshot?.slots?.[slot],
      },
    ]),
  ) as Record<SlotId, WorkspaceSlotState>

  return {
    panels: mergedPanels,
    slots: normalizeSlots(panels, mergedPanels, mergedSlots),
    chrome: normalizeChrome(
      {
        ...defaults.chrome,
        ...snapshot?.chrome,
      },
      panels,
    ),
  }
}

export function createDefaultStoredState(panels: WorkspacePanelConfig[]) {
  const defaults = buildDefaultSnapshot(panels)
  return { ...defaults, presets: {} } satisfies WorkspaceStoredState
}

export function sanitizeStoredState(snapshot: Partial<WorkspaceStoredState> | null | undefined, panels: WorkspacePanelConfig[]) {
  const rawPresets = snapshot?.presets ?? {}
  const presets = Object.fromEntries(
    Object.entries(rawPresets)
      .filter(([, value]) => typeof value === 'object' && value !== null)
      .map(([name, value]) => [name, sanitizeSnapshot(value as Partial<WorkspaceSnapshot>, panels)]),
  )

  return {
    ...sanitizeSnapshot(snapshot ?? undefined, panels),
    presets,
  } satisfies WorkspaceStoredState
}

export function getActiveDockedPanel(panelMap: Record<string, WorkspacePanelConfig>, state: WorkspaceStoredState, slot: SlotId) {
  const slotState = state.slots[slot]
  if (!slotState.expanded || !slotState.activePanelId) {
    return null
  }

  const panel = panelMap[slotState.activePanelId]
  if (!panel || state.panels[panel.id]?.mode !== 'docked' || state.panels[panel.id]?.dock !== slot) {
    return null
  }

  return panel
}
