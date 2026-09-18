import { describe, expect, it } from 'vite-plus/test'
import type { LauncherLibraryItem, LauncherVirtualFolder } from '@features/launcher/model/types'
import type { LauncherLibraryDisplayItem } from '@pages/launcher/library/model/launcherLibraryDisplay'
import {
  buildLauncherLibraryGridBlocks,
  estimateLauncherLibraryCardHeight,
  getLauncherLibraryCardMinWidthPx,
  getLauncherLibraryPanelPlacement,
  LAUNCHER_LIBRARY_CARD_COPY_HEIGHT_PX,
  LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX,
  LAUNCHER_LIBRARY_CARD_PHONE_MIN_WIDTH_PX,
  LAUNCHER_LIBRARY_FEED_ROW_ESTIMATED_HEIGHT_PX,
  LAUNCHER_LIBRARY_GRID_GAP_PX,
} from '@pages/launcher/library/ui/launcherLibraryGridLayout'

function mod(id: string): LauncherLibraryItem {
  return {
    id,
    labelKey: id,
    name: id,
    author: null,
    version: null,
    description: null,
    uniqueId: id,
    folderName: id,
    absolutePath: `E:\\Mods\\${id}`,
    enabled: true,
    hasConfig: true,
    nexusModId: null,
    updateKeys: [],
    modUrl: null,
    imageUrl: null,
    dependencies: [],
    requiredDependencies: [],
    missingRequiredDependencies: [],
    minimumApiVersion: null,
    requiresNewerSmapi: false,
  }
}

function folder(id: string, modCount: number): LauncherLibraryDisplayItem {
  const mods = Array.from({ length: modCount }, (_, index) => mod(`${id}-mod-${index}`))
  const virtualFolder: LauncherVirtualFolder = {
    id,
    name: id,
    packId: null,
    hidden: false,
    parentFolderId: null,
    modKeys: mods.map((item) => item.uniqueId).filter((value): value is string => Boolean(value)),
    coverModKeys: [],
  }
  return { kind: 'folder', folder: virtualFolder, mods, childFolders: [] }
}

describe('launcherLibraryGridLayout', () => {
  it('keeps balanced panel placement as the default for floating module panels', () => {
    expect(getLauncherLibraryPanelPlacement(20, 8)).toEqual({ columnSpan: 5, rowSpan: 4 })
  })

  it('prefers a square placement for opened library folders', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 20)], 8, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 5,
      rowSpan: 4,
      columnStart: 0,
      rowStart: 0,
    })
  })

  it('collapses opened folders into the current small-window column count', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 20)], 4, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 4,
      rowSpan: 5,
    })
  })

  it('falls back to one long column when the viewport only fits one card', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 6)], 1, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 1,
      rowSpan: 6,
    })
  })

  it('does not add artificial chrome height to opened folder block estimates', () => {
    const rowHeight = 260
    const [block] = buildLauncherLibraryGridBlocks(
      [
        folder('large-folder', 20),
        ...Array.from(
          { length: 16 },
          (_, index): LauncherLibraryDisplayItem => ({ kind: 'mod', mod: mod(`mod-${index}`), childMods: [], isChild: false }),
        ),
      ],
      4,
      (folderId) => folderId === 'large-folder',
      rowHeight,
    )

    expect(block?.items[0]).toMatchObject({
      columnSpan: 4,
      rowSpan: 5,
      rowStart: 0,
    })
    expect(block?.estimatedHeight).toBe(5 * rowHeight + 4 * LAUNCHER_LIBRARY_GRID_GAP_PX)
  })

  it('keeps later rows in the same virtual block when an opened folder creates a tall packed region', () => {
    const rowHeight = 260
    const blocks = buildLauncherLibraryGridBlocks(
      [
        ...Array.from(
          { length: 11 },
          (_, index): LauncherLibraryDisplayItem => ({ kind: 'mod', mod: mod(`leading-mod-${index}`), childMods: [], isChild: false }),
        ),
        folder('large-folder', 20),
        ...Array.from(
          { length: 20 },
          (_, index): LauncherLibraryDisplayItem => ({ kind: 'mod', mod: mod(`mod-${index}`), childMods: [], isChild: false }),
        ),
      ],
      7,
      (folderId) => folderId === 'large-folder',
      rowHeight,
    )

    expect(blocks[0]?.items.find((item) => item.displayItem.kind === 'folder')).toMatchObject({
      columnSpan: 5,
      rowSpan: 4,
      columnStart: 0,
      rowStart: 2,
    })
    expect(blocks[0]?.items.some((item) => item.rowStart >= 3 && item.rowStart <= 4)).toBe(true)
  })

  it('uses the same estimated row height for opened folder content and the surrounding virtual grid', () => {
    const rowHeight = 260
    const blocks = buildLauncherLibraryGridBlocks(
      [
        folder('visual-folder', 8),
        ...Array.from(
          { length: 6 },
          (_, index): LauncherLibraryDisplayItem => ({ kind: 'mod', mod: mod(`mod-${index}`), childMods: [], isChild: false }),
        ),
      ],
      4,
      (folderId) => folderId === 'visual-folder',
      rowHeight,
    )

    const firstBlock = blocks[0]
    expect(firstBlock?.rowCount).toBeGreaterThan(0)
    expect(firstBlock?.estimatedHeight).toBe(
      firstBlock?.rowCount ? firstBlock.rowCount * rowHeight + (firstBlock.rowCount - 1) * LAUNCHER_LIBRARY_GRID_GAP_PX : 0,
    )
  })

  it('collapses a closing folder back to a 1x1 card even though isLibraryFolderOpen still returns true', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks(
        [folder('closing-folder', 20)],
        8,
        () => true,
        260,
        (folderId) => folderId === 'closing-folder',
      )[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 1,
      rowSpan: 1,
    })
  })

  it('keeps a non-closing open folder at its balanced panel placement when another folder is closing', () => {
    const blocks = buildLauncherLibraryGridBlocks(
      [folder('open-folder', 20), folder('closing-folder', 20)],
      8,
      (folderId) => folderId === 'open-folder' || folderId === 'closing-folder',
      260,
      (folderId) => folderId === 'closing-folder',
    )
    const items = blocks[0]?.items ?? []
    const openPlaced = items.find((item) => item.displayItem.kind === 'folder' && item.displayItem.folder.id === 'open-folder')
    const closingPlaced = items.find((item) => item.displayItem.kind === 'folder' && item.displayItem.folder.id === 'closing-folder')

    expect(openPlaced).toMatchObject({ columnSpan: 5, rowSpan: 4 })
    expect(closingPlaced).toMatchObject({ columnSpan: 1, rowSpan: 1 })
  })

  it('keeps the phone viewport on a single feed column and desktop sizes multi-column', () => {
    expect(getLauncherLibraryCardMinWidthPx(412)).toBe(LAUNCHER_LIBRARY_CARD_PHONE_MIN_WIDTH_PX)
    expect(getLauncherLibraryCardMinWidthPx(480)).toBe(LAUNCHER_LIBRARY_CARD_PHONE_MIN_WIDTH_PX)
    expect(getLauncherLibraryCardMinWidthPx(481)).toBe(LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX)
    expect(getLauncherLibraryCardMinWidthPx(1200)).toBe(LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX)
    expect(getLauncherLibraryCardMinWidthPx(0)).toBe(LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX)
    // Phone min width equals the desktop minimum so the column math lands on
    // exactly one column for every phone-sized viewport.
    const singleColumnCount = Math.max(
      1,
      Math.floor((412 + LAUNCHER_LIBRARY_GRID_GAP_PX) / (LAUNCHER_LIBRARY_CARD_PHONE_MIN_WIDTH_PX + LAUNCHER_LIBRARY_GRID_GAP_PX)),
    )
    expect(singleColumnCount).toBe(1)
  })

  it('estimates single-column phone rows as fixed-height feed rows', () => {
    expect(estimateLauncherLibraryCardHeight(360, 16, 1)).toBe(LAUNCHER_LIBRARY_FEED_ROW_ESTIMATED_HEIGHT_PX)
    expect(estimateLauncherLibraryCardHeight(360, 20, 1)).toBe(Math.ceil(LAUNCHER_LIBRARY_FEED_ROW_ESTIMATED_HEIGHT_PX * 1.25))
    // Narrow single-column surfaces (tiny desktop windows) keep cover-based math.
    expect(estimateLauncherLibraryCardHeight(200, 16, 1)).toBe(estimateLauncherLibraryCardHeight(200, 16, 2))
  })

  it('estimates a shorter copy block for compact phone cards', () => {
    const phoneCardWidth = 180
    expect(estimateLauncherLibraryCardHeight(phoneCardWidth)).toBeLessThan(estimateLauncherLibraryCardHeight(260))
    // 180px card: 2 × 12px padding + cover at the 96/55 ratio + the 44px compact copy block.
    expect(estimateLauncherLibraryCardHeight(phoneCardWidth)).toBe(Math.ceil(24 + (phoneCardWidth - 24) / (96 / 55) + 44))
    expect(LAUNCHER_LIBRARY_CARD_COPY_HEIGHT_PX).toBe(54)
  })
})
