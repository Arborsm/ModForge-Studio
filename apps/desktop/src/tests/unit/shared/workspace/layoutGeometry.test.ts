import { describe, expect, it } from 'vite-plus/test'
import { getDockGuideRects, getWorkspaceGeometry } from '@shared/workspace/layoutGeometry'
import { buildDefaultSnapshot } from '@shared/workspace/layoutState'
import { COLUMN_GAP, RESIZER_THICKNESS, ROOT_PADDING } from '@shared/workspace/layoutConstants'
import type { WorkspacePanelConfig, WorkspaceSize, WorkspaceStoredState } from '@shared/contracts'

function buildPanels(): WorkspacePanelConfig[] {
  return [
    {
      id: 'assets',
      title: 'Assets',
      subtitle: '',
      content: null,
      minWidth: 220,
      minHeight: 200,
      defaultDock: 'left-top',
    },
    {
      id: 'viewport',
      title: 'Viewport',
      subtitle: '',
      content: null,
      minWidth: 360,
      minHeight: 200,
      defaultDock: 'center',
    },
    {
      id: 'inspector',
      title: 'Inspector',
      subtitle: '',
      content: null,
      minWidth: 260,
      minHeight: 200,
      defaultDock: 'right-top',
    },
  ]
}

describe('layoutGeometry', () => {
  it('creates dock guides with predictable fallback positioning', () => {
    const panels = buildPanels()
    const size: WorkspaceSize = { width: 1200, height: 800 }
    const geometry = {
      centerRect: { x: ROOT_PADDING, y: ROOT_PADDING, width: 600, height: 600 },
      rails: { left: null, right: null, bottom: null },
      railContainers: { left: null, right: null, bottom: null },
      dockedRects: {},
      splitResizers: {},
      edgeResizers: {},
    }

    const guides = getDockGuideRects(size, geometry, panels)

    expect(guides.map((guide) => guide.area)).toEqual([
      'left-top',
      'left-bottom',
      'right-top',
      'right-bottom',
      'bottom-left',
      'bottom-right',
    ])

    const leftTop = guides[0]
    expect(leftTop.rect.x).toBe(ROOT_PADDING)
    expect(leftTop.rect.width).toBeGreaterThan(0)
    expect(leftTop.rect.height).toBeGreaterThan(0)
  })

  it('builds geometry with side panels docked and no tool-window rails', () => {
    const panels = buildPanels()
    const snapshot = buildDefaultSnapshot(panels)
    const state: WorkspaceStoredState = { ...snapshot, presets: {} }
    const panelMap = Object.fromEntries(panels.map((panel) => [panel.id, panel]))
    const size: WorkspaceSize = { width: 1200, height: 800 }

    const geometry = getWorkspaceGeometry(panels, panelMap, state, size, {})

    expect(geometry.rails.left).toBeNull()
    expect(geometry.rails.right).toBeNull()
    expect(geometry.railContainers.left).not.toBeNull()
    expect(geometry.railContainers.right).not.toBeNull()
    expect(geometry.dockedRects.viewport).toEqual(geometry.centerRect)
  })

  it('uses flush root padding and full-height hairline edge resizers', () => {
    expect(ROOT_PADDING).toBe(0)
    expect(COLUMN_GAP).toBe(5)
    expect(RESIZER_THICKNESS).toBe(5)

    const panels = buildPanels()
    const snapshot = buildDefaultSnapshot(panels)
    const state: WorkspaceStoredState = { ...snapshot, presets: {} }
    const panelMap = Object.fromEntries(panels.map((panel) => [panel.id, panel]))
    const size: WorkspaceSize = { width: 1680, height: 960 }

    const geometry = getWorkspaceGeometry(panels, panelMap, state, size, {})
    const leftContainer = geometry.railContainers.left
    const rightContainer = geometry.railContainers.right
    const leftResizer = geometry.edgeResizers.left
    const rightResizer = geometry.edgeResizers.right

    expect(leftContainer).not.toBeNull()
    expect(rightContainer).not.toBeNull()
    expect(leftResizer).not.toBeNull()
    expect(rightResizer).not.toBeNull()
    expect(geometry.centerRect.y).toBe(0)
    expect(leftContainer!.y).toBe(0)
    expect(rightContainer!.y).toBe(0)
    expect(leftContainer!.x).toBe(0)

    expect(leftResizer!.y).toBe(leftContainer!.y)
    expect(leftResizer!.height).toBe(leftContainer!.height)
    expect(leftResizer!.width).toBe(RESIZER_THICKNESS)
    expect(rightResizer!.y).toBe(rightContainer!.y)
    expect(rightResizer!.height).toBe(rightContainer!.height)
    expect(rightResizer!.width).toBe(RESIZER_THICKNESS)

    const leftGapCenter = leftContainer!.x + leftContainer!.width + COLUMN_GAP / 2
    const rightGapCenter = rightContainer!.x - COLUMN_GAP / 2
    expect(leftResizer!.x + leftResizer!.width / 2).toBeCloseTo(leftGapCenter, 5)
    expect(rightResizer!.x + rightResizer!.width / 2).toBeCloseTo(rightGapCenter, 5)
  })
})
