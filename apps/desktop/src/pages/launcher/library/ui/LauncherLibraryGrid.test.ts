import { describe, expect, it } from 'vite-plus/test'
import { doesLauncherLibrarySelectionIntersect, type LauncherLibrarySelectionBox } from './LauncherLibraryGrid'

describe('LauncherLibraryGrid selection geometry', () => {
  it('selects a card when the drag box overlaps any visible portion of the card', () => {
    const box: LauncherLibrarySelectionBox = { left: 90, top: 90, width: 70, height: 70 }

    expect(
      doesLauncherLibrarySelectionIntersect(box, {
        left: 150,
        top: 150,
        width: 220,
        height: 180,
      }),
    ).toBe(true)
  })

  it('does not select a card when the drag box is near it but not intersecting it', () => {
    const box: LauncherLibrarySelectionBox = { left: 90, top: 90, width: 50, height: 50 }

    expect(
      doesLauncherLibrarySelectionIntersect(box, {
        left: 150,
        top: 150,
        width: 220,
        height: 180,
      }),
    ).toBe(false)
  })

  it('keeps already viewport-based package coordinates aligned after the grid scrolls', () => {
    const scrolledViewportBox: LauncherLibrarySelectionBox = { left: 280, top: 135, width: 240, height: 200 }

    expect(
      doesLauncherLibrarySelectionIntersect(scrolledViewportBox, {
        left: 300,
        top: 160,
        width: 220,
        height: 180,
      }),
    ).toBe(true)
  })

  it('handles a drag box normalized from a bottom-right to top-left pointer path', () => {
    const reverseDragBox: LauncherLibrarySelectionBox = { left: 140, top: 110, width: 260, height: 230 }

    expect(
      doesLauncherLibrarySelectionIntersect(reverseDragBox, {
        left: 180,
        top: 180,
        width: 220,
        height: 180,
      }),
    ).toBe(true)
  })
})
