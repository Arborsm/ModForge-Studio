import { COLUMN_GAP, RESIZER_THICKNESS, ROOT_PADDING, SPLIT_GAP } from './layoutConstants'
import type {
  PanelRect,
  WorkspaceGeometry,
  WorkspacePanelArea,
  WorkspacePanelConfig,
  WorkspaceSize,
  WorkspaceStoredState,
  WorkspaceResizeRail,
} from '@shared/contracts'
import { getAvailableVerticalHeight, getResolvedSidePanelWidths, splitSpan } from './layoutSizing'

function getAreaPanels(panels: WorkspacePanelConfig[], area: WorkspacePanelArea) {
  return panels.filter((panel) => panel.area === area)
}

function assignVerticalPanels(
  panelRects: Record<string, PanelRect>,
  panels: WorkspacePanelConfig[],
  rect: PanelRect,
  ratio: number,
  rail: 'left' | 'right',
  splitResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>,
) {
  if (panels.length === 0) {
    return
  }

  if (panels.length === 1) {
    panelRects[panels[0].id] = rect
    return
  }

  const [firstPanel, secondPanel] = panels
  const { first, second } = splitSpan(rect.height, ratio, firstPanel.minHeight, secondPanel.minHeight)
  panelRects[firstPanel.id] = { x: rect.x, y: rect.y, width: rect.width, height: first }
  panelRects[secondPanel.id] = {
    x: rect.x,
    y: rect.y + first + SPLIT_GAP,
    width: rect.width,
    height: second,
  }
  splitResizers[rail] = {
    x: rect.x,
    y: rect.y + first + SPLIT_GAP / 2 - RESIZER_THICKNESS / 2,
    width: rect.width,
    height: RESIZER_THICKNESS,
  }
}

function assignBottomPanels(
  panelRects: Record<string, PanelRect>,
  panels: WorkspacePanelConfig[],
  rect: PanelRect,
  ratio: number,
  splitResizers: Partial<Record<WorkspaceResizeRail, PanelRect>>,
) {
  if (panels.length === 0) {
    return
  }

  if (panels.length === 1) {
    panelRects[panels[0].id] = rect
    return
  }

  const [firstPanel, secondPanel] = panels
  const { first, second } = splitSpan(rect.width, ratio, firstPanel.minWidth, secondPanel.minWidth)
  panelRects[firstPanel.id] = { x: rect.x, y: rect.y, width: first, height: rect.height }
  panelRects[secondPanel.id] = {
    x: rect.x + first + SPLIT_GAP,
    y: rect.y,
    width: second,
    height: rect.height,
  }
  splitResizers.bottom = {
    x: rect.x + first + SPLIT_GAP / 2 - RESIZER_THICKNESS / 2,
    y: rect.y,
    width: RESIZER_THICKNESS,
    height: rect.height,
  }
}

export function getWorkspaceGeometry(panels: WorkspacePanelConfig[], state: WorkspaceStoredState, size: WorkspaceSize): WorkspaceGeometry {
  const leftPanels = getAreaPanels(panels, 'left')
  const centerPanels = getAreaPanels(panels, 'center')
  const rightPanels = getAreaPanels(panels, 'right')
  const bottomPanels = getAreaPanels(panels, 'bottom')
  const leftVisible = leftPanels.length > 0
  const rightVisible = rightPanels.length > 0
  const bottomVisible = bottomPanels.length > 0
  const widths = getResolvedSidePanelWidths(panels, state.chrome, size, leftVisible, rightVisible)
  const availableBottomHeight = Math.max(0, size.height - ROOT_PADDING * 2 - COLUMN_GAP - 180)
  const bottomHeight = bottomVisible ? Math.min(state.chrome.bottomHeight, availableBottomHeight) : 0
  const mainHeight = getAvailableVerticalHeight(size, bottomVisible, bottomHeight)
  const leftRect: PanelRect | null = leftVisible ? { x: ROOT_PADDING, y: ROOT_PADDING, width: widths.left, height: mainHeight } : null
  const centerRect: PanelRect = {
    x: ROOT_PADDING + (leftVisible ? widths.left + COLUMN_GAP : 0),
    y: ROOT_PADDING,
    width: widths.center,
    height: mainHeight,
  }
  const rightRect: PanelRect | null = rightVisible
    ? {
        x: size.width - ROOT_PADDING - widths.right,
        y: ROOT_PADDING,
        width: widths.right,
        height: mainHeight,
      }
    : null
  const bottomRect: PanelRect | null = bottomVisible
    ? {
        x: ROOT_PADDING,
        y: ROOT_PADDING + mainHeight + COLUMN_GAP,
        width: Math.max(0, size.width - ROOT_PADDING * 2),
        height: bottomHeight,
      }
    : null

  const panelRects: Record<string, PanelRect> = {}
  const splitResizers: Partial<Record<WorkspaceResizeRail, PanelRect>> = {}
  const edgeResizers: Partial<Record<WorkspaceResizeRail, PanelRect>> = {}

  if (leftRect) {
    assignVerticalPanels(panelRects, leftPanels, leftRect, state.chrome.leftSplit, 'left', splitResizers)
    edgeResizers.left = {
      x: leftRect.x + leftRect.width + COLUMN_GAP / 2 - RESIZER_THICKNESS / 2,
      y: leftRect.y,
      width: RESIZER_THICKNESS,
      height: leftRect.height,
    }
  }

  if (centerPanels[0]) {
    panelRects[centerPanels[0].id] = centerRect
  }

  if (rightRect) {
    assignVerticalPanels(panelRects, rightPanels, rightRect, state.chrome.rightSplit, 'right', splitResizers)
    edgeResizers.right = {
      x: rightRect.x - COLUMN_GAP / 2 - RESIZER_THICKNESS / 2,
      y: rightRect.y,
      width: RESIZER_THICKNESS,
      height: rightRect.height,
    }
  }

  if (bottomRect) {
    assignBottomPanels(panelRects, bottomPanels, bottomRect, state.chrome.bottomSplit, splitResizers)
    edgeResizers.bottom = {
      x: bottomRect.x,
      y: bottomRect.y - COLUMN_GAP / 2 - RESIZER_THICKNESS / 2,
      width: bottomRect.width,
      height: RESIZER_THICKNESS,
    }
  }

  return {
    centerRect,
    areaRects: {
      left: leftRect,
      center: centerRect,
      right: rightRect,
      bottom: bottomRect,
    },
    panelRects,
    splitResizers,
    edgeResizers,
  }
}
