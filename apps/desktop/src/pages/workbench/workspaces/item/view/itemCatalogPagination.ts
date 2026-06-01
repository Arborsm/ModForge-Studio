import { useEffect, useRef, useState } from 'react'
import type { ItemWorkspaceEntry } from '../entities/item'

export type PaginationToken =
  | {
      type: 'page'
      value: number
    }
  | {
      type: 'ellipsis'
      key: string
    }

export const CATALOG_GRID_GAP_PX = 8
export const CATALOG_GRID_MIN_ROWS = 2

const CATALOG_CARD_MIN_HEIGHT_PX = 118

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

function getCatalogColumnCount(width: number) {
  if (width >= 1536) {
    return 6
  }

  if (width >= 1280) {
    return 5
  }

  if (width >= 640) {
    return 4
  }

  return 3
}

function computeCatalogGridMetrics(width: number, height: number) {
  const columns = getCatalogColumnCount(width)
  const rows = Math.max(
    CATALOG_GRID_MIN_ROWS,
    Math.floor((height + CATALOG_GRID_GAP_PX) / (CATALOG_CARD_MIN_HEIGHT_PX + CATALOG_GRID_GAP_PX)),
  )

  return {
    columns,
    rows,
    itemsPerPage: Math.max(columns * rows, columns),
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

export function useCatalogGridMetrics(itemsPerPage: number, onItemsPerPageChange: (itemsPerPage: number) => void) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState(() => ({
    columns: 4,
    rows: Math.max(CATALOG_GRID_MIN_ROWS, Math.ceil(itemsPerPage / 4)),
  }))

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    let frameId = 0

    const measure = () => {
      frameId = 0
      const nextMetrics = computeCatalogGridMetrics(viewport.clientWidth, viewport.clientHeight)

      setMetrics((current) => {
        if (current.columns === nextMetrics.columns && current.rows === nextMetrics.rows) {
          return current
        }

        return {
          columns: nextMetrics.columns,
          rows: nextMetrics.rows,
        }
      })

      if (nextMetrics.itemsPerPage !== itemsPerPage) {
        onItemsPerPageChange(nextMetrics.itemsPerPage)
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
  }, [itemsPerPage, onItemsPerPageChange])

  return {
    viewportRef,
    columns: metrics.columns,
    rows: metrics.rows,
  }
}
