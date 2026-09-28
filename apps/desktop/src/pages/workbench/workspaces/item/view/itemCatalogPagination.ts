import { useLayoutEffect, useRef, useState } from 'react'
import type { ItemWorkspaceEntry } from '@entities/item'

export type PaginationToken =
  | {
      type: 'page'
      value: number
    }
  | {
      type: 'ellipsis'
      key: string
    }

const CATALOG_GRID_GAP_PX = 12
const CATALOG_GRID_MIN_TILE_WIDTH_PX = 112
const CATALOG_GRID_TILE_ASPECT_RATIO = 1 / 1.05
const CATALOG_GRID_WRAPPER_PADDING_PX = 0

const CATALOG_LIST_ROW_HEIGHT_PX = 56
const CATALOG_LIST_ROW_GAP_PX = 6
const CATALOG_LIST_WRAPPER_PADDING_PX = 8
const CATALOG_LIST_MIN_ROWS = 6

function getMaxFittingRows(height: number, itemHeight: number, gap: number, wrapperPadding: number) {
  if (height <= 0 || itemHeight <= 0) {
    return 0
  }

  return Math.max(0, Math.floor((height - wrapperPadding + gap + 2) / (itemHeight + gap)))
}

function getPageCount(totalItems: number, itemsPerPage: number) {
  return Math.max(1, Math.ceil(totalItems / itemsPerPage))
}

function clampPage(page: number, totalItems: number, itemsPerPage: number) {
  return Math.min(getPageCount(totalItems, itemsPerPage), Math.max(1, page))
}

export function paginateItems<T>(items: T[], currentPage: number, itemsPerPage: number) {
  const safePage = clampPage(currentPage, items.length, itemsPerPage)
  const startIndex = (safePage - 1) * itemsPerPage
  return {
    items: items.slice(startIndex, startIndex + itemsPerPage),
    currentPage: safePage,
    pageCount: getPageCount(items.length, itemsPerPage),
    startIndex,
  }
}

function computeGridPageSize(width: number, height: number) {
  const columns = Math.max(
    3,
    Math.min(8, Math.floor((width + CATALOG_GRID_GAP_PX) / (CATALOG_GRID_MIN_TILE_WIDTH_PX + CATALOG_GRID_GAP_PX))),
  )
  const cellWidth = (width - (columns - 1) * CATALOG_GRID_GAP_PX) / columns
  const tileHeight = cellWidth / CATALOG_GRID_TILE_ASPECT_RATIO
  const rows = Math.max(1, getMaxFittingRows(height, tileHeight, CATALOG_GRID_GAP_PX, CATALOG_GRID_WRAPPER_PADDING_PX))
  return columns * rows
}

function computeListPageSize(_width: number, height: number) {
  const rows = Math.max(1, getMaxFittingRows(height, CATALOG_LIST_ROW_HEIGHT_PX, CATALOG_LIST_ROW_GAP_PX, CATALOG_LIST_WRAPPER_PADDING_PX))
  return rows
}

export function computeCatalogPageSize(viewMode: 'list' | 'grid', width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return viewMode === 'grid' ? 12 : CATALOG_LIST_MIN_ROWS
  }

  return viewMode === 'grid' ? computeGridPageSize(width, height) : computeListPageSize(width, height)
}

function computeGridPageSizeFromElement(width: number, height: number, item: HTMLElement) {
  const rect = item.getBoundingClientRect()
  const columns = Math.max(3, Math.min(8, Math.floor((width + CATALOG_GRID_GAP_PX) / (rect.width + CATALOG_GRID_GAP_PX))))
  const rows = Math.max(1, getMaxFittingRows(height, rect.height, CATALOG_GRID_GAP_PX, CATALOG_GRID_WRAPPER_PADDING_PX))
  return columns * rows
}

function computeListPageSizeFromElement(_width: number, height: number, item: HTMLElement) {
  const rect = item.getBoundingClientRect()
  const rows = Math.max(1, getMaxFittingRows(height, rect.height, CATALOG_LIST_ROW_GAP_PX, CATALOG_LIST_WRAPPER_PADDING_PX))
  return rows
}

function computeCatalogPageSizeFromElement(viewMode: 'list' | 'grid', width: number, height: number, item: HTMLElement) {
  return viewMode === 'grid' ? computeGridPageSizeFromElement(width, height, item) : computeListPageSizeFromElement(width, height, item)
}

export function useCatalogPageSize(
  viewMode: 'list' | 'grid',
  itemsPerPage: number,
  itemsLength: number,
  onItemsPerPageChange: (itemsPerPage: number) => void,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [measuredPageSize, setMeasuredPageSize] = useState(itemsPerPage)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    let frameId = 0

    const measure = () => {
      frameId = 0
      const item = viewport.querySelector<HTMLElement>('[data-catalog-item]')
      const width = viewport.clientWidth
      const height = viewport.clientHeight
      const nextPageSize =
        width > 0 && height > 0 && item
          ? computeCatalogPageSizeFromElement(viewMode, width, height, item)
          : computeCatalogPageSize(viewMode, width, height)

      setMeasuredPageSize((current) => {
        if (current === nextPageSize) {
          return current
        }
        return nextPageSize
      })

      if (nextPageSize !== itemsPerPage) {
        onItemsPerPageChange(nextPageSize)
      }
    }

    const scheduleMeasure = () => {
      if (frameId) {
        return
      }
      frameId = window.requestAnimationFrame(measure)
    }

    scheduleMeasure()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            scheduleMeasure()
          })
    resizeObserver?.observe(viewport)

    const handleWindowResize = () => {
      scheduleMeasure()
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('resize', handleWindowResize)
      resizeObserver?.disconnect()
    }
  }, [viewMode, itemsPerPage, itemsLength, onItemsPerPageChange])

  return {
    viewportRef,
    measuredPageSize,
  }
}

export function buildPaginationTokens(currentPage: number, pageCount: number): PaginationToken[] {
  if (pageCount <= 1) {
    return [{ type: 'page', value: 1 }]
  }

  const pages = new Set<number>([1, pageCount, currentPage - 1, currentPage, currentPage + 1])
  if (currentPage <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (currentPage >= pageCount - 2) {
    pages.add(pageCount - 1)
    pages.add(pageCount - 2)
    pages.add(pageCount - 3)
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right)

  const tokens: PaginationToken[] = []
  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1]
    if (previousPage != null && page - previousPage > 1) {
      tokens.push({ type: 'ellipsis', key: `ellipsis:${previousPage}-${page}` })
    }

    tokens.push({ type: 'page', value: page })
  })

  return tokens
}

function buildSearchPriorityScore(entry: ItemWorkspaceEntry, tokens: string[]) {
  if (!tokens.length) {
    return 0
  }

  const displayName = entry.displayName.toLowerCase()
  const qualifiedItemId = entry.qualifiedItemId.toLowerCase()
  const internalName = entry.internalName.toLowerCase()
  const description = entry.description?.toLowerCase() ?? ''

  return tokens.reduce((score, token) => {
    if (token.startsWith('@')) {
      const needle = token.slice(1)
      if (!needle) {
        return score
      }
      if (qualifiedItemId === needle || entry.itemId.toLowerCase() === needle) {
        return score
      }
      if (qualifiedItemId.startsWith(needle) || entry.itemId.toLowerCase().startsWith(needle)) {
        return score + 1
      }
      if (qualifiedItemId.includes(needle) || entry.itemId.toLowerCase().includes(needle)) {
        return score + 2
      }
      return score + 4
    }

    if (displayName === token) {
      return score
    }
    if (displayName.startsWith(token)) {
      return score + 1
    }
    if (displayName.includes(token)) {
      return score + 2
    }
    if (qualifiedItemId.includes(token)) {
      return score + 3
    }
    if (internalName.includes(token)) {
      return score + 4
    }
    if (description.includes(token)) {
      return score + 5
    }
    return score + 6
  }, 0)
}

export function sortItemsBySearchPriority(items: ItemWorkspaceEntry[], rawFilter: string) {
  const tokens = rawFilter.trim().toLowerCase().split(/\s+/u).filter(Boolean)

  if (!tokens.length) {
    return items
  }

  return [...items].sort((left, right) => {
    const scoreDiff = buildSearchPriorityScore(left, tokens) - buildSearchPriorityScore(right, tokens)
    if (scoreDiff !== 0) {
      return scoreDiff
    }

    const displayCompare = left.displayName.localeCompare(right.displayName, undefined, { numeric: true, sensitivity: 'base' })
    if (displayCompare !== 0) {
      return displayCompare
    }

    return left.qualifiedItemId.localeCompare(right.qualifiedItemId, undefined, { numeric: true, sensitivity: 'base' })
  })
}
