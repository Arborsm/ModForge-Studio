import { COLUMN_GAP, MIN_CENTER_HEIGHT, MIN_CENTER_WIDTH, ROOT_PADDING, SPLIT_GAP } from './layoutConstants'
import type { PanelRect, WorkspacePanelConfig, WorkspaceSize, WorkspaceStoredState } from '@shared/contracts'
import { clamp } from './layoutState'

export function getHorizontalUsableWidth(size: WorkspaceSize, leftPanelVisible: boolean, rightPanelVisible: boolean) {
  const horizontalGaps = (leftPanelVisible ? COLUMN_GAP : 0) + (rightPanelVisible ? COLUMN_GAP : 0)
  return Math.max(0, size.width - ROOT_PADDING * 2 - horizontalGaps)
}

function getPanelForArea(panels: WorkspacePanelConfig[], area: WorkspacePanelConfig['area']) {
  return panels.find((panel) => panel.area === area) ?? null
}

export function getResolvedSidePanelWidths(
  panels: WorkspacePanelConfig[],
  chrome: Pick<WorkspaceStoredState['chrome'], 'leftWidth' | 'rightWidth'>,
  size: WorkspaceSize,
  leftPanelVisible: boolean,
  rightPanelVisible: boolean,
) {
  const centerPanel = getPanelForArea(panels, 'center')
  const leftPanel = getPanelForArea(panels, 'left')
  const rightPanel = getPanelForArea(panels, 'right')
  const centerMin = centerPanel?.minWidth ?? MIN_CENTER_WIDTH
  const leftMin = leftPanelVisible ? (leftPanel?.minWidth ?? 0) : 0
  const rightMin = rightPanelVisible ? (rightPanel?.minWidth ?? 0) : 0
  const usable = getHorizontalUsableWidth(size, leftPanelVisible, rightPanelVisible)

  if (!leftPanelVisible && !rightPanelVisible) {
    return { left: 0, center: usable, right: 0 }
  }

  const requiredWidth = centerMin + leftMin + rightMin
  const minimumScale = requiredWidth > usable && requiredWidth > 0 ? usable / requiredWidth : 1
  const resolvedCenterMin = centerMin * minimumScale
  const resolvedLeftMin = leftMin * minimumScale
  const resolvedRightMin = rightMin * minimumScale

  if (leftPanelVisible && rightPanelVisible) {
    let left = Math.round(usable * chrome.leftWidth)
    let right = Math.round(usable * chrome.rightWidth)
    const maxLeft = Math.max(resolvedLeftMin, usable - resolvedCenterMin - resolvedRightMin)
    const maxRight = Math.max(resolvedRightMin, usable - resolvedCenterMin - resolvedLeftMin)

    left = clamp(left, resolvedLeftMin, maxLeft)
    right = clamp(right, resolvedRightMin, maxRight)

    if (left + right > usable - resolvedCenterMin) {
      const overflow = left + right - (usable - resolvedCenterMin)
      const shrinkRight = Math.min(Math.max(0, right - resolvedRightMin), overflow)
      right -= shrinkRight
      left -= Math.min(Math.max(0, left - resolvedLeftMin), overflow - shrinkRight)
    }

    const resolvedLeft = Math.round(left)
    const resolvedRight = Math.round(right)
    return { left: resolvedLeft, center: Math.max(0, usable - resolvedLeft - resolvedRight), right: resolvedRight }
  }

  if (leftPanelVisible) {
    const left = Math.round(
      clamp(Math.round(usable * chrome.leftWidth), resolvedLeftMin, Math.max(resolvedLeftMin, usable - resolvedCenterMin)),
    )
    return { left, center: Math.max(0, usable - left), right: 0 }
  }

  const right = Math.round(
    clamp(Math.round(usable * chrome.rightWidth), resolvedRightMin, Math.max(resolvedRightMin, usable - resolvedCenterMin)),
  )
  return { left: 0, center: Math.max(0, usable - right), right }
}

export function getRailEdgeSizeBounds(
  rail: 'left' | 'right' | 'bottom',
  panels: WorkspacePanelConfig[],
  state: WorkspaceStoredState,
  size: WorkspaceSize,
) {
  if (rail === 'bottom') {
    return {
      min: 180,
      max: Math.max(180, size.height - ROOT_PADDING * 2 - MIN_CENTER_HEIGHT),
    }
  }

  const leftPanelVisible = panels.some((panel) => panel.area === 'left')
  const rightPanelVisible = panels.some((panel) => panel.area === 'right')
  const centerPanel = getPanelForArea(panels, 'center')
  const sidePanel = getPanelForArea(panels, rail)
  const centerMin = centerPanel?.minWidth ?? MIN_CENTER_WIDTH
  const sideMin = sidePanel?.minWidth ?? (rail === 'left' ? 220 : 260)
  const usable = getHorizontalUsableWidth(size, leftPanelVisible, rightPanelVisible)
  const resolvedWidths = getResolvedSidePanelWidths(panels, state.chrome, size, leftPanelVisible, rightPanelVisible)
  const oppositeWidth = rail === 'left' ? resolvedWidths.right : resolvedWidths.left

  return {
    min: sideMin,
    max: Math.max(sideMin, usable - centerMin - oppositeWidth),
  }
}

export function splitSpan(
  total: number,
  ratio: number,
  firstMin: number,
  secondMin: number,
  firstMax = Number.POSITIVE_INFINITY,
  secondMax = Number.POSITIVE_INFINITY,
) {
  const usable = Math.max(0, total - SPLIT_GAP)
  const minimumScale = firstMin + secondMin > usable && firstMin + secondMin > 0 ? usable / (firstMin + secondMin) : 1
  const resolvedFirstMin = firstMin * minimumScale
  const resolvedSecondMin = secondMin * minimumScale
  let first = clamp(Math.round(usable * ratio), resolvedFirstMin, Math.max(resolvedFirstMin, usable - resolvedSecondMin))
  let second = usable - first

  if (first > firstMax) {
    first = clamp(firstMax, resolvedFirstMin, usable - resolvedSecondMin)
    second = usable - first
  }

  if (second > secondMax) {
    second = clamp(secondMax, resolvedSecondMin, usable - resolvedFirstMin)
    first = usable - second
  }

  return { first, second }
}

export function getAvailableVerticalHeight(size: WorkspaceSize, bottomVisible: boolean, bottomHeight: number) {
  const bottomUsed = bottomVisible ? bottomHeight + COLUMN_GAP : 0
  return Math.max(0, size.height - ROOT_PADDING * 2 - bottomUsed)
}

export type { PanelRect }
