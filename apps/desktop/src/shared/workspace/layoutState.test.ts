import { describe, expect, it } from 'vitest'
import { movePanelInOrder, normalizeChrome, sanitizeStoredState } from '@shared/workspace/layoutState'
import { getHorizontalUsableWidth, getResolvedSidePanelWidths } from '@shared/workspace/layoutSizing'
import type { WorkspacePanelConfig, WorkspaceSize } from '@shared/contracts'

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

  it('keeps center workspace panels docked and visible when sanitizing persisted state', () => {
    const panels: WorkspacePanelConfig[] = [
      {
        id: 'viewport',
        title: 'Viewport',
        subtitle: '',
        content: null,
        minWidth: 320,
        minHeight: 240,
        defaultDock: 'center',
      },
    ]

    const state = sanitizeStoredState(
      {
        panels: {
          viewport: {
            mode: 'hidden',
            lastMode: 'docked',
            dock: 'right-top',
            x: 12,
            y: 24,
            width: 640,
            height: 480,
            zIndex: 1,
          },
        },
      },
      panels,
    )

    expect(state.panels.viewport.mode).toBe('docked')
    expect(state.panels.viewport.lastMode).toBe('docked')
    expect(state.panels.viewport.dock).toBe('center')
    expect(state.slots['right-top'].panelOrder).toEqual([])
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
