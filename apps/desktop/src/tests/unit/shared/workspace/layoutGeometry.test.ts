import { describe, expect, it } from 'vite-plus/test'
import { getDockGuideRects, getWorkspaceGeometry } from '@shared/workspace/layoutGeometry'
import { buildDefaultSnapshot } from '@shared/workspace/layoutState'
import { ROOT_PADDING, TOOL_WINDOW_RAIL_GAP, TOOL_WINDOW_RAIL_WIDTH } from '@shared/workspace/layoutConstants'
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
      minWidth: 520,
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
    const expectedLeftX = ROOT_PADDING + TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_RAIL_GAP
    expect(leftTop.rect.x).toBe(expectedLeftX)
    expect(leftTop.rect.width).toBeGreaterThan(0)
    expect(leftTop.rect.height).toBeGreaterThan(0)
  })

  it('builds geometry with rails when side panels are docked', () => {
    const panels = buildPanels()
    const snapshot = buildDefaultSnapshot(panels)
    const state: WorkspaceStoredState = { ...snapshot, presets: {} }
    const panelMap = Object.fromEntries(panels.map((panel) => [panel.id, panel]))
    const size: WorkspaceSize = { width: 1200, height: 800 }

    const geometry = getWorkspaceGeometry(panels, panelMap, state, size, {})

    expect(geometry.rails.left).not.toBeNull()
    expect(geometry.rails.right).not.toBeNull()
    expect(geometry.dockedRects.viewport).toEqual(geometry.centerRect)
  })
})
