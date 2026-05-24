import type { LauncherLibraryDisplayItem } from '../model/launcherLibraryDisplay'

export const LAUNCHER_LIBRARY_GRID_GAP_PX = 20
export const LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX = 260
export const LAUNCHER_LIBRARY_CARD_FALLBACK_ESTIMATED_HEIGHT_PX = 260
export const LAUNCHER_LIBRARY_CARD_HORIZONTAL_PADDING_PX = 14
export const LAUNCHER_LIBRARY_CARD_COPY_HEIGHT_PX = 52
export const LAUNCHER_LIBRARY_CARD_COVER_ASPECT_RATIO = 96 / 55
export const LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT = 3
export const LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX = 18

export function estimateLauncherLibraryCardHeight(cardWidth: number) {
  if (!Number.isFinite(cardWidth) || cardWidth <= 0) {
    return LAUNCHER_LIBRARY_CARD_FALLBACK_ESTIMATED_HEIGHT_PX
  }

  const contentWidth = Math.max(0, cardWidth - LAUNCHER_LIBRARY_CARD_HORIZONTAL_PADDING_PX * 2)
  const coverHeight = contentWidth / LAUNCHER_LIBRARY_CARD_COVER_ASPECT_RATIO
  return Math.ceil(LAUNCHER_LIBRARY_CARD_HORIZONTAL_PADDING_PX * 2 + coverHeight + LAUNCHER_LIBRARY_CARD_COPY_HEIGHT_PX)
}

export type LauncherLibraryGridRowItem = {
  displayItem: LauncherLibraryDisplayItem
  index: number
  columnSpan: number
  rowSpan: number
  columnStart: number
  rowStart: number
}

export type LauncherLibraryGridBlock = {
  items: LauncherLibraryGridRowItem[]
  rowStart: number
  rowCount: number
  estimatedHeight: number
}

type LauncherLibraryGridPlacement = {
  columnSpan: number
  rowSpan: number
}

function getLauncherLibraryFolderPlacement(itemCount: number, gridColumnCount: number): LauncherLibraryGridPlacement {
  if (gridColumnCount <= 1) {
    return { columnSpan: 1, rowSpan: Math.max(1, itemCount) }
  }

  const contentSize = Math.max(1, itemCount)
  const preferredSpan = Math.max(2, Math.ceil(Math.sqrt(contentSize)))
  const columnSpan = Math.min(gridColumnCount, preferredSpan)
  return { columnSpan, rowSpan: Math.max(1, Math.ceil(contentSize / columnSpan)) }
}

function canPlaceLauncherLibraryGridItem(
  occupiedRows: boolean[][],
  rowIndex: number,
  columnIndex: number,
  columnSpan: number,
  rowSpan: number,
) {
  for (let nextRowIndex = rowIndex; nextRowIndex < rowIndex + rowSpan; nextRowIndex += 1) {
    const occupiedColumns = occupiedRows[nextRowIndex] ?? []
    for (let nextColumnIndex = columnIndex; nextColumnIndex < columnIndex + columnSpan; nextColumnIndex += 1) {
      if (occupiedColumns[nextColumnIndex]) {
        return false
      }
    }
  }
  return true
}

export function buildLauncherLibraryGridBlocks(
  items: LauncherLibraryDisplayItem[],
  gridColumnCount: number,
  isLibraryFolderOpen: (folderId: string) => boolean,
  estimatedRowHeight: number,
) {
  const occupiedRows: boolean[][] = []
  const occupiedColumnCounts: number[] = []
  const placedItems: LauncherLibraryGridRowItem[] = []
  let firstOpenRow = 0
  items.forEach((displayItem, index) => {
    const isOpenFolder = displayItem.kind === 'folder' && isLibraryFolderOpen(displayItem.folder.id)
    const placement = isOpenFolder
      ? getLauncherLibraryFolderPlacement(displayItem.mods.length + displayItem.childFolders.length, gridColumnCount)
      : { columnSpan: 1, rowSpan: 1 }

    let rowStart = firstOpenRow
    let columnStart = 0
    let placed = false
    while (!placed) {
      for (let candidateColumn = 0; candidateColumn <= gridColumnCount - placement.columnSpan; candidateColumn += 1) {
        if (canPlaceLauncherLibraryGridItem(occupiedRows, rowStart, candidateColumn, placement.columnSpan, placement.rowSpan)) {
          columnStart = candidateColumn
          placed = true
          break
        }
      }
      if (!placed) {
        rowStart += 1
      }
    }

    for (let rowIndex = rowStart; rowIndex < rowStart + placement.rowSpan; rowIndex += 1) {
      occupiedRows[rowIndex] ??= []
      for (let columnIndex = columnStart; columnIndex < columnStart + placement.columnSpan; columnIndex += 1) {
        if (!occupiedRows[rowIndex]![columnIndex]) {
          occupiedRows[rowIndex]![columnIndex] = true
          occupiedColumnCounts[rowIndex] = (occupiedColumnCounts[rowIndex] ?? 0) + 1
        }
      }
    }
    while ((occupiedColumnCounts[firstOpenRow] ?? 0) >= gridColumnCount) {
      firstOpenRow += 1
    }

    placedItems.push({
      displayItem,
      index,
      columnSpan: placement.columnSpan,
      rowSpan: placement.rowSpan,
      columnStart,
      rowStart,
    })
  })

  const blockCount = Math.max(1, Math.ceil(occupiedRows.length / LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT))
  return Array.from({ length: blockCount }, (_, blockIndex): LauncherLibraryGridBlock => {
    const rowStart = blockIndex * LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT
    const rowEnd = rowStart + LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT
    const blockItems = placedItems.filter((item) => item.rowStart < rowEnd && item.rowStart + item.rowSpan > rowStart)
    const occupiedBlockRowCount = Math.max(0, ...blockItems.map((item) => item.rowStart + item.rowSpan - rowStart))
    const rowCount = Math.max(
      1,
      Math.min(LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT, Math.max(0, occupiedRows.length - rowStart), occupiedBlockRowCount),
    )
    return {
      items: blockItems,
      rowStart,
      rowCount,
      estimatedHeight: rowCount * estimatedRowHeight + Math.max(0, rowCount - 1) * LAUNCHER_LIBRARY_GRID_GAP_PX,
    }
  }).filter((block) => block.items.length > 0)
}
