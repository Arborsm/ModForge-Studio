import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  Activity,
  Boxes,
  Files,
  FolderOpen,
  Grip,
  Layers3,
  Library,
  Map,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pin,
  SlidersHorizontal,
  SquareDashedMousePointer,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cx } from '../lib/cx'

export type DockArea =
  | 'left-top'
  | 'left-bottom'
  | 'right-top'
  | 'right-bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

type PanelMode = 'docked' | 'floating' | 'hidden'
type RailId = 'left' | 'right' | 'bottom'
type SlotId = Exclude<DockArea, 'center'>

const SLOT_IDS = ['left-top', 'left-bottom', 'right-top', 'right-bottom', 'bottom-left', 'bottom-right'] as const satisfies readonly SlotId[]
const LEFT_SLOTS = ['left-top', 'left-bottom'] as const satisfies readonly SlotId[]
const RIGHT_SLOTS = ['right-top', 'right-bottom'] as const satisfies readonly SlotId[]
const BOTTOM_SLOTS = ['bottom-left', 'bottom-right'] as const satisfies readonly SlotId[]

const PANEL_ICON_MAP: Record<string, LucideIcon> = {
  project: FolderOpen,
  assets: Files,
  viewport: Map,
  inspector: SlidersHorizontal,
  layers: Layers3,
  'object-groups': Boxes,
  diagnostics: Activity,
}

const DOCK_TARGETS: Array<{ area: DockArea; label: string; icon: LucideIcon }> = [
  { area: 'left-top', label: 'Move to Left Top', icon: PanelLeft },
  { area: 'left-bottom', label: 'Move to Left Bottom', icon: PanelLeft },
  { area: 'right-top', label: 'Move to Right Top', icon: PanelRight },
  { area: 'right-bottom', label: 'Move to Right Bottom', icon: PanelRight },
  { area: 'bottom-left', label: 'Move to Bottom Left', icon: PanelBottom },
  { area: 'bottom-right', label: 'Move to Bottom Right', icon: PanelBottom },
]

export type WorkspacePanelConfig = {
  id: string
  title: string
  subtitle: string
  content: ReactNode
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

type WorkspacePanelState = {
  mode: PanelMode
  lastMode: Exclude<PanelMode, 'hidden'>
  dock: DockArea
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

type WorkspaceSlotState = {
  activePanelId: string | null
  expanded: boolean
  panelOrder: string[]
}

type WorkspaceChromeState = {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  leftSplit: number
  rightSplit: number
  bottomSplit: number
}

type WorkspaceSnapshot = {
  panels: Record<string, WorkspacePanelState>
  slots: Record<SlotId, WorkspaceSlotState>
  chrome: WorkspaceChromeState
}

type WorkspaceStoredState = WorkspaceSnapshot & {
  presets: Record<string, WorkspaceSnapshot>
}

type WorkspaceLayoutProps = {
  panels: WorkspacePanelConfig[]
  storageKey?: string
  onLayoutMetaChange?: (payload: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => void
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

type WorkspaceSize = {
  width: number
  height: number
}

type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

type WorkspaceGeometry = {
  centerRect: PanelRect
  rails: Record<RailId, PanelRect | null>
  railContainers: Record<RailId, PanelRect | null>
  dockedRects: Record<string, PanelRect>
  splitResizers: Partial<Record<RailId, PanelRect>>
  edgeResizers: Partial<Record<RailId, PanelRect>>
}

type DragDockTarget = DockArea | null
type RailSortTarget = {
  slot: SlotId
  index: number
  panelId: string
  position: 'before' | 'after'
} | null

type DragInteraction =
  | {
      kind: 'move'
      panelId: string
      pointerId: number
      offsetX: number
      offsetY: number
    }
  | {
      kind: 'edge-resize'
      rail: 'left' | 'right' | 'bottom'
      pointerId: number
      startX: number
      startY: number
      startSize: number
    }
  | {
      kind: 'split-resize'
      rail: RailId
      pointerId: number
    }
  | {
      kind: 'float-resize'
      panelId: string
      pointerId: number
      startX: number
      startY: number
      startWidth: number
      startHeight: number
    }
  | {
      kind: 'rail-drag'
      source: 'rail' | 'floating'
      panelId: string
      pointerId: number
      startX: number
      startY: number
      dragging: boolean
    }

const STORAGE_VERSION = 9
const ROOT_PADDING = 12
const COLUMN_GAP = 12
const TOOL_WINDOW_RAIL_WIDTH = 42
const TOOL_WINDOW_RAIL_HEIGHT = 38
const TOOL_WINDOW_RAIL_GAP = 10
const SPLIT_GAP = 12
const RESIZER_THICKNESS = 8
const MIN_CENTER_WIDTH = 520
const MIN_CENTER_HEIGHT = 300
const RAIL_DRAG_THRESHOLD = 6

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getForcedDockForPanel(): DockArea | null {
  return null
}

function getDockedPanelIdsForSlot(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  slot: SlotId,
) {
  return panels.filter((panel) => states[panel.id]?.mode === 'docked' && states[panel.id]?.dock === slot).map((panel) => panel.id)
}

function getOrderedPanelIdsForSlot(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  slots: Record<SlotId, WorkspaceSlotState>,
  slot: SlotId,
) {
  const panelIds = getDockedPanelIdsForSlot(panels, states, slot)
  const currentOrder = slots[slot]?.panelOrder ?? []
  return [...currentOrder.filter((id) => panelIds.includes(id)), ...panelIds.filter((id) => !currentOrder.includes(id))]
}

function movePanelInOrder(order: string[], panelId: string, index: number) {
  const next = order.filter((id) => id !== panelId)
  const insertionIndex = clamp(index, 0, next.length)
  next.splice(insertionIndex, 0, panelId)
  return next
}

function getDockedPanelIdsForRail(
  panels: WorkspacePanelConfig[],
  states: Record<string, WorkspacePanelState>,
  rail: RailId,
) {
  const slots = rail === 'left' ? LEFT_SLOTS : rail === 'right' ? RIGHT_SLOTS : BOTTOM_SLOTS
  return slots.flatMap((slot) => getDockedPanelIdsForSlot(panels, states, slot))
}

function getDefaultSlots(
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

function getDefaultChrome(): WorkspaceChromeState {
  return {
    leftWidth: 340,
    rightWidth: 360,
    bottomHeight: 220,
    leftSplit: 0.44,
    rightSplit: 0.34,
    bottomSplit: 0.5,
  }
}

function normalizeSlots(
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

function normalizeChrome(chrome: WorkspaceChromeState) {
  return {
    leftWidth: clamp(chrome.leftWidth, 280, 640),
    rightWidth: clamp(chrome.rightWidth, 280, 640),
    bottomHeight: clamp(chrome.bottomHeight, 180, 280),
    leftSplit: clamp(chrome.leftSplit, 0.2, 0.8),
    rightSplit: clamp(chrome.rightSplit, 0.2, 0.8),
    bottomSplit: clamp(chrome.bottomSplit, 0.2, 0.8),
  } satisfies WorkspaceChromeState
}

function buildDefaultSnapshot(panels: WorkspacePanelConfig[]): WorkspaceSnapshot {
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
    chrome: getDefaultChrome(),
  }
}

function sanitizeSnapshot(snapshot: Partial<WorkspaceSnapshot> | undefined, panels: WorkspacePanelConfig[]): WorkspaceSnapshot {
  const defaults = buildDefaultSnapshot(panels)
  const mergedPanels: Record<string, WorkspacePanelState> = {}

  panels.forEach((panel) => {
    const forcedDock = getForcedDockForPanel()
    mergedPanels[panel.id] = {
      ...defaults.panels[panel.id],
      ...(snapshot?.panels?.[panel.id] ?? {}),
      ...(forcedDock ? { dock: forcedDock } : {}),
    }
  })

  const mergedSlots = Object.fromEntries(
    SLOT_IDS.map((slot) => [
      slot,
      {
        ...defaults.slots[slot],
        ...(snapshot?.slots?.[slot] ?? {}),
      },
    ]),
  ) as Record<SlotId, WorkspaceSlotState>

  return {
    panels: mergedPanels,
    slots: normalizeSlots(panels, mergedPanels, mergedSlots),
    chrome: normalizeChrome({
      ...defaults.chrome,
      ...(snapshot?.chrome ?? {}),
    }),
  }
}

function readStoredState(storageKey: string, panels: WorkspacePanelConfig[]) {
  const defaults = buildDefaultSnapshot(panels)

  if (typeof window === 'undefined') {
    return { ...defaults, presets: {} } satisfies WorkspaceStoredState
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return { ...defaults, presets: {} } satisfies WorkspaceStoredState
    }

    const parsed = JSON.parse(raw) as { version: number } & Partial<WorkspaceStoredState>
    if (parsed.version !== STORAGE_VERSION) {
      return { ...defaults, presets: {} } satisfies WorkspaceStoredState
    }

    const presets = Object.fromEntries(
      Object.entries(parsed.presets ?? {}).map(([name, snapshot]) => [name, sanitizeSnapshot(snapshot, panels)]),
    )

    return {
      ...sanitizeSnapshot(parsed, panels),
      presets,
    } satisfies WorkspaceStoredState
  } catch {
    return { ...defaults, presets: {} } satisfies WorkspaceStoredState
  }
}

function clampFloatRect(rect: PanelRect, size: WorkspaceSize, panel: WorkspacePanelConfig) {
  const width = clamp(rect.width, panel.minWidth, Math.max(panel.minWidth, size.width - ROOT_PADDING * 2))
  const height = clamp(rect.height, panel.minHeight, Math.max(panel.minHeight, size.height - ROOT_PADDING * 2))
  const x = clamp(rect.x, ROOT_PADDING, Math.max(ROOT_PADDING, size.width - width - ROOT_PADDING))
  const y = clamp(rect.y, ROOT_PADDING, Math.max(ROOT_PADDING, size.height - height - ROOT_PADDING))

  return { x, y, width, height }
}

function getRailEdgeSizeLimit(
  rail: 'left' | 'right' | 'bottom',
  panels: WorkspacePanelConfig[],
  state: WorkspaceStoredState,
  size: WorkspaceSize,
) {
  const leftRailUsed = getDockedPanelIdsForRail(panels, state.panels, 'left').length ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const rightRailUsed = getDockedPanelIdsForRail(panels, state.panels, 'right').length ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const bottomRailUsed = getDockedPanelIdsForRail(panels, state.panels, 'bottom').length ? TOOL_WINDOW_RAIL_HEIGHT + TOOL_WINDOW_RAIL_GAP : 0

  if (rail === 'bottom') {
    return Math.max(220, size.height - ROOT_PADDING * 2 - MIN_CENTER_HEIGHT - bottomRailUsed)
  }

  const otherWidth =
    rail === 'left'
      ? state.chrome.rightWidth + rightRailUsed
      : state.chrome.leftWidth + leftRailUsed

  return Math.max(280, size.width - ROOT_PADDING * 2 - MIN_CENTER_WIDTH - otherWidth - leftRailUsed - rightRailUsed)
}

function splitSpan(
  total: number,
  ratio: number,
  firstMin: number,
  secondMin: number,
  firstMax = Number.POSITIVE_INFINITY,
  secondMax = Number.POSITIVE_INFINITY,
  firstPreferred?: number,
) {
  const usable = total - SPLIT_GAP
  let first =
    typeof firstPreferred === 'number'
      ? clamp(Math.round(firstPreferred), firstMin, usable - secondMin)
      : clamp(Math.round(usable * ratio), firstMin, usable - secondMin)
  let second = usable - first

  if (first > firstMax) {
    first = clamp(firstMax, firstMin, usable - secondMin)
    second = usable - first
  }

  if (second > secondMax) {
    second = clamp(secondMax, secondMin, usable - firstMin)
    first = usable - second
  }

  return { first, second }
}

function getActiveDockedPanel(panelMap: Record<string, WorkspacePanelConfig>, state: WorkspaceStoredState, slot: SlotId) {
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

function getWorkspaceGeometry(
  panels: WorkspacePanelConfig[],
  panelMap: Record<string, WorkspacePanelConfig>,
  state: WorkspaceStoredState,
  size: WorkspaceSize,
  measuredDockHeights: Record<string, number>,
): WorkspaceGeometry {
  const leftRailVisible = getDockedPanelIdsForRail(panels, state.panels, 'left').length > 0
  const rightRailVisible = getDockedPanelIdsForRail(panels, state.panels, 'right').length > 0
  const leftRailUsed = leftRailVisible ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const rightRailUsed = rightRailVisible ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const bottomRailUsed = 0

  const leftTopPanel = getActiveDockedPanel(panelMap, state, 'left-top')
  const leftBottomPanel = getActiveDockedPanel(panelMap, state, 'left-bottom')
  const rightTopPanel = getActiveDockedPanel(panelMap, state, 'right-top')
  const rightBottomPanel = getActiveDockedPanel(panelMap, state, 'right-bottom')
  const bottomLeftPanel = getActiveDockedPanel(panelMap, state, 'bottom-left')
  const bottomRightPanel = getActiveDockedPanel(panelMap, state, 'bottom-right')

  const leftPanelVisible = Boolean(leftTopPanel || leftBottomPanel)
  const rightPanelVisible = Boolean(rightTopPanel || rightBottomPanel)
  const bottomPanelVisible = Boolean(bottomLeftPanel || bottomRightPanel)

  const leftPanelUsed = leftPanelVisible ? state.chrome.leftWidth + COLUMN_GAP : 0
  const rightPanelUsed = rightPanelVisible ? state.chrome.rightWidth + COLUMN_GAP : 0
  const bottomPreferredHeight = [bottomLeftPanel, bottomRightPanel]
    .filter((panel): panel is WorkspacePanelConfig => Boolean(panel?.dockAutoHeight))
    .reduce<number | null>((current, panel) => {
      const measured = measuredDockHeights[panel.id]
      if (typeof measured !== 'number') {
        return current
      }

      const clampedMeasured = clamp(
        Math.round(measured),
        panel.dockMinHeight ?? panel.minHeight,
        panel.dockMaxHeight ?? Math.max(panel.minHeight, size.height - ROOT_PADDING * 2 - MIN_CENTER_HEIGHT),
      )

      return current === null ? clampedMeasured : Math.max(current, clampedMeasured)
    }, null)
  const bottomHeight = bottomPreferredHeight ?? state.chrome.bottomHeight
  const bottomPanelUsed = bottomPanelVisible ? bottomHeight + COLUMN_GAP : 0

  const centerRect: PanelRect = {
    x: ROOT_PADDING + leftRailUsed + leftPanelUsed,
    y: ROOT_PADDING,
    width: Math.max(160, size.width - ROOT_PADDING * 2 - leftRailUsed - leftPanelUsed - rightRailUsed - rightPanelUsed),
    height: Math.max(180, size.height - ROOT_PADDING * 2 - bottomRailUsed - bottomPanelUsed),
  }

  const rails: Record<RailId, PanelRect | null> = {
    left: leftRailVisible
      ? { x: ROOT_PADDING, y: ROOT_PADDING, width: TOOL_WINDOW_RAIL_WIDTH, height: centerRect.height }
      : null,
    right: rightRailVisible
      ? { x: size.width - ROOT_PADDING - TOOL_WINDOW_RAIL_WIDTH, y: ROOT_PADDING, width: TOOL_WINDOW_RAIL_WIDTH, height: centerRect.height }
      : null,
    bottom: null,
  }

  const railContainers: Record<RailId, PanelRect | null> = {
    left: leftPanelVisible
      ? { x: ROOT_PADDING + leftRailUsed, y: ROOT_PADDING, width: state.chrome.leftWidth, height: centerRect.height }
      : null,
    right: rightPanelVisible
      ? { x: size.width - ROOT_PADDING - rightRailUsed - state.chrome.rightWidth, y: ROOT_PADDING, width: state.chrome.rightWidth, height: centerRect.height }
      : null,
    bottom: bottomPanelVisible
      ? {
          x: ROOT_PADDING,
          y: ROOT_PADDING + centerRect.height + COLUMN_GAP,
          width: Math.max(160, size.width - ROOT_PADDING * 2),
          height: bottomHeight,
        }
      : null,
  }

  const dockedRects: Record<string, PanelRect> = {}
  const splitResizers: Partial<Record<RailId, PanelRect>> = {}
  const edgeResizers: Partial<Record<RailId, PanelRect>> = {}

  if (leftTopPanel || leftBottomPanel) {
    const container = railContainers.left!
    edgeResizers.left = {
      x: container.x + container.width - RESIZER_THICKNESS / 2,
      y: container.y + 16,
      width: RESIZER_THICKNESS,
      height: container.height - 32,
    }

    if (leftTopPanel && leftBottomPanel) {
      const topPreferredHeight = leftTopPanel.dockAutoHeight ? measuredDockHeights[leftTopPanel.id] : undefined
      const { first, second } = splitSpan(
        container.height,
        state.chrome.leftSplit,
        leftTopPanel.dockMinHeight ?? leftTopPanel.minHeight,
        leftBottomPanel.dockMinHeight ?? leftBottomPanel.minHeight,
        leftTopPanel.dockMaxHeight ?? container.height,
        leftBottomPanel.dockMaxHeight ?? container.height,
        topPreferredHeight,
      )

      dockedRects[leftTopPanel.id] = { x: container.x, y: container.y, width: container.width, height: first }
      dockedRects[leftBottomPanel.id] = {
        x: container.x,
        y: container.y + first + SPLIT_GAP,
        width: container.width,
        height: second,
      }
      splitResizers.left = {
        x: container.x + 18,
        y: container.y + first + SPLIT_GAP / 2 - RESIZER_THICKNESS / 2,
        width: container.width - 36,
        height: RESIZER_THICKNESS,
      }
    } else {
      const panel = leftTopPanel ?? leftBottomPanel
      if (panel) {
        dockedRects[panel.id] = container
      }
    }
  }

  if (rightTopPanel || rightBottomPanel) {
    const container = railContainers.right!
    edgeResizers.right = {
      x: container.x - RESIZER_THICKNESS / 2,
      y: container.y + 16,
      width: RESIZER_THICKNESS,
      height: container.height - 32,
    }

    if (rightTopPanel && rightBottomPanel) {
      const topPreferredHeight = rightTopPanel.dockAutoHeight ? measuredDockHeights[rightTopPanel.id] : undefined
      const { first, second } = splitSpan(
        container.height,
        state.chrome.rightSplit,
        rightTopPanel.dockMinHeight ?? rightTopPanel.minHeight,
        rightBottomPanel.dockMinHeight ?? rightBottomPanel.minHeight,
        rightTopPanel.dockMaxHeight ?? container.height,
        rightBottomPanel.dockMaxHeight ?? container.height,
        topPreferredHeight,
      )

      dockedRects[rightTopPanel.id] = { x: container.x, y: container.y, width: container.width, height: first }
      dockedRects[rightBottomPanel.id] = {
        x: container.x,
        y: container.y + first + SPLIT_GAP,
        width: container.width,
        height: second,
      }
      splitResizers.right = {
        x: container.x + 18,
        y: container.y + first + SPLIT_GAP / 2 - RESIZER_THICKNESS / 2,
        width: container.width - 36,
        height: RESIZER_THICKNESS,
      }
    } else {
      const panel = rightTopPanel ?? rightBottomPanel
      if (panel) {
        dockedRects[panel.id] = container
      }
    }
  }

  if (bottomLeftPanel || bottomRightPanel) {
    const container = railContainers.bottom!
    edgeResizers.bottom = {
      x: container.x + 18,
      y: container.y - RESIZER_THICKNESS / 2,
      width: container.width - 36,
      height: RESIZER_THICKNESS,
    }

    if (bottomLeftPanel && bottomRightPanel) {
      const { first, second } = splitSpan(container.width, state.chrome.bottomSplit, bottomLeftPanel.minWidth, bottomRightPanel.minWidth)

      dockedRects[bottomLeftPanel.id] = { x: container.x, y: container.y, width: first, height: container.height }
      dockedRects[bottomRightPanel.id] = {
        x: container.x + first + SPLIT_GAP,
        y: container.y,
        width: second,
        height: container.height,
      }
      splitResizers.bottom = {
        x: container.x + first + SPLIT_GAP / 2 - RESIZER_THICKNESS / 2,
        y: container.y + 18,
        width: RESIZER_THICKNESS,
        height: container.height - 36,
      }
    } else {
      const panel = bottomLeftPanel ?? bottomRightPanel
      if (panel) {
        dockedRects[panel.id] = container
      }
    }
  }

  panels.forEach((panel) => {
    const panelState = state.panels[panel.id]
    if (panelState?.mode === 'docked' && panelState.dock === 'center') {
      dockedRects[panel.id] = centerRect
    }
  })

  return {
    centerRect,
    rails,
    railContainers,
    dockedRects,
    splitResizers,
    edgeResizers,
  }
}

function getPanelIcon(panelId: string) {
  return PANEL_ICON_MAP[panelId] ?? Library
}

function getDockLabel(area: DockArea) {
  switch (area) {
    case 'left-top':
      return 'Left Top'
    case 'left-bottom':
      return 'Left Bottom'
    case 'right-top':
      return 'Right Top'
    case 'right-bottom':
      return 'Right Bottom'
    case 'bottom-left':
      return 'Bottom Left'
    case 'bottom-right':
      return 'Bottom Right'
    case 'center':
      return 'Center'
  }
}

function getDockGuideRects(size: WorkspaceSize, geometry: WorkspaceGeometry) {
  const defaults = getDefaultChrome()
  const leftContainer =
    geometry.railContainers.left ?? {
      x: ROOT_PADDING + TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP,
      y: ROOT_PADDING,
      width: defaults.leftWidth,
      height: geometry.centerRect.height,
    }
  const rightContainer =
    geometry.railContainers.right ?? {
      x: size.width - ROOT_PADDING - TOOL_WINDOW_RAIL_WIDTH - TOOL_WINDOW_RAIL_GAP - defaults.rightWidth,
      y: ROOT_PADDING,
      width: defaults.rightWidth,
      height: geometry.centerRect.height,
    }
  const bottomContainer =
    geometry.railContainers.bottom ?? {
      x: ROOT_PADDING,
      y: size.height - ROOT_PADDING - defaults.bottomHeight,
      width: Math.max(160, size.width - ROOT_PADDING * 2),
      height: defaults.bottomHeight,
    }
  const verticalHalf = Math.max(96, (leftContainer.height - SPLIT_GAP) / 2)
  const rightVerticalHalf = Math.max(96, (rightContainer.height - SPLIT_GAP) / 2)
  const horizontalHalf = Math.max(140, (bottomContainer.width - SPLIT_GAP) / 2)

  return [
    {
      area: 'left-top' as const,
      rect: { x: leftContainer.x, y: leftContainer.y, width: leftContainer.width, height: verticalHalf },
      label: 'Left Top',
    },
    {
      area: 'left-bottom' as const,
      rect: {
        x: leftContainer.x,
        y: leftContainer.y + leftContainer.height - verticalHalf,
        width: leftContainer.width,
        height: verticalHalf,
      },
      label: 'Left Bottom',
    },
    {
      area: 'right-top' as const,
      rect: { x: rightContainer.x, y: rightContainer.y, width: rightContainer.width, height: rightVerticalHalf },
      label: 'Right Top',
    },
    {
      area: 'right-bottom' as const,
      rect: {
        x: rightContainer.x,
        y: rightContainer.y + rightContainer.height - rightVerticalHalf,
        width: rightContainer.width,
        height: rightVerticalHalf,
      },
      label: 'Right Bottom',
    },
    {
      area: 'bottom-left' as const,
      rect: { x: bottomContainer.x, y: bottomContainer.y, width: horizontalHalf, height: bottomContainer.height },
      label: 'Bottom Left',
    },
    {
      area: 'bottom-right' as const,
      rect: {
        x: bottomContainer.x + bottomContainer.width - horizontalHalf,
        y: bottomContainer.y,
        width: horizontalHalf,
        height: bottomContainer.height,
      },
      label: 'Bottom Right',
    },
  ]
}

function ToolWindowMenu({
  children,
  onFloat,
  onHide,
  onDock,
}: {
  children: ReactNode
  onFloat: () => void
  onHide: () => void
  onDock: (area: DockArea) => void
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content">
          <ContextMenu.Item className="context-menu-item" onSelect={onFloat}>
            Float Window
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onHide}>
            Hide
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color-mix(in_srgb,var(--border-color)_75%,transparent)]" />
          {DOCK_TARGETS.map((target) => (
            <ContextMenu.Item
              key={target.area}
              className="context-menu-item flex items-center justify-between gap-3"
              onSelect={() => onDock(target.area)}
            >
              <span>{target.label}</span>
              <target.icon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export const WorkspaceLayout = forwardRef<WorkspaceLayoutHandle, WorkspaceLayoutProps>(function WorkspaceLayout(
  { panels, storageKey = 'modforge:workspace-layout:v7', onLayoutMetaChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const railButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const interactionRef = useRef<DragInteraction | null>(null)
  const suppressRailClickRef = useRef<string | null>(null)
  const [rootSize, setRootSize] = useState<WorkspaceSize>({ width: 0, height: 0 })
  const [state, setState] = useState<WorkspaceStoredState>(() => readStoredState(storageKey, panels))
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null)
  const [dragDockTarget, setDragDockTarget] = useState<DragDockTarget>(null)
  const [railSortTarget, setRailSortTarget] = useState<RailSortTarget>(null)
  const [dragPreview, setDragPreview] = useState<{ panelId: string; x: number; y: number } | null>(null)
  const [measuredDockHeights, setMeasuredDockHeights] = useState<Record<string, number>>({})

  const panelMap = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel])) as Record<string, WorkspacePanelConfig>,
    [panels],
  )

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setMeasuredDockHeights((current) => {
        let changed = false
        const next = { ...current }

        for (const entry of entries) {
          const panelId = (entry.target as HTMLElement).dataset.panelId
          if (!panelId) {
            continue
          }

          const measuredHeight = Math.ceil((entry.target as HTMLElement).scrollHeight)
          if (!measuredHeight || next[panelId] === measuredHeight) {
            continue
          }

          next[panelId] = measuredHeight
          changed = true
        }

        return changed ? next : current
      })
    })

    Object.values(panelContentRefs.current).forEach((element) => {
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [panels, state.panels])

  const geometry = useMemo(
    () => getWorkspaceGeometry(panels, panelMap, state, rootSize, measuredDockHeights),
    [measuredDockHeights, panelMap, panels, rootSize, state],
  )
  const dockGuides = useMemo(() => getDockGuideRects(rootSize, geometry), [geometry, rootSize])

  useImperativeHandle(
    ref,
    () => ({
      resetLayout: () => setState((current) => ({ ...buildDefaultSnapshot(panels), presets: current.presets })),
      savePreset: (name) =>
        setState((current) => ({
          ...current,
          presets: {
            ...current.presets,
            [name]: {
              panels: current.panels,
              slots: current.slots,
              chrome: current.chrome,
            },
          },
        })),
      loadPreset: (name) =>
        setState((current) => {
          const preset = current.presets[name]
          return preset ? { ...sanitizeSnapshot(preset, panels), presets: current.presets } : current
        }),
      deletePreset: (name) =>
        setState((current) => {
          const nextPresets = { ...current.presets }
          delete nextPresets[name]
          return { ...current, presets: nextPresets }
        }),
      getPresetNames: () => Object.keys(state.presets).sort((left, right) => left.localeCompare(right)),
      getPanelMeta: () =>
        panels.map((panel) => ({
          id: panel.id,
          title: panel.title,
          visible: state.panels[panel.id]?.mode !== 'hidden',
          mode: state.panels[panel.id]?.mode ?? 'docked',
          dock: state.panels[panel.id]?.dock ?? 'right-top',
        })),
      setPanelVisibility: (id, visible) =>
        setState((current) => {
          const currentPanel = current.panels[id]
          if (!currentPanel) {
            return current
          }

          const nextMode: PanelMode = visible ? currentPanel.lastMode : 'hidden'
          const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
          const nextPanels: Record<string, WorkspacePanelState> = {
            ...current.panels,
            [id]: {
              ...currentPanel,
              mode: nextMode,
              lastMode: !visible || currentPanel.mode === 'hidden' ? currentPanel.lastMode : currentPanel.mode,
              zIndex: visible && nextMode === 'floating' ? nextZ : currentPanel.zIndex,
            },
          }
          let nextSlots = current.slots

          if (visible && currentPanel.lastMode === 'docked' && currentPanel.dock !== 'center') {
            nextSlots = {
              ...current.slots,
              [currentPanel.dock]: {
                ...current.slots[currentPanel.dock],
                activePanelId: id,
                expanded: true,
              },
            }
          }

          return {
            ...current,
            panels: nextPanels,
            slots: normalizeSlots(panels, nextPanels, nextSlots),
          }
        }),
    }),
    [panels, state],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setRootSize({
        width: root.clientWidth,
        height: root.clientHeight,
      })
    })

    resizeObserver.observe(root)
    setRootSize({
      width: root.clientWidth,
      height: root.clientHeight,
    })

    return () => resizeObserver.disconnect()
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: STORAGE_VERSION,
        panels: state.panels,
        slots: state.slots,
        chrome: state.chrome,
        presets: state.presets,
      }),
    )
  }, [state, storageKey])

  useEffect(() => {
    onLayoutMetaChange?.({
      panelItems: panels.map((panel) => ({
        id: panel.id,
        title: panel.title,
        visible: state.panels[panel.id]?.mode !== 'hidden',
        mode: state.panels[panel.id]?.mode ?? 'docked',
        dock: state.panels[panel.id]?.dock ?? 'right-top',
      })),
      presetNames: Object.keys(state.presets).sort((left, right) => left.localeCompare(right)),
    })
  }, [onLayoutMetaChange, panels, state.panels, state.presets])

  const applyRailOrderDrop = useCallback((panelId: string, slot: SlotId, index: number) => {
    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          mode: 'docked',
          lastMode: 'docked',
          dock: slot,
        },
      }

      const nextSlots = Object.fromEntries(
        SLOT_IDS.map((slotId) => {
          const orderedIds = getOrderedPanelIdsForSlot(panels, nextPanels, current.slots, slotId)
          const nextOrder =
            slotId === slot
              ? movePanelInOrder(orderedIds, panelId, index)
              : orderedIds.filter((id) => id !== panelId)

          return [
            slotId,
            {
              ...current.slots[slotId],
              activePanelId: slotId === slot ? panelId : current.slots[slotId].activePanelId,
              expanded: slotId === slot ? true : current.slots[slotId].expanded,
              panelOrder: nextOrder,
            },
          ]
        }),
      ) as Record<SlotId, WorkspaceSlotState>

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, nextSlots),
      }
    })
  }, [panels])

  const dock = useCallback((panelId: string, dockArea: DockArea) => {
    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          mode: 'docked',
          lastMode: 'docked',
          dock: dockArea,
        },
      }

      let nextSlots = current.slots
      if (dockArea !== 'center') {
        const orderedIds = getOrderedPanelIdsForSlot(panels, nextPanels, current.slots, dockArea)
        const nextOrder = movePanelInOrder(orderedIds, panelId, orderedIds.length)
        nextSlots = {
          ...Object.fromEntries(
            SLOT_IDS.map((slotId) => [
              slotId,
              {
                ...current.slots[slotId],
                panelOrder:
                  slotId === dockArea ? nextOrder : current.slots[slotId].panelOrder.filter((id) => id !== panelId),
              },
            ]),
          ),
          [dockArea]: {
            ...current.slots[dockArea],
            activePanelId: panelId,
            expanded: true,
            panelOrder: nextOrder,
          },
        } as Record<SlotId, WorkspaceSlotState>
      }

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, nextSlots),
      }
    })
  }, [panels])

  const undock = useCallback((panelId: string) => {
    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
      const dockRect = geometry.dockedRects[panelId] ?? {
        x: 80,
        y: 80,
        width: currentPanel.width,
        height: currentPanel.height,
      }
      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          mode: 'floating',
          lastMode: 'floating',
          x: dockRect.x + 24,
          y: dockRect.y + 24,
          width: Math.max(currentPanel.width, dockRect.width),
          height: Math.max(currentPanel.height, dockRect.height),
          zIndex: nextZ,
        },
      }

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, current.slots),
      }
    })
  }, [geometry.dockedRects, panels])

  const floatPanelAtPoint = useCallback((panelId: string, clientX: number, clientY: number) => {
    const root = rootRef.current
    const panel = panelMap[panelId]
    if (!root || !panel) {
      undock(panelId)
      return
    }

    const rootRect = root.getBoundingClientRect()

    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextZ = Math.max(...Object.values(current.panels).map((candidate) => candidate.zIndex), 0) + 1
      const width = Math.max(currentPanel.width, panel.minWidth)
      const height = Math.max(currentPanel.height, panel.minHeight)
      const nextRect = clampFloatRect(
        {
          x: clientX - rootRect.left - width / 2,
          y: clientY - rootRect.top - 22,
          width,
          height,
        },
        rootSize,
        panel,
      )
      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          mode: 'floating',
          lastMode: 'floating',
          x: nextRect.x,
          y: nextRect.y,
          width: nextRect.width,
          height: nextRect.height,
          zIndex: nextZ,
        },
      }

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, current.slots),
      }
    })
  }, [panelMap, panels, rootSize, undock])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current
      const root = rootRef.current
      if (!interaction || !root) {
        return
      }

      const rootRect = root.getBoundingClientRect()

      if (interaction.kind === 'move') {
        const panel = panelMap[interaction.panelId]
        const currentPanel = state.panels[interaction.panelId]
        const rect = clampFloatRect(
          {
            x: event.clientX - rootRect.left - interaction.offsetX,
            y: event.clientY - rootRect.top - interaction.offsetY,
            width: currentPanel.width,
            height: currentPanel.height,
          },
          rootSize,
          panel,
        )

        setState((current) => ({
          ...current,
          panels: {
            ...current.panels,
            [interaction.panelId]: {
              ...current.panels[interaction.panelId],
              mode: 'floating',
              lastMode: 'floating',
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          },
        }))
        return
      }

      if (interaction.kind === 'rail-drag') {
        const deltaX = event.clientX - interaction.startX
        const deltaY = event.clientY - interaction.startY
        const distance = Math.hypot(deltaX, deltaY)

        if (!interaction.dragging && distance < RAIL_DRAG_THRESHOLD) {
          return
        }

        if (!interaction.dragging) {
          interactionRef.current = {
            ...interaction,
            dragging: true,
          }
          setDraggedPanelId(interaction.panelId)
          suppressRailClickRef.current = interaction.panelId
        }

        setDragPreview({
          panelId: interaction.panelId,
          x: event.clientX - rootRect.left,
          y: event.clientY - rootRect.top,
        })

        const nextTarget =
          dockGuides.find(({ rect }) => {
            const x = event.clientX - rootRect.left
            const y = event.clientY - rootRect.top
            return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
          })?.area ?? null

        setDragDockTarget((current) => (current === nextTarget ? current : nextTarget))
        if (nextTarget) {
          setRailSortTarget(null)
          return
        }

        let nextSortTarget: RailSortTarget = null

        for (const button of Object.values(railButtonRefs.current)) {
          if (!button || button.dataset.panelId === interaction.panelId) {
            continue
          }

          const rect = button.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            continue
          }

          const slot = button.dataset.slot as SlotId
          const targetPanelId = button.dataset.panelId ?? ''
          const orderedIds = getOrderedPanelIdsForSlot(panels, state.panels, state.slots, slot)
          const targetIndex = orderedIds.indexOf(targetPanelId)
          if (targetIndex === -1) {
            continue
          }

          const position =
            slot === 'bottom-left' || slot === 'bottom-right'
              ? event.clientX >= rect.left + rect.width / 2
                ? 'after'
                : 'before'
              : event.clientY >= rect.top + rect.height / 2
                ? 'after'
                : 'before'

          nextSortTarget = {
            slot,
            index: targetIndex + (position === 'after' ? 1 : 0),
            panelId: targetPanelId,
            position,
          }
          break
        }

        setRailSortTarget((current) =>
          current?.slot === nextSortTarget?.slot &&
          current?.index === nextSortTarget?.index &&
          current?.panelId === nextSortTarget?.panelId &&
          current?.position === nextSortTarget?.position
            ? current
            : nextSortTarget,
        )
        return
      }

      if (interaction.kind === 'edge-resize') {
        setState((current) => ({
          ...current,
          chrome: {
            ...current.chrome,
            [interaction.rail === 'left' ? 'leftWidth' : interaction.rail === 'right' ? 'rightWidth' : 'bottomHeight']: clamp(
              interaction.rail === 'left'
                ? interaction.startSize + (event.clientX - interaction.startX)
                : interaction.rail === 'right'
                  ? interaction.startSize - (event.clientX - interaction.startX)
                  : interaction.startSize - (event.clientY - interaction.startY),
              interaction.rail === 'bottom' ? 220 : 280,
              getRailEdgeSizeLimit(interaction.rail, panels, current, rootSize),
            ),
          },
        }))
        return
      }

      if (interaction.kind === 'split-resize') {
        const container = geometry.railContainers[interaction.rail]
        if (!container) {
          return
        }

        if (interaction.rail === 'left' || interaction.rail === 'right') {
          const ratio = clamp((event.clientY - rootRect.top - container.y) / Math.max(1, container.height - SPLIT_GAP), 0.2, 0.8)
          setState((current) => ({
            ...current,
            chrome: {
              ...current.chrome,
              [interaction.rail === 'left' ? 'leftSplit' : 'rightSplit']: ratio,
            },
          }))
        } else {
          const ratio = clamp((event.clientX - rootRect.left - container.x) / Math.max(1, container.width - SPLIT_GAP), 0.2, 0.8)
          setState((current) => ({
            ...current,
            chrome: {
              ...current.chrome,
              bottomSplit: ratio,
            },
          }))
        }
        return
      }

      const panel = panelMap[interaction.panelId]
      setState((current) => ({
        ...current,
        panels: {
          ...current.panels,
          [interaction.panelId]: {
            ...current.panels[interaction.panelId],
            width: clamp(
              interaction.startWidth + (event.clientX - interaction.startX),
              panel.minWidth,
              Math.max(panel.minWidth, rootSize.width - ROOT_PADDING * 2),
            ),
            height: clamp(
              interaction.startHeight + (event.clientY - interaction.startY),
              panel.minHeight,
              Math.max(panel.minHeight, rootSize.height - ROOT_PADDING * 2),
            ),
          },
        },
      }))
    }

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current
      interactionRef.current = null

      if (interaction?.kind === 'rail-drag') {
        if (interaction.dragging) {
          if (railSortTarget) {
            applyRailOrderDrop(interaction.panelId, railSortTarget.slot, railSortTarget.index)
          } else if (dragDockTarget) {
            dock(interaction.panelId, dragDockTarget)
          } else {
            const root = rootRef.current
            if (root) {
              const rootRect = root.getBoundingClientRect()
              const x = event.clientX - rootRect.left
              const y = event.clientY - rootRect.top
              const withinCenter =
                x >= geometry.centerRect.x &&
                x <= geometry.centerRect.x + geometry.centerRect.width &&
                y >= geometry.centerRect.y &&
                y <= geometry.centerRect.y + geometry.centerRect.height

              if (withinCenter) {
                floatPanelAtPoint(interaction.panelId, event.clientX, event.clientY)
              } else if (interaction.source === 'floating') {
                floatPanelAtPoint(interaction.panelId, event.clientX, event.clientY)
              }
            }
          }
        }
        setDraggedPanelId(null)
        setDragDockTarget(null)
        setRailSortTarget(null)
        setDragPreview(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [applyRailOrderDrop, dock, dockGuides, dragDockTarget, floatPanelAtPoint, geometry.centerRect, geometry.railContainers, panelMap, panels, railSortTarget, rootSize, state.panels, state.slots])

  function bringToFront(panelId: string) {
    setState((current) => {
      const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
      return {
        ...current,
        panels: {
          ...current.panels,
          [panelId]: {
            ...current.panels[panelId],
            zIndex: nextZ,
          },
        },
      }
    })
  }

  function restoreToSidebar(panelId: string) {
    const currentPanel = state.panels[panelId]
    const panel = panelMap[panelId]
    if (!currentPanel || !panel) {
      return
    }

    const targetDock =
      currentPanel.dock === 'center'
        ? getForcedDockForPanel() ?? panel.defaultDock ?? 'right-top'
        : currentPanel.dock

    dock(panelId, targetDock)
  }

  function hide(panelId: string) {
    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          lastMode: currentPanel.mode === 'hidden' ? currentPanel.lastMode : currentPanel.mode,
          mode: 'hidden',
        },
      }

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, current.slots),
      }
    })
  }

  function collapseDockedPanel(panelId: string) {
    setState((current) => {
      const panelState = current.panels[panelId]
      if (!panelState || panelState.mode !== 'docked' || panelState.dock === 'center') {
        return current
      }

      return {
        ...current,
        slots: {
          ...current.slots,
          [panelState.dock]: {
            ...current.slots[panelState.dock],
            expanded: false,
            activePanelId: panelId,
            panelOrder: current.slots[panelState.dock].panelOrder,
          },
        },
      }
    })
  }

  function toggleSlot(slot: SlotId, panelId: string) {
    setState((current) => {
      const slotState = current.slots[slot]
      return {
        ...current,
        slots: {
          ...current.slots,
          [slot]: {
            activePanelId: panelId,
            expanded: slotState.activePanelId === panelId ? !slotState.expanded : true,
            panelOrder: slotState.panelOrder,
          },
        },
      }
    })
  }

  function beginMove(panelId: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button')) {
      return
    }

    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect) {
      return
    }

    const currentPanel = state.panels[panelId]
    const rect =
      currentPanel.mode === 'floating'
        ? { x: currentPanel.x, y: currentPanel.y }
        : { x: geometry.dockedRects[panelId]?.x ?? ROOT_PADDING, y: geometry.dockedRects[panelId]?.y ?? ROOT_PADDING }

    if (currentPanel.mode !== 'floating') {
      undock(panelId)
    } else {
      bringToFront(panelId)
    }

    interactionRef.current = {
      kind: 'move',
      panelId,
      pointerId: event.pointerId,
      offsetX: event.clientX - rootRect.left - rect.x,
      offsetY: event.clientY - rootRect.top - rect.y,
    }
  }

  function beginEdgeResize(rail: 'left' | 'right' | 'bottom', event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    interactionRef.current = {
      kind: 'edge-resize',
      rail,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: rail === 'left' ? state.chrome.leftWidth : rail === 'right' ? state.chrome.rightWidth : state.chrome.bottomHeight,
    }
  }

  function beginSplitResize(rail: RailId, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    interactionRef.current = {
      kind: 'split-resize',
      rail,
      pointerId: event.pointerId,
    }
  }

  function beginFloatResize(panelId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    bringToFront(panelId)
    interactionRef.current = {
      kind: 'float-resize',
      panelId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: state.panels[panelId].width,
      startHeight: state.panels[panelId].height,
    }
  }

  function beginRailDrag(panelId: string, event: ReactPointerEvent<HTMLElement>, source: 'rail' | 'floating' = 'rail') {
    if (event.button !== 0) {
      return
    }

    interactionRef.current = {
      kind: 'rail-drag',
      source,
      panelId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
  }

  function handleRailButtonClick(slot: SlotId, panelId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressRailClickRef.current === panelId) {
      suppressRailClickRef.current = null
      event.preventDefault()
      return
    }

    toggleSlot(slot, panelId)
  }

  function endToolDrag() {
    setDraggedPanelId(null)
    setDragDockTarget(null)
    setRailSortTarget(null)
    setDragPreview(null)
  }

  function dropToDock(area: DockArea, panelId?: string | null) {
    const nextPanelId = panelId ?? draggedPanelId
    if (!nextPanelId) {
      return
    }

    dock(nextPanelId, area)
    setDraggedPanelId(null)
    setDragDockTarget(null)
  }

  function renderRailButtons(slot: SlotId) {
    const slotState = state.slots[slot]
    const panelIds = getOrderedPanelIdsForSlot(panels, state.panels, state.slots, slot)

    return panelIds.map((panelId) => {
      const panel = panelMap[panelId]
      const Icon = getPanelIcon(panelId)
      const isCurrent = slotState.activePanelId === panelId
      const isExpanded = isCurrent && slotState.expanded
      const isDragging = draggedPanelId === panelId
      const isSortTarget = railSortTarget?.slot === slot && railSortTarget.panelId === panelId

      return (
        <ToolWindowMenu key={panelId} onFloat={() => undock(panelId)} onHide={() => hide(panelId)} onDock={(area) => dock(panelId, area)}>
          <button
            type="button"
            ref={(node) => {
              railButtonRefs.current[`${slot}:${panelId}`] = node
            }}
            data-slot={slot}
            data-panel-id={panelId}
            className={cx(
              'workspace-tool-button',
              isCurrent && 'workspace-tool-button-current',
              isExpanded && 'workspace-tool-button-active',
              isDragging && 'workspace-tool-button-dragging',
              isSortTarget && 'workspace-tool-button-drop-target',
              isSortTarget && railSortTarget?.position === 'after' && 'workspace-tool-button-drop-target-after',
            )}
            onClick={(event) => handleRailButtonClick(slot, panelId, event)}
            onPointerDown={(event) => beginRailDrag(panelId, event)}
            title={`${panel.title}${isExpanded ? ' (expanded)' : ''}`}
          >
            <Icon className="h-4.5 w-4.5" />
          </button>
        </ToolWindowMenu>
      )
    })
  }

  function renderRail(rail: RailId) {
    const railRect = geometry.rails[rail]
    if (!railRect) {
      return null
    }

    if (rail === 'bottom') {
      return null
    }

    const topSlot = rail === 'left' ? 'left-top' : 'right-top'
    const bottomSlot = rail === 'left' ? 'left-bottom' : 'right-bottom'
    const bottomDockSlot = rail === 'left' ? 'bottom-left' : 'bottom-right'

    return (
      <aside
        className={cx('workspace-tool-rail', rail === 'left' ? 'workspace-tool-rail-left' : 'workspace-tool-rail-right')}
        style={{
          left: `${railRect.x}px`,
          top: `${railRect.y}px`,
          width: `${railRect.width}px`,
          height: `${railRect.height}px`,
        }}
      >
        <div className="workspace-tool-group">{renderRailButtons(topSlot)}</div>
        <div className="workspace-tool-divider" />
        <div className="workspace-tool-group">{renderRailButtons(bottomSlot)}</div>
        <div className="workspace-tool-spacer" />
        <div className="workspace-tool-group">{renderRailButtons(bottomDockSlot)}</div>
      </aside>
    )
  }

  function renderDockGuide(area: DockArea, rect: PanelRect, label: string) {
    return (
      <div
        key={area}
        className={cx('workspace-drop-zone', dragDockTarget === area && 'workspace-drop-zone-active')}
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }}
        onDragEnter={() => setDragDockTarget(area)}
        onDragOver={(event) => {
          event.preventDefault()
          if (dragDockTarget !== area) {
            setDragDockTarget(area)
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return
          }
          if (dragDockTarget === area) {
            setDragDockTarget(null)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dropToDock(area, event.dataTransfer.getData('text/plain') || null)
        }}
        title={label}
      >
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="workspace-root">
      {renderRail('left')}
      {renderRail('right')}

      {draggedPanelId ? (
        <div className="workspace-drop-overlay" onDragOver={(event) => event.preventDefault()} onDrop={() => endToolDrag()}>
          {dockGuides.map(({ area, rect, label }) => renderDockGuide(area, rect, label))}
          {dragPreview ? (
            <div
              className="workspace-drag-preview"
              style={{
                left: `${dragPreview.x + 14}px`,
                top: `${dragPreview.y + 14}px`,
              }}
            >
              {(() => {
                const Icon = getPanelIcon(dragPreview.panelId)
                const panel = panelMap[dragPreview.panelId]

                return (
                  <>
                    <span className="workspace-drag-preview-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{panel?.title ?? dragPreview.panelId}</span>
                  </>
                )
              })()}
            </div>
          ) : null}
        </div>
      ) : null}

      {(['left', 'right', 'bottom'] as const).map((rail) => {
        const resizer = geometry.edgeResizers[rail]
        if (!resizer) {
          return null
        }

        return (
          <div
            key={`edge-${rail}`}
            className={cx(
              'workspace-dock-resizer',
              rail === 'left'
                ? 'workspace-dock-resizer-right'
                : rail === 'right'
                  ? 'workspace-dock-resizer-left'
                  : 'workspace-dock-resizer-bottom',
            )}
            style={{
              left: `${resizer.x}px`,
              top: `${resizer.y}px`,
              width: `${resizer.width}px`,
              height: `${resizer.height}px`,
            }}
            onPointerDown={(event) => beginEdgeResize(rail, event)}
          />
        )
      })}

      {(['left', 'right', 'bottom'] as const).map((rail) => {
        const resizer = geometry.splitResizers[rail]
        if (!resizer) {
          return null
        }

        return (
          <div
            key={`split-${rail}`}
            className={cx(
              'workspace-split-resizer',
              rail === 'bottom' ? 'workspace-split-resizer-vertical' : 'workspace-split-resizer-horizontal',
            )}
            style={{
              left: `${resizer.x}px`,
              top: `${resizer.y}px`,
              width: `${resizer.width}px`,
              height: `${resizer.height}px`,
            }}
            onPointerDown={(event) => beginSplitResize(rail, event)}
          />
        )
      })}

      {panels.map((panel) => {
        const panelState = state.panels[panel.id]
        if (!panelState || panelState.mode === 'hidden') {
          return null
        }
        const hideWhileDragging = panelState.mode === 'floating' && draggedPanelId === panel.id

        const rect =
          panelState.mode === 'floating'
            ? clampFloatRect(
                {
                  x: panelState.x,
                  y: panelState.y,
                  width: panelState.width,
                  height: panelState.height,
                },
                rootSize,
                panel,
              )
            : geometry.dockedRects[panel.id]

        if (!rect) {
          return null
        }

        const hideDockHeader =
          panelState.mode === 'docked' && (panelState.dock !== 'center' || panel.id === 'viewport')

        return (
          <section
            key={panel.id}
            className={cx(
              'workspace-panel-shell',
              panelState.mode === 'floating' ? 'workspace-panel-floating' : 'workspace-panel-docked',
            )}
            style={{
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              visibility: hideWhileDragging ? 'hidden' : 'visible',
              pointerEvents: hideWhileDragging ? 'none' : undefined,
              zIndex:
                panelState.mode === 'floating'
                  ? 30 + panelState.zIndex
                  : panelState.dock === 'center'
                    ? 4
                    : panelState.dock.startsWith('bottom')
                      ? 11
                      : 12,
            }}
            onPointerDown={() => {
              if (panelState.mode === 'floating') {
                bringToFront(panel.id)
              }
            }}
          >
            {!hideDockHeader ? (
              <ToolWindowMenu onFloat={() => undock(panel.id)} onHide={() => hide(panel.id)} onDock={(area) => dock(panel.id, area)}>
                <header className="workspace-panel-header" onPointerDown={(event) => beginMove(panel.id, event)}>
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="workspace-panel-grip"
                      onPointerDown={panelState.mode === 'floating' ? (event) => {
                        event.stopPropagation()
                        beginRailDrag(panel.id, event, 'floating')
                      } : undefined}
                    >
                      <Grip className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="workspace-panel-title">{panel.title}</p>
                      <p className="workspace-panel-subtitle">{panel.subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {panelState.mode !== 'floating' ? (
                        <>
                          <span className="workspace-panel-mode-pill" title={getDockLabel(panelState.dock)}>
                            {getDockLabel(panelState.dock)}
                          </span>
                          <button type="button" className="workspace-panel-action" onClick={() => dock(panel.id, 'left-top')} title="Dock left">
                            <PanelLeft className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="workspace-panel-action" onClick={() => dock(panel.id, 'right-top')} title="Dock right">
                            <PanelRight className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="workspace-panel-action" onClick={() => dock(panel.id, 'bottom-left')} title="Dock bottom">
                            <PanelBottom className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="workspace-panel-action" onClick={() => dock(panel.id, 'center')} title="Dock center">
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="workspace-panel-action" onClick={() => undock(panel.id)} title="Float window">
                            <SquareDashedMousePointer className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="workspace-panel-action"
                        onClick={() => (panelState.mode === 'floating' ? restoreToSidebar(panel.id) : panelState.dock !== 'center' ? collapseDockedPanel(panel.id) : hide(panel.id))}
                        title={panelState.mode === 'floating' ? 'Restore to sidebar' : panelState.dock !== 'center' ? 'Collapse to sidebar' : 'Hide'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </header>
              </ToolWindowMenu>
            ) : null}

            <div
              ref={(node) => {
                panelContentRefs.current[panel.id] = node
              }}
              data-panel-id={panel.id}
              className="min-h-0 flex-1 overflow-hidden"
            >
              {panel.content}
            </div>

            {panelState.mode === 'floating' ? (
              <div className="workspace-float-resizer" onPointerDown={(event) => beginFloatResize(panel.id, event)} />
            ) : null}
          </section>
        )
      })}
    </div>
  )
})
