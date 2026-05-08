import {
  COLUMN_GAP,
  MIN_CENTER_HEIGHT,
  MIN_CENTER_WIDTH,
  ROOT_PADDING,
  TOOL_WINDOW_RAIL_GAP,
  TOOL_WINDOW_RAIL_HEIGHT,
  TOOL_WINDOW_RAIL_WIDTH,
} from './layoutConstants'
import type {
  PanelRect,
  WorkspacePanelConfig,
  WorkspaceSize,
  WorkspaceStoredState,
} from '@shared/contracts'
import { clamp, getActiveDockedPanel, getDockedPanelIdsForRail } from './layoutState'

export function getHorizontalUsableWidth(
  size: WorkspaceSize,
  leftRailVisible: boolean,
  rightRailVisible: boolean,
  leftPanelVisible: boolean,
  rightPanelVisible: boolean,
) {
  const leftRailUsed = leftRailVisible ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const rightRailUsed = rightRailVisible ? TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP : 0
  const horizontalGaps = (leftPanelVisible ? COLUMN_GAP : 0) + (rightPanelVisible ? COLUMN_GAP : 0)

  return Math.max(160, size.width - ROOT_PADDING * 2 - leftRailUsed - rightRailUsed - horizontalGaps)
}

export function getResolvedSidePanelWidths(
  panels: WorkspacePanelConfig[],
  chrome: { leftWidth: number; rightWidth: number },
  size: WorkspaceSize,
  leftRailVisible: boolean,
  rightRailVisible: boolean,
  leftPanelVisible: boolean,
  rightPanelVisible: boolean,
) {
  const centerPanel = panels.find((panel) => panel.id === 'viewport' || panel.id === 'item-catalog')
  const leftPanel = panels.find((panel) => panel.id === 'assets' || panel.id === 'item-navigation') ?? null
  const rightPanel = panels.find((panel) => panel.id === 'inspector' || panel.id === 'item-details') ?? null

  const centerMin = centerPanel?.minWidth ?? MIN_CENTER_WIDTH
  const leftMin = leftPanelVisible ? (leftPanel?.minWidth ?? 0) : 0
  const rightMin = rightPanelVisible ? (rightPanel?.minWidth ?? 0) : 0
  const usable = getHorizontalUsableWidth(size, leftRailVisible, rightRailVisible, leftPanelVisible, rightPanelVisible)

  if (leftPanelVisible && rightPanelVisible) {
    let left = Math.round(usable * chrome.leftWidth)
    let right = Math.round(usable * chrome.rightWidth)

    left = clamp(left, leftMin, Math.max(leftMin, usable - centerMin - rightMin))
    right = clamp(right, rightMin, Math.max(rightMin, usable - centerMin - left))

    let center = usable - left - right
    if (center < centerMin) {
      const deficit = centerMin - center
      const shrinkRight = Math.min(Math.max(0, right - rightMin), deficit)
      right -= shrinkRight
      const remainingDeficit = deficit - shrinkRight
      if (remainingDeficit > 0) {
        left -= Math.min(Math.max(0, left - leftMin), remainingDeficit)
      }
      center = usable - left - right
    }

    return { left, center, right }
  }

  if (leftPanelVisible) {
    const left = clamp(Math.round(usable * chrome.leftWidth), leftMin, Math.max(leftMin, usable - centerMin))
    return { left, center: usable - left, right: 0 }
  }

  if (rightPanelVisible) {
    const right = clamp(Math.round(usable * chrome.rightWidth), rightMin, Math.max(rightMin, usable - centerMin))
    return { left: 0, center: usable - right, right }
  }

  return { left: 0, center: usable, right: 0 }
}

export function clampFloatRect(rect: PanelRect, size: WorkspaceSize, panel: WorkspacePanelConfig) {
  const width = clamp(rect.width, panel.minWidth, Math.max(panel.minWidth, size.width - ROOT_PADDING * 2))
  const height = clamp(rect.height, panel.minHeight, Math.max(panel.minHeight, size.height - ROOT_PADDING * 2))
  const x = clamp(rect.x, ROOT_PADDING, Math.max(ROOT_PADDING, size.width - width - ROOT_PADDING))
  const y = clamp(rect.y, ROOT_PADDING, Math.max(ROOT_PADDING, size.height - height - ROOT_PADDING))

  return { x, y, width, height }
}

export function getRailEdgeSizeBounds(
  rail: 'left' | 'right' | 'bottom',
  panels: WorkspacePanelConfig[],
  panelMap: Record<string, WorkspacePanelConfig>,
  state: WorkspaceStoredState,
  size: WorkspaceSize,
) {
  const leftRailVisible = getDockedPanelIdsForRail(panels, state.panels, 'left').length > 0
  const rightRailVisible = getDockedPanelIdsForRail(panels, state.panels, 'right').length > 0
  const bottomRailUsed = getDockedPanelIdsForRail(panels, state.panels, 'bottom').length ? TOOL_WINDOW_RAIL_HEIGHT + TOOL_WINDOW_RAIL_GAP : 0

  if (rail === 'bottom') {
    return {
      min: 220,
      max: Math.max(220, size.height - ROOT_PADDING * 2 - MIN_CENTER_HEIGHT - bottomRailUsed),
    }
  }

  const leftPanelVisible = Boolean(
    getActiveDockedPanel(panelMap, state, 'left-top') || getActiveDockedPanel(panelMap, state, 'left-bottom'),
  )
  const rightPanelVisible = Boolean(
    getActiveDockedPanel(panelMap, state, 'right-top') || getActiveDockedPanel(panelMap, state, 'right-bottom'),
  )
  const centerPanel = panels.find((panel) => panel.id === 'viewport' || panel.id === 'item-catalog')
  const leftPanel = panels.find((panel) => panel.id === 'assets' || panel.id === 'item-navigation') ?? null
  const rightPanel = panels.find((panel) => panel.id === 'inspector' || panel.id === 'item-details') ?? null
  const centerMin = centerPanel?.minWidth ?? MIN_CENTER_WIDTH
  const usable = getHorizontalUsableWidth(size, leftRailVisible, rightRailVisible, leftPanelVisible, rightPanelVisible)
  const resolvedWidths = getResolvedSidePanelWidths(
    panels,
    state.chrome,
    size,
    leftRailVisible,
    rightRailVisible,
    leftPanelVisible,
    rightPanelVisible,
  )

  if (rail === 'left') {
    const min = leftPanel?.minWidth ?? 220
    return {
      min,
      max: Math.max(min, usable - centerMin - resolvedWidths.right),
    }
  }

  const min = rightPanel?.minWidth ?? 260
  return {
    min,
    max: Math.max(min, usable - centerMin - resolvedWidths.left),
  }
}

export function splitSpan(
  total: number,
  ratio: number,
  firstMin: number,
  secondMin: number,
  firstMax = Number.POSITIVE_INFINITY,
  secondMax = Number.POSITIVE_INFINITY,
  firstPreferred?: number,
) {
  const usable = total - 12
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
