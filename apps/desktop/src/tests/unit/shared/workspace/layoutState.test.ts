import { describe, expect, it } from 'vite-plus/test'
import { getDefaultChrome, normalizeChrome, sanitizeStoredState } from '@shared/workspace/layoutState'
import { getHorizontalUsableWidth, getResolvedSidePanelWidths } from '@shared/workspace/layoutSizing'
import type { WorkspacePanelConfig, WorkspaceSize } from '@shared/contracts'

function panel(id: string, area: WorkspacePanelConfig['area'], minWidth = 200): WorkspacePanelConfig {
  return { id, area, title: id, subtitle: '', content: null, minWidth, minHeight: 200 }
}

describe('layoutState', () => {
  it('clamps the six split values without creating panel state', () => {
    const panels = [panel('item-browser/navigation', 'left')]
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
    expect(chrome.leftSplit).toBe(0.2)
    expect(chrome.rightSplit).toBe(0.8)
    expect(chrome.bottomSplit).toBe(0.8)
  })

  it('uses narrow side ratios for buildings and events', () => {
    for (const panels of [
      [
        panel('building-browser/browser', 'left'),
        panel('building-browser/preview', 'center', 360),
        panel('building-browser/details', 'right', 220),
      ],
      [panel('event-browser/browser', 'left'), panel('event-browser/stage', 'center', 480), panel('event-browser/detail', 'right', 220)],
    ]) {
      const chrome = getDefaultChrome(panels)
      expect(chrome.leftWidth).toBe(0.14)
      expect(chrome.rightWidth).toBe(0.16)
      expect(normalizeChrome(chrome, panels)).toEqual(chrome)
    }
  })

  it('discards the removed panel mode and preset shape when sanitizing stored state', () => {
    const panels = [panel('viewport', 'center', 320)]
    const state = sanitizeStoredState(
      {
        panels: { viewport: { mode: 'floating' } },
        presets: { legacy: { panels: {} } },
        chrome: { leftWidth: 0.3 },
      } as never,
      panels,
    )

    expect(state).toEqual({
      chrome: expect.objectContaining({ leftWidth: 0.3 }),
    })
    expect(state).not.toHaveProperty('panels')
    expect(state).not.toHaveProperty('presets')
  })
})

describe('layoutSizing', () => {
  it('resolves side panel widths that respect minimums and total width', () => {
    const panels = [panel('assets', 'left', 220), panel('viewport', 'center', 520), panel('inspector', 'right', 260)]
    const chrome = { leftWidth: 0.2, rightWidth: 0.2 }
    const size: WorkspaceSize = { width: 1200, height: 900 }
    const usable = getHorizontalUsableWidth(size, true, true)
    const widths = getResolvedSidePanelWidths(panels, chrome, size, true, true)

    expect(widths.left + widths.center + widths.right).toBe(usable)
    expect(widths.center).toBeGreaterThanOrEqual(520)
  })

  it('shrinks all columns proportionally when a narrow viewport cannot fit desktop minimums', () => {
    const panels = [panel('assets', 'left', 220), panel('viewport', 'center', 520), panel('inspector', 'right', 260)]
    const size: WorkspaceSize = { width: 390, height: 844 }
    const widths = getResolvedSidePanelWidths(panels, { leftWidth: 0.2, rightWidth: 0.2 }, size, true, true)

    expect(widths.left + widths.center + widths.right).toBe(getHorizontalUsableWidth(size, true, true))
    expect(widths.left).toBeGreaterThan(0)
    expect(widths.center).toBeGreaterThan(0)
    expect(widths.right).toBeGreaterThan(0)
  })
})
