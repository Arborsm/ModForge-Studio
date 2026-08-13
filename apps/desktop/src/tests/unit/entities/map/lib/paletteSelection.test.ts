import { describe, expect, it } from 'vite-plus/test'

import {
  cellFromGridPointer,
  cellFromSheetPointer,
  normalizeSelectionRect,
  pushRecentSelection,
  rememberTilesetSelection,
  selectionRectForSelection,
  tileIndexInSelection,
  tilesetSelectionFromRect,
} from '@entities/map/lib/paletteSelection'
import { PALETTE_RECENT_LIMIT, type PaletteRecentSelection } from '@shared/lib/app-state'

describe('palette selection geometry', () => {
  it('normalizes reverse drags so the start corner is the top-left', () => {
    expect(normalizeSelectionRect({ startColumn: 8, startRow: 6, endColumn: 5, endRow: 2 })).toEqual({
      left: 5,
      top: 2,
      right: 8,
      bottom: 6,
    })
  })

  it('keeps a single-cell drag as a one-cell rectangle', () => {
    expect(normalizeSelectionRect({ startColumn: 3, startRow: 4, endColumn: 3, endRow: 4 })).toEqual({
      left: 3,
      top: 4,
      right: 3,
      bottom: 4,
    })
  })

  it('converts a tileset selection index into its rectangle', () => {
    expect(selectionRectForSelection({ startIndex: 18, width: 2, height: 3 }, 8)).toEqual({
      startColumn: 2,
      startRow: 2,
      endColumn: 3,
      endRow: 4,
    })
  })

  it('commits a bounded stamp selection and clips rows past the last tile row', () => {
    expect(tilesetSelectionFromRect({ startColumn: 2, startRow: 1, endColumn: 4, endRow: 3 }, 8, 32)).toEqual({
      startIndex: 10,
      width: 3,
      height: 3,
    })
    expect(tilesetSelectionFromRect({ startColumn: 0, startRow: 2, endColumn: 2, endRow: 7 }, 8, 32)).toEqual({
      startIndex: 16,
      width: 3,
      height: 2,
    })
  })

  it('keeps a reversed drag rectangle selection inside the tileset', () => {
    expect(tilesetSelectionFromRect({ startColumn: 7, startRow: 3, endColumn: 0, endRow: 1 }, 8, 32)).toEqual({
      startIndex: 8,
      width: 8,
      height: 3,
    })
  })

  it('reports tile membership inside a normalized selection rectangle', () => {
    const rect = normalizeSelectionRect(selectionRectForSelection({ startIndex: 18, width: 2, height: 2 }, 8))
    expect(tileIndexInSelection(18, rect, 8)).toBe(true)
    expect(tileIndexInSelection(19, rect, 8)).toBe(true)
    expect(tileIndexInSelection(26, rect, 8)).toBe(true)
    expect(tileIndexInSelection(20, rect, 8)).toBe(false)
    expect(tileIndexInSelection(17, rect, 8)).toBe(false)
    expect(tileIndexInSelection(9, rect, 8)).toBe(false)
  })
})

describe('palette pointer mapping', () => {
  const gridOptions = {
    originX: 100,
    originY: 50,
    cellWidth: 32,
    cellHeight: 40,
    gap: 4,
    columns: 12,
    rows: 5,
  }

  it('maps a grid pointer to the cell under the cursor', () => {
    expect(cellFromGridPointer({ x: 100, y: 50, ...gridOptions })).toEqual({ column: 0, row: 0 })
    expect(cellFromGridPointer({ x: 100 + 32 + 4 + 10, y: 50, ...gridOptions })).toEqual({ column: 1, row: 0 })
    expect(cellFromGridPointer({ x: 100, y: 50 + 40 + 4 + 10, ...gridOptions })).toEqual({ column: 0, row: 1 })
  })

  it('clamps grid pointers outside the tileset', () => {
    expect(cellFromGridPointer({ x: -40, y: -30, ...gridOptions })).toEqual({ column: 0, row: 0 })
    expect(cellFromGridPointer({ x: 9999, y: 9999, ...gridOptions })).toEqual({ column: 11, row: 4 })
  })

  it('maps a sheet pointer proportionally to the tileset cell grid', () => {
    expect(
      cellFromSheetPointer({
        x: 130,
        y: 60,
        originX: 100,
        originY: 50,
        width: 400,
        height: 250,
        columns: 8,
        rows: 5,
      }),
    ).toEqual({ column: 0, row: 0 })
    expect(
      cellFromSheetPointer({
        x: 100 + 400 * 0.55,
        y: 50 + 250 * 0.55,
        originX: 100,
        originY: 50,
        width: 400,
        height: 250,
        columns: 8,
        rows: 5,
      }),
    ).toEqual({ column: 4, row: 2 })
  })
})

describe('palette recents and remembered selections', () => {
  const entryA: PaletteRecentSelection = { tilesetName: 'town', startIndex: 10, width: 2, height: 3 }
  const entryB: PaletteRecentSelection = { tilesetName: 'spring', startIndex: 4, width: 1, height: 1 }
  const entryC: PaletteRecentSelection = { tilesetName: 'farm', startIndex: 7, width: 2, height: 1 }

  it('pushes the newest entry to the front and drops the oldest beyond the limit', () => {
    const recents = pushRecentSelection([entryA, entryB, entryC], { tilesetName: 'winter', startIndex: 1, width: 1, height: 1 })
    expect(recents).toHaveLength(4)
    expect(recents[0]!.tilesetName).toBe('winter')
    expect(recents[3]).toBe(entryC)
  })

  it('de-duplicates an identical entry instead of pushing a copy', () => {
    const recents = pushRecentSelection([entryA, entryB], entryA)
    expect(recents).toHaveLength(2)
    expect(recents[0]).toBe(entryA)
  })

  it('caps the queue at the palette recent limit', () => {
    const many = Array.from({ length: PALETTE_RECENT_LIMIT + 3 }, (_, index) => ({
      tilesetName: `sheet${index}`,
      startIndex: index,
      width: 1,
      height: 1,
    }))
    expect(pushRecentSelection(many, entryA)).toHaveLength(PALETTE_RECENT_LIMIT)
    expect(pushRecentSelection(many, entryA)[0]).toBe(entryA)
  })

  it('merges a selection into the per-tileset remembered map', () => {
    const remembered = rememberTilesetSelection({ town: { startIndex: 3, width: 1, height: 1 } }, 'town', {
      startIndex: 18,
      width: 2,
      height: 2,
    })
    expect(remembered).toEqual({
      town: { startIndex: 18, width: 2, height: 2 },
    })
  })

  it('keeps other tileset memories when merging a new one', () => {
    const remembered = rememberTilesetSelection({ town: { startIndex: 3, width: 1, height: 1 } }, 'spring', {
      startIndex: 9,
      width: 1,
      height: 1,
    })
    expect(remembered).toEqual({
      town: { startIndex: 3, width: 1, height: 1 },
      spring: { startIndex: 9, width: 1, height: 1 },
    })
  })
})
