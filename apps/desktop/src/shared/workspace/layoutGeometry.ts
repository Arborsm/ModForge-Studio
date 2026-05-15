import { COLUMN_GAP, MIN_CENTER_HEIGHT, ROOT_PADDING, SPLIT_GAP, TOOL_WINDOW_RAIL_GAP, TOOL_WINDOW_RAIL_WIDTH } from './layoutConstants'
import type {
  DockArea,
  PanelRect,
  RailId,
  WorkspaceGeometry,
  WorkspacePanelConfig,
  WorkspaceSize,
  WorkspaceStoredState,
} from '@shared/contracts'
import { clamp, getActiveDockedPanel, getDefaultChrome, getDockedPanelIdsForRail } from './layoutState'
import { getResolvedSidePanelWidths, splitSpan } from './layoutSizing'

export type DockGuide = {
  area: DockArea
  rect: PanelRect
  label: string
}

export function getWorkspaceGeometry(
  panels: WorkspacePanelConfig[],
  panelMap: Record<string, WorkspacePanelConfig>,
  state: WorkspaceStoredState,
  size: WorkspaceSize,
  measuredDockHeights: Record<string, number>,
): WorkspaceGeometry {
  const defaultChrome = getDefaultChrome(panels)
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
  const resolvedWidths = getResolvedSidePanelWidths(
    panels,
    state.chrome,
    size,
    leftRailVisible,
    rightRailVisible,
    leftPanelVisible,
    rightPanelVisible,
  )
  const leftPanelWidth = leftPanelVisible ? resolvedWidths.left : 0
  const rightPanelWidth = rightPanelVisible ? resolvedWidths.right : 0
  const leftPanelUsed = leftPanelVisible ? leftPanelWidth + COLUMN_GAP : 0
  const allowBottomAutoHeight = Math.abs(state.chrome.bottomHeight - defaultChrome.bottomHeight) < 0.5
  const bottomPreferredHeight = allowBottomAutoHeight
    ? [bottomLeftPanel, bottomRightPanel]
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
    : null
  const bottomHeight = bottomPreferredHeight ?? state.chrome.bottomHeight
  const bottomPanelUsed = bottomPanelVisible ? bottomHeight + COLUMN_GAP : 0

  const centerRect: PanelRect = {
    x: ROOT_PADDING + leftRailUsed + leftPanelUsed,
    y: ROOT_PADDING,
    width: resolvedWidths.center,
    height: Math.max(180, size.height - ROOT_PADDING * 2 - bottomRailUsed - bottomPanelUsed),
  }

  const rails: Record<RailId, PanelRect | null> = {
    left: leftRailVisible ? { x: ROOT_PADDING, y: ROOT_PADDING, width: TOOL_WINDOW_RAIL_WIDTH, height: centerRect.height } : null,
    right: rightRailVisible
      ? { x: size.width - ROOT_PADDING - TOOL_WINDOW_RAIL_WIDTH, y: ROOT_PADDING, width: TOOL_WINDOW_RAIL_WIDTH, height: centerRect.height }
      : null,
    bottom: null,
  }

  const railContainers: Record<RailId, PanelRect | null> = {
    left: leftPanelVisible ? { x: ROOT_PADDING + leftRailUsed, y: ROOT_PADDING, width: leftPanelWidth, height: centerRect.height } : null,
    right: rightPanelVisible
      ? {
          x: size.width - ROOT_PADDING - rightRailUsed - rightPanelWidth,
          y: ROOT_PADDING,
          width: rightPanelWidth,
          height: centerRect.height,
        }
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
      x: container.x + container.width - 4,
      y: container.y + 16,
      width: 8,
      height: container.height - 32,
    }

    if (leftTopPanel && leftBottomPanel) {
      const allowAutoHeight = leftTopPanel.dockAutoHeight && Math.abs(state.chrome.leftSplit - defaultChrome.leftSplit) < 0.001
      const topPreferredHeight = allowAutoHeight ? measuredDockHeights[leftTopPanel.id] : undefined
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
        y: container.y + first + SPLIT_GAP / 2 - 4,
        width: container.width - 36,
        height: 8,
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
      x: container.x - 4,
      y: container.y + 16,
      width: 8,
      height: container.height - 32,
    }

    if (rightTopPanel && rightBottomPanel) {
      const allowAutoHeight = rightTopPanel.dockAutoHeight && Math.abs(state.chrome.rightSplit - defaultChrome.rightSplit) < 0.001
      const topPreferredHeight = allowAutoHeight ? measuredDockHeights[rightTopPanel.id] : undefined
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
        y: container.y + first + SPLIT_GAP / 2 - 4,
        width: container.width - 36,
        height: 8,
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
      y: container.y - 4,
      width: container.width - 36,
      height: 8,
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
        x: container.x + first + SPLIT_GAP / 2 - 4,
        y: container.y + 18,
        width: 8,
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

export function getDockGuideRects(size: WorkspaceSize, geometry: WorkspaceGeometry, panels: WorkspacePanelConfig[]): DockGuide[] {
  const defaults = getDefaultChrome(panels)
  const defaultSideWidths = getResolvedSidePanelWidths(panels, defaults, size, true, true, true, true)
  const leftContainer = geometry.railContainers.left ?? {
    x: ROOT_PADDING + TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP,
    y: ROOT_PADDING,
    width: defaultSideWidths.left,
    height: geometry.centerRect.height,
  }
  const rightContainer = geometry.railContainers.right ?? {
    x: size.width - ROOT_PADDING - TOOL_WINDOW_RAIL_WIDTH - TOOL_WINDOW_RAIL_GAP - defaultSideWidths.right,
    y: ROOT_PADDING,
    width: defaultSideWidths.right,
    height: geometry.centerRect.height,
  }
  const bottomContainer = geometry.railContainers.bottom ?? {
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
      area: 'left-top',
      rect: { x: leftContainer.x, y: leftContainer.y, width: leftContainer.width, height: verticalHalf },
      label: 'Left Top',
    },
    {
      area: 'left-bottom',
      rect: {
        x: leftContainer.x,
        y: leftContainer.y + leftContainer.height - verticalHalf,
        width: leftContainer.width,
        height: verticalHalf,
      },
      label: 'Left Bottom',
    },
    {
      area: 'right-top',
      rect: { x: rightContainer.x, y: rightContainer.y, width: rightContainer.width, height: rightVerticalHalf },
      label: 'Right Top',
    },
    {
      area: 'right-bottom',
      rect: {
        x: rightContainer.x,
        y: rightContainer.y + rightContainer.height - rightVerticalHalf,
        width: rightContainer.width,
        height: rightVerticalHalf,
      },
      label: 'Right Bottom',
    },
    {
      area: 'bottom-left',
      rect: { x: bottomContainer.x, y: bottomContainer.y, width: horizontalHalf, height: bottomContainer.height },
      label: 'Bottom Left',
    },
    {
      area: 'bottom-right',
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
