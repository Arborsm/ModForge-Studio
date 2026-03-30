import { describe, expect, it } from 'vitest'
import { movePanelInOrder, normalizeChrome } from './layoutState'
import { getHorizontalUsableWidth, getResolvedSidePanelWidths } from './layoutSizing'
import type { WorkspacePanelConfig, WorkspaceSize } from './layoutTypes'

describe('layoutState', () => {
  it('moves a panel to the requested index without duplicates', () => {
    const initial = ['assets', 'viewport', 'inspector']
    const next = movePanelInOrder(initial, 'viewport', 0)

    expect(next).toEqual(['viewport', 'assets', 'inspector'])
  })

  it('clamps chrome widths based on items workspace bounds', () => {
    const panels: WorkspacePanelConfig[] = [
      {
        id: 'item-navigation',
        title: 'Items',
        subtitle: '',
        content: null,
        minWidth: 200,
        minHeight: 200,
      },
    ]

    const chrome = normalizeChrome(
      {
        leftWidth: 0.05,
        rightWidth: 0.9,
        bottomHeight: 120,
        leftSplit: 0.1,
        rightSplit: 0.95,
        bottomSplit: 0.95,
      },
      panels,
    )

    expect(chrome.leftWidth).toBeGreaterThanOrEqual(0.12)
    expect(chrome.rightWidth).toBeLessThanOrEqual(0.62)
    expect(chrome.bottomHeight).toBeGreaterThanOrEqual(180)
  })
})

describe('layoutSizing', () => {
  it('resolves side panel widths that respect minimums and total width', () => {
    const panels: WorkspacePanelConfig[] = [
      { id: 'assets', title: 'Assets', subtitle: '', content: null, minWidth: 220, minHeight: 200 },
      { id: 'viewport', title: 'Viewport', subtitle: '', content: null, minWidth: 520, minHeight: 200 },
      { id: 'inspector', title: 'Inspector', subtitle: '', content: null, minWidth: 260, minHeight: 200 },
    ]
    const chrome = { leftWidth: 0.2, rightWidth: 0.2, bottomHeight: 220, leftSplit: 0.4, rightSplit: 0.4, bottomSplit: 0.5 }
    const size: WorkspaceSize = { width: 1200, height: 900 }
    const usable = getHorizontalUsableWidth(size, false, false, true, true)

    const widths = getResolvedSidePanelWidths(
      panels,
      chrome,
      size,
      false,
      false,
      true,
      true,
    )

    expect(widths.left + widths.center + widths.right).toBe(usable)
    expect(widths.center).toBeGreaterThanOrEqual(520)
  })
})
