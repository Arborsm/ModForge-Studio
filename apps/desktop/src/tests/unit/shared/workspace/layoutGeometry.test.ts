import { describe, expect, it } from 'vite-plus/test'
import { getWorkspaceGeometry } from '@shared/workspace/layoutGeometry'
import { buildDefaultLayoutState } from '@shared/workspace/layoutState'
import { COLUMN_GAP, RESIZER_THICKNESS, ROOT_PADDING } from '@shared/workspace/layoutConstants'
import type { WorkspacePanelConfig, WorkspaceSize } from '@shared/contracts'

function buildPanels(): WorkspacePanelConfig[] {
  return [
    { id: 'assets', area: 'left', title: 'Assets', subtitle: '', content: null, minWidth: 220, minHeight: 200 },
    { id: 'viewport', area: 'center', title: 'Viewport', subtitle: '', content: null, minWidth: 360, minHeight: 200 },
    { id: 'inspector', area: 'right', title: 'Inspector', subtitle: '', content: null, minWidth: 260, minHeight: 200 },
  ]
}

describe('layoutGeometry', () => {
  it('places fixed left, center, and right areas without dock rails', () => {
    const panels = buildPanels()
    const size: WorkspaceSize = { width: 1200, height: 800 }
    const geometry = getWorkspaceGeometry(panels, buildDefaultLayoutState(panels), size)

    expect(geometry.areaRects.left).not.toBeNull()
    expect(geometry.areaRects.center).toEqual(geometry.centerRect)
    expect(geometry.areaRects.right).not.toBeNull()
    expect(geometry.panelRects.viewport).toEqual(geometry.centerRect)
    expect(geometry.panelRects.assets).toEqual(geometry.areaRects.left)
    expect(geometry.panelRects.inspector).toEqual(geometry.areaRects.right)
  })

  it('keeps flush geometry and hairline edge resizers between the fixed areas', () => {
    expect(ROOT_PADDING).toBe(0)
    expect(COLUMN_GAP).toBe(5)
    expect(RESIZER_THICKNESS).toBe(5)

    const panels = buildPanels()
    const geometry = getWorkspaceGeometry(panels, buildDefaultLayoutState(panels), { width: 1680, height: 960 })
    const left = geometry.areaRects.left!
    const right = geometry.areaRects.right!
    const leftResizer = geometry.edgeResizers.left!
    const rightResizer = geometry.edgeResizers.right!

    expect(left.y).toBe(0)
    expect(right.y).toBe(0)
    expect(leftResizer.y).toBe(left.y)
    expect(leftResizer.height).toBe(left.height)
    expect(leftResizer.width).toBe(RESIZER_THICKNESS)
    expect(rightResizer.y).toBe(right.y)
    expect(rightResizer.height).toBe(right.height)
    expect(rightResizer.width).toBe(RESIZER_THICKNESS)
    expect(leftResizer.x + leftResizer.width / 2).toBeCloseTo(left.x + left.width + COLUMN_GAP / 2, 5)
    expect(rightResizer.x + rightResizer.width / 2).toBeCloseTo(right.x - COLUMN_GAP / 2, 5)
  })

  it('creates only the necessary bottom edge and bottom split resizers', () => {
    const panels: WorkspacePanelConfig[] = [
      ...buildPanels(),
      { id: 'timeline', area: 'bottom', title: 'Timeline', subtitle: '', content: null, minWidth: 220, minHeight: 180 },
      { id: 'summary', area: 'bottom', title: 'Summary', subtitle: '', content: null, minWidth: 220, minHeight: 180 },
    ]
    const geometry = getWorkspaceGeometry(panels, buildDefaultLayoutState(panels), { width: 1680, height: 960 })

    expect(geometry.edgeResizers.bottom).not.toBeNull()
    expect(geometry.splitResizers.bottom).not.toBeNull()
    expect(geometry.panelRects.timeline.width).toBeGreaterThan(0)
    expect(geometry.panelRects.summary.width).toBeGreaterThan(0)
  })
})
