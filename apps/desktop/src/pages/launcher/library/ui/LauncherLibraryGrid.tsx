import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useSelectionContainer, type Box } from '@air/react-drag-to-select'
import { observeElementRect, useVirtualizer } from '@tanstack/react-virtual'
import { AlertTriangle, ExternalLink, Folder, Info, X } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { getLauncherCoverKey } from '@features/launcher/model/coverKey'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherVirtualFolder } from '@features/launcher/model/types'
import { LauncherArtworkCover } from '@features/launcher/ui/cards/LauncherArtworkCover'
import { LauncherModCard } from '@features/launcher/ui/cards/LauncherModCard'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from '@features/launcher/ui/cards/launcherCardPresentation'
import {
  buildLauncherFolderPreviewItems,
  buildLibraryCardMeta,
  clampLibraryRevealBatchSize,
  computeLibraryRevealBatchSize,
  encodeCustomItemKey,
  FALLBACK_LIBRARY_REVEAL_BATCH_SIZE,
  getLauncherFolderToneIndex,
  getLauncherFolderToneStyle,
  getLibraryFolderOrderContainerKey,
  type LauncherFolderPreviewItem,
  type LauncherLibraryDisplayItem,
} from '../model/launcherLibraryDisplay'
import {
  buildLauncherLibraryGridBlocks,
  estimateLauncherLibraryCardHeight,
  getLauncherLibraryPanelPlacement,
  LAUNCHER_LIBRARY_CARD_FALLBACK_ESTIMATED_HEIGHT_PX,
  LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX,
  LAUNCHER_LIBRARY_GRID_GAP_PX,
  LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX,
  type LauncherLibraryGridBlock,
} from './launcherLibraryGridLayout'
import {
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  getLauncherFolderIdFromBlankDropId,
  type LauncherPointerDragSource,
} from '../model/launcherLibraryDrag'
import { LauncherPointerDragContext } from './launcherLibraryPointerDragContext'
import { LauncherContextMenuItem, type LauncherContextMenuAction } from './LauncherLibraryContextMenuItem'

export { LauncherLibraryDndScope } from './LauncherLibraryDndScope'

export type { LauncherContextMenuAction } from './LauncherLibraryContextMenuItem'

export type LauncherLibrarySelectionBox = Box

export type LauncherLibrarySelectionRect = {
  left: number
  top: number
  width: number
  height: number
}

export function doesLauncherLibrarySelectionIntersect(selectionBox: LauncherLibrarySelectionBox, rect: LauncherLibrarySelectionRect) {
  return (
    selectionBox.left <= rect.left + rect.width &&
    selectionBox.left + selectionBox.width >= rect.left &&
    selectionBox.top <= rect.top + rect.height &&
    selectionBox.top + selectionBox.height >= rect.top
  )
}

export type VirtualizedLauncherGridProps = {
  items: LauncherLibraryDisplayItem[]
  blankDropId?: string
  openFolderItemsById?: Map<string, LauncherLibraryDisplayItem[]>
  latestVersionByModId?: Record<number, string>
  enableBoxSelection?: boolean
  enableRevealMotion?: boolean
  routeEnterSequence?: number
  editMode: boolean
  sortingActive?: boolean
  rootOrderContainerKey?: string
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  childModSelectionMode?: boolean
  childModSelectionParentId?: string | null
  childModSelectionIds?: string[]
  noneLabel: string
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  folderEmptyLabel: string
  openFolderLabel: (name: string) => string
  missingDependenciesLabel: (count: number) => string
  missingDependenciesBadgeLabel: string
  closeFolderLabel?: string
  onToggleSelection: (modId: string) => void
  onClearSelection?: () => void
  onBoxSelectionChange: (modIds: string[]) => void
  onToggleChildModSelection?: (modId: string) => void
  onToggleParentExpanded: (modId: string, anchorElement?: HTMLElement | null) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  isLibraryFolderOpen: (folderId: string) => boolean
  isClosingLibraryFolder?: (folderId: string) => boolean
  onOpenLibraryFolder: (folderId: string) => void
  onCloseLibraryFolder?: (folderId: string) => void
  getFolderContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}

export const VirtualizedLauncherGrid = memo(function VirtualizedLauncherGrid({
  items,
  blankDropId = LAUNCHER_LIBRARY_BLANK_DROP_ID,
  openFolderItemsById,
  latestVersionByModId = {},
  enableBoxSelection = true,
  enableRevealMotion = true,
  routeEnterSequence = 0,
  editMode,
  sortingActive = false,
  rootOrderContainerKey = 'view:all',
  editingSelectionIds,
  boxSelectionIds,
  childModSelectionMode = false,
  childModSelectionParentId = null,
  childModSelectionIds = [],
  noneLabel,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  folderEmptyLabel,
  openFolderLabel,
  missingDependenciesLabel,
  missingDependenciesBadgeLabel,
  closeFolderLabel,
  onToggleSelection,
  onClearSelection,
  onBoxSelectionChange,
  onToggleChildModSelection,
  onToggleParentExpanded,
  isParentExpanded,
  onOpenModDetails,
  onOpenModFolder,
  isLibraryFolderOpen,
  isClosingLibraryFolder,
  onOpenLibraryFolder,
  onCloseLibraryFolder,
  getFolderContextActions,
  getContextActions,
}: VirtualizedLauncherGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null)
  const [gridColumnCount, setGridColumnCount] = useState(1)
  const [activeModulesPanel, setActiveModulesPanel] = useState<{
    parentMod: LauncherLibraryItem
    childMods: LauncherLibraryItem[]
    anchorElement: HTMLElement
    anchorRect: DOMRect
  } | null>(null)
  const [revealBatchSize, setRevealBatchSize] = useState(() =>
    clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length),
  )
  const [hasPlayedInitialReveal, setHasPlayedInitialReveal] = useState(false)
  const [activeRevealSequence, setActiveRevealSequence] = useState(routeEnterSequence > 0 ? routeEnterSequence : 0)
  const [isBoxSelecting, setIsBoxSelecting] = useState(false)
  const scrollTimeoutRef = useRef<number | null>(null)
  const ignoreNextBlankClickRef = useRef(false)
  const setViewportNode = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node
    setViewportElement((current) => (current === node ? current : node))
  }, [])
  const originFolderId = getLauncherFolderIdFromBlankDropId(blankDropId)
  const isFolderGrid = originFolderId !== null
  useEffect(() => {
    if (!enableRevealMotion || isFolderGrid) {
      return
    }

    setHasPlayedInitialReveal(false)
    if (routeEnterSequence > 0) {
      setActiveRevealSequence(routeEnterSequence)
    }
    const timeoutId = window.setTimeout(() => setHasPlayedInitialReveal(true), 900)
    return () => window.clearTimeout(timeoutId)
  }, [enableRevealMotion, isFolderGrid, routeEnterSequence])
  const selectedIdLookup = useMemo(
    () => new Set(childModSelectionMode ? childModSelectionIds : editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, childModSelectionIds, childModSelectionMode, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
  const shouldRevealItems = enableRevealMotion && (isFolderGrid || !hasPlayedInitialReveal)
  const cardMinWidth = LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX
  const [rootFontSize, setRootFontSize] = useState(16)
  const [estimatedRowHeight, setEstimatedRowHeight] = useState(LAUNCHER_LIBRARY_CARD_FALLBACK_ESTIMATED_HEIGHT_PX)
  const gridBlocks = useMemo(
    () =>
      buildLauncherLibraryGridBlocks(
        items,
        gridColumnCount,
        isLibraryFolderOpen,
        estimatedRowHeight,
        isClosingLibraryFolder ?? (() => false),
        rootFontSize,
      ),
    [estimatedRowHeight, gridColumnCount, isClosingLibraryFolder, isLibraryFolderOpen, items, rootFontSize],
  )
  const remScale = rootFontSize / 16
  const scaledInterBlockGap = LAUNCHER_LIBRARY_GRID_GAP_PX * remScale
  const estimateVirtualRowSize = useCallback(
    (index: number) => (gridBlocks[index]?.estimatedHeight ?? estimatedRowHeight) + scaledInterBlockGap,
    [gridBlocks, estimatedRowHeight, scaledInterBlockGap],
  )
  const measureVirtualRowElement = useCallback(
    (element: Element) => Math.ceil(element.getBoundingClientRect().height) + scaledInterBlockGap,
    [scaledInterBlockGap],
  )
  // TanStack Virtual owns imperative row measurement for the large launcher grid.
  const rowVirtualizer = useVirtualizer({
    count: gridBlocks.length,
    getScrollElement: () => viewportElement,
    estimateSize: estimateVirtualRowSize,
    measureElement: measureVirtualRowElement,
    overscan: 2,
    useAnimationFrameWithResizeObserver: true,
    // Minimized windows collapse the scroll rect to zero, which would unmount
    // every virtual row and leave the restore/maximize animation on an empty
    // grid. Keep the last real rect until the viewport is measurable again.
    observeElementRect: (instance, cb) =>
      observeElementRect(instance, (rect) => {
        if (document.hidden || rect.width <= 0 || rect.height <= 0) {
          return
        }
        cb(rect)
      }),
  })
  // Re-measure visible rows synchronously before paint so a stale cached row
  // size (left over from a block that changed content in place) is corrected
  // before it can paint a gap. measureElement reads the live DOM height via
  // measureVirtualRowElement (bypassing the size cache) and calls
  // resizeItem, whose notify dispatches a re-render from within this layout
  // effect — React flushes it synchronously before the browser paints.
  // Pure card blocks have delta≈0 (estimate is exact) so this is a no-op for
  // them; panel blocks with larger deltas get fixed in one go.
  useLayoutEffect(() => {
    gridRef.current
      ?.querySelectorAll<HTMLElement>('.launcher-library-virtual-row[data-index]')
      .forEach((row) => rowVirtualizer.measureElement(row))
  }, [gridBlocks, openFolderItemsById, rowVirtualizer])
  const virtualRows = rowVirtualizer.getVirtualItems()
  const updateDragSelection = useCallback(
    (box: Box) => {
      const viewport = viewportRef.current
      const grid = gridRef.current
      if (!viewport || !grid) {
        return
      }

      const selectedIds = Array.from(grid.querySelectorAll<HTMLElement>('[data-launcher-mod-card-id]'))
        .filter((element) => {
          const id = element.getAttribute('data-launcher-mod-card-id')
          if (!id) {
            return false
          }
          const rect = element.getBoundingClientRect()
          return doesLauncherLibrarySelectionIntersect(box, rect)
        })
        .map((element) => element.getAttribute('data-launcher-mod-card-id'))
        .filter((id): id is string => Boolean(id))
      onBoxSelectionChange(selectedIds)
    },
    [onBoxSelectionChange],
  )
  const { DragSelection } = useSelectionContainer<HTMLDivElement>({
    eventsElement: viewportElement,
    isEnabled: enableBoxSelection && !editMode && !childModSelectionMode && !sortingActive,
    isValidSelectionStart: () => true,
    onSelectionStart: () => setIsBoxSelecting(true),
    onSelectionEnd: () => {
      ignoreNextBlankClickRef.current = true
      setIsBoxSelecting(false)
    },
    onSelectionChange: updateDragSelection,
    selectionProps: {
      'data-testid': 'launcher-library-box-select',
      className: 'launcher-library-box-select',
    } as HTMLAttributes<HTMLDivElement>,
    shouldStartSelecting: (target) => target instanceof HTMLElement && !target.closest('.launcher-library-draggable-card'),
  })

  const handleToggleParentModulesPanel = useCallback(
    (modId: string, anchorElement?: HTMLElement | null) => {
      const displayItem = items.find((item) => item.kind === 'mod' && item.mod.id === modId)
      if (!displayItem || displayItem.kind !== 'mod' || !displayItem.childMods.length || !anchorElement) {
        onToggleParentExpanded(modId)
        return
      }

      if (activeModulesPanel?.parentMod.id === modId) {
        setActiveModulesPanel(null)
        onToggleParentExpanded(modId)
        return
      }

      if (activeModulesPanel && isParentExpanded(activeModulesPanel.parentMod.id)) {
        onToggleParentExpanded(activeModulesPanel.parentMod.id)
      }
      if (!isParentExpanded(modId)) {
        onToggleParentExpanded(modId)
      }
      setActiveModulesPanel({
        parentMod: displayItem.mod,
        childMods: displayItem.childMods,
        anchorElement,
        anchorRect: anchorElement.getBoundingClientRect(),
      })
    },
    [activeModulesPanel, isParentExpanded, items, onToggleParentExpanded],
  )

  useEffect(() => {
    if (!activeModulesPanel) {
      return
    }

    let frameId: number | null = null
    const updateAnchorRect = () => {
      frameId = null
      setActiveModulesPanel((current) => {
        if (!current || current.anchorElement !== activeModulesPanel.anchorElement) {
          return current
        }
        if (!current.anchorElement.isConnected) {
          return null
        }
        const nextRect = current.anchorElement.getBoundingClientRect()
        const currentRect = current.anchorRect
        const changed =
          Math.abs(nextRect.top - currentRect.top) > 0.5 ||
          Math.abs(nextRect.left - currentRect.left) > 0.5 ||
          Math.abs(nextRect.width - currentRect.width) > 0.5 ||
          Math.abs(nextRect.height - currentRect.height) > 0.5
        return changed ? { ...current, anchorRect: nextRect } : current
      })
    }
    const scheduleAnchorRectUpdate = () => {
      if (frameId !== null) {
        return
      }
      frameId = window.requestAnimationFrame(updateAnchorRect)
    }

    viewportElement?.addEventListener('scroll', scheduleAnchorRectUpdate, { passive: true })
    window.addEventListener('resize', scheduleAnchorRectUpdate)
    window.visualViewport?.addEventListener('resize', scheduleAnchorRectUpdate)
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      viewportElement?.removeEventListener('scroll', scheduleAnchorRectUpdate)
      window.removeEventListener('resize', scheduleAnchorRectUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleAnchorRectUpdate)
    }
  }, [activeModulesPanel, viewportElement])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const handleScroll = () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current)
      } else {
        viewport.classList.add('launcher-library-grid-viewport-scrolling')
      }
      scrollTimeoutRef.current = window.setTimeout(() => {
        scrollTimeoutRef.current = null
        viewport.classList.remove('launcher-library-grid-viewport-scrolling')
      }, 150)
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null
      }
      viewport.classList.remove('launcher-library-grid-viewport-scrolling')
    }
  }, [])

  useEffect(() => {
    if (!activeModulesPanel) {
      return
    }
    const currentDisplayItem = items.find(
      (item): item is Extract<LauncherLibraryDisplayItem, { kind: 'mod' }> =>
        item.kind === 'mod' && item.mod.id === activeModulesPanel.parentMod.id,
    )
    if (!currentDisplayItem || !isParentExpanded(activeModulesPanel.parentMod.id)) {
      setActiveModulesPanel(null)
      return
    }
    if (!currentDisplayItem.childMods.length) {
      setActiveModulesPanel(null)
      if (isParentExpanded(activeModulesPanel.parentMod.id)) {
        onToggleParentExpanded(activeModulesPanel.parentMod.id)
      }
      return
    }
    const currentChildIds = currentDisplayItem.childMods.map((mod) => mod.id).join('\u0000')
    const activeChildIds = activeModulesPanel.childMods.map((mod) => mod.id).join('\u0000')
    if (currentChildIds !== activeChildIds) {
      setActiveModulesPanel((current) =>
        current && current.parentMod.id === activeModulesPanel.parentMod.id
          ? { ...current, childMods: currentDisplayItem.childMods }
          : current,
      )
    }
  }, [activeModulesPanel, isParentExpanded, items, onToggleParentExpanded])

  useEffect(() => {
    if (!activeModulesPanel) {
      return
    }
    const close = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (target.closest('.launcher-library-modules-floating-panel') || target.closest('.launcher-mod-card-child-tools')) {
        return
      }
      setActiveModulesPanel(null)
      onToggleParentExpanded(activeModulesPanel.parentMod.id)
    }
    window.addEventListener('pointerdown', close, { capture: true })
    return () => window.removeEventListener('pointerdown', close, { capture: true })
  }, [activeModulesPanel, onToggleParentExpanded])

  useEffect(() => {
    const viewport = viewportRef.current
    const grid = gridRef.current
    if (!viewport) {
      setGridColumnCount(1)
      return
    }

    const updateGridMetrics = () => {
      const viewportRect = viewport.getBoundingClientRect()
      // Minimized or hidden windows report a collapsed viewport; deriving
      // metrics from it would rebuild the grid as a single column and the
      // restored window would briefly paint that stale layout. Keep the last
      // real metrics until the viewport is measurable again.
      if (document.hidden || viewportRect.width <= 0 || viewportRect.height <= 0) {
        return
      }
      const viewportStyle = window.getComputedStyle(viewport)
      const horizontalPadding = Number.parseFloat(viewportStyle.paddingLeft) + Number.parseFloat(viewportStyle.paddingRight)
      const viewportWidth = Math.max(0, viewportRect.width - horizontalPadding)
      // Convert design-token pixel values to the current rem size so column math
      // matches the rem-based CSS grid, which scales with the root font size.
      const nextRootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
      setRootFontSize((current) => (current === nextRootFontSize ? current : nextRootFontSize))
      const scaledCardMinWidth = (LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX / 16) * nextRootFontSize
      const scaledGridGap = (LAUNCHER_LIBRARY_GRID_GAP_PX / 16) * nextRootFontSize
      const nextColumnCount = Math.max(1, Math.floor((viewportWidth + scaledGridGap) / (scaledCardMinWidth + scaledGridGap)))
      setGridColumnCount((current) => (current === nextColumnCount ? current : nextColumnCount))
      const cardWidth = (viewportWidth - Math.max(0, nextColumnCount - 1) * scaledGridGap) / nextColumnCount
      const nextEstimatedRowHeight = estimateLauncherLibraryCardHeight(cardWidth, nextRootFontSize)
      setEstimatedRowHeight((current) => (current === nextEstimatedRowHeight ? current : nextEstimatedRowHeight))
    }

    const measuredGrid = grid

    const updateRevealBatchSize = () => {
      if (!shouldRevealItems || !measuredGrid) {
        setRevealBatchSize(clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length))
        return
      }
      const firstCard = measuredGrid.querySelector<HTMLElement>('.launcher-library-grid-reveal')
      const viewportRect = viewport.getBoundingClientRect()
      const cardRect = firstCard?.getBoundingClientRect()
      if (viewportRect.width <= 0 || viewportRect.height <= 0 || !cardRect || cardRect.width <= 0 || cardRect.height <= 0) {
        return
      }
      const nextBatchSize = computeLibraryRevealBatchSize({
        itemCount: items.length,
        viewportWidth: viewportRect.width,
        viewportHeight: viewportRect.height,
        cardWidth: cardRect?.width ?? 0,
        cardHeight: cardRect?.height ?? 0,
      })
      setRevealBatchSize((current) => (current === nextBatchSize ? current : nextBatchSize))
    }

    const updateLayoutMeasurements = () => {
      updateGridMetrics()
      updateRevealBatchSize()
    }
    // Resize deliveries (ResizeObserver, window/visualViewport resize) run
    // after layout but before the frame paints, so committing the recomputed
    // metrics synchronously keeps the first frame at a new size on the final
    // column count. Deferring the commit paints at least one frame with the
    // stale layout, which is visible as the grid stretching and then snapping
    // when the window maximizes or restores from minimized in a single jump.
    const flushLayoutMeasurements = () => {
      flushSync(updateLayoutMeasurements)
    }

    updateLayoutMeasurements()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            flushLayoutMeasurements()
          })
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', flushLayoutMeasurements)
    window.visualViewport?.addEventListener('resize', flushLayoutMeasurements)
    // Size changes that happen while the window is hidden are skipped above
    // and may never produce another resize delivery, so re-measure as soon as
    // the window becomes visible again.
    document.addEventListener('visibilitychange', flushLayoutMeasurements)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', flushLayoutMeasurements)
      window.visualViewport?.removeEventListener('resize', flushLayoutMeasurements)
      document.removeEventListener('visibilitychange', flushLayoutMeasurements)
    }
  }, [cardMinWidth, items.length, shouldRevealItems])

  const toggleCardSelection = childModSelectionMode ? onToggleChildModSelection : onToggleSelection
  const handleViewportClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (editMode || childModSelectionMode || isBoxSelecting) {
        return
      }
      if (event.defaultPrevented) {
        return
      }
      if (ignoreNextBlankClickRef.current) {
        ignoreNextBlankClickRef.current = false
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (
        target.closest(
          '.launcher-library-draggable-card, .launcher-library-modules-floating-panel, .context-menu-content, button, a, input, textarea, select',
        )
      ) {
        return
      }
      onClearSelection?.()
    },
    [childModSelectionMode, editMode, isBoxSelecting, onClearSelection],
  )

  return (
    <div
      ref={setViewportNode}
      className={cx(
        'launcher-library-grid-viewport',
        editMode && 'launcher-library-grid-viewport-editing',
        sortingActive && 'launcher-library-grid-viewport-sorting',
        isBoxSelecting && 'launcher-library-grid-viewport-selecting',
      )}
      data-launcher-blank-drop-id={blankDropId}
      onClick={handleViewportClick}
    >
      <div className="launcher-library-box-select-layer" data-launcher-box-select-layer="viewport">
        <DragSelection />
      </div>
      <div
        ref={gridRef}
        className="launcher-library-grid launcher-library-virtual-grid"
        data-guide="launcher-mod-grid"
        style={{
          height: rowVirtualizer.getTotalSize() + LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX,
        }}
      >
        {virtualRows.map((virtualRow) => {
          const block = gridBlocks[virtualRow.index]
          const blockRowCount = block?.rowCount ?? 1
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              className="launcher-library-virtual-row launcher-library-virtual-grid-block"
              data-index={virtualRow.index}
              style={{
                transform: `translateY(${virtualRow.start + LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX}px)`,
                gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX / 16}rem, 1fr))`,
                gridTemplateRows: `repeat(${blockRowCount}, minmax(${estimatedRowHeight / rootFontSize}rem, auto))`,
              }}
            >
              {block ? (
                <LauncherLibraryVirtualBlockContent
                  block={block}
                  openFolderItemsById={openFolderItemsById}
                  latestVersionByModId={latestVersionByModId}
                  editMode={editMode}
                  sortingActive={sortingActive}
                  rootOrderContainerKey={rootOrderContainerKey}
                  editingSelectionIds={editingSelectionIds}
                  boxSelectionIds={boxSelectionIds}
                  childModSelectionMode={childModSelectionMode}
                  childModSelectionIds={childModSelectionIds}
                  childModSelectionParentId={childModSelectionParentId}
                  noneLabel={noneLabel}
                  selectedIdLookup={selectedIdLookup}
                  boxSelectionIdLookup={boxSelectionIdLookup}
                  originFolderId={originFolderId}
                  shouldRevealItems={shouldRevealItems}
                  revealSequence={activeRevealSequence}
                  revealBatchSize={revealBatchSize}
                  estimatedRowHeight={estimatedRowHeight}
                  childCountLabel={childCountLabel}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                  folderCountLabel={folderCountLabel}
                  folderEmptyLabel={folderEmptyLabel}
                  openFolderLabel={openFolderLabel}
                  missingDependenciesLabel={missingDependenciesLabel}
                  closeFolderLabel={closeFolderLabel}
                  onToggleSelection={toggleCardSelection ?? onToggleSelection}
                  onToggleParentExpanded={handleToggleParentModulesPanel}
                  isParentExpanded={isParentExpanded}
                  onOpenModDetails={onOpenModDetails}
                  onOpenModFolder={onOpenModFolder}
                  isLibraryFolderOpen={isLibraryFolderOpen}
                  isClosingLibraryFolder={isClosingLibraryFolder}
                  onOpenLibraryFolder={onOpenLibraryFolder}
                  onCloseLibraryFolder={onCloseLibraryFolder}
                  getFolderContextActions={getFolderContextActions}
                  getContextActions={getContextActions}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      {activeModulesPanel ? (
        <LauncherLibraryModulesFloatingPanel
          parentMod={activeModulesPanel.parentMod}
          childMods={activeModulesPanel.childMods}
          anchorRect={activeModulesPanel.anchorRect}
          viewportElement={viewportElement}
          gridColumnCount={gridColumnCount}
          editMode={editMode}
          sortingActive={sortingActive}
          editingSelectionIds={editingSelectionIds}
          boxSelectionIds={boxSelectionIds}
          childModSelectionMode={childModSelectionMode}
          childModSelectionIds={childModSelectionIds}
          noneLabel={noneLabel}
          childCountLabel={childCountLabel}
          collapseLabel={collapseLabel}
          missingDependenciesLabel={missingDependenciesLabel}
          missingDependenciesBadgeLabel={missingDependenciesBadgeLabel}
          onClose={() => {
            setActiveModulesPanel(null)
            onToggleParentExpanded(activeModulesPanel.parentMod.id)
          }}
          onToggleSelection={onToggleSelection}
          onOpenModDetails={onOpenModDetails}
          onOpenModFolder={onOpenModFolder}
          getContextActions={getContextActions}
        />
      ) : null}
    </div>
  )
})

const LauncherLibraryVirtualBlockContent = memo(function LauncherLibraryVirtualBlockContent({
  block,
  openFolderItemsById,
  latestVersionByModId,
  editMode,
  sortingActive,
  rootOrderContainerKey,
  editingSelectionIds,
  boxSelectionIds,
  childModSelectionMode,
  childModSelectionParentId,
  childModSelectionIds,
  noneLabel,
  selectedIdLookup,
  boxSelectionIdLookup,
  originFolderId,
  shouldRevealItems,
  revealSequence,
  revealBatchSize,
  estimatedRowHeight,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  folderEmptyLabel,
  openFolderLabel,
  missingDependenciesLabel,
  closeFolderLabel,
  onToggleSelection,
  onToggleParentExpanded,
  isParentExpanded,
  onOpenModDetails,
  onOpenModFolder,
  isLibraryFolderOpen,
  isClosingLibraryFolder,
  onOpenLibraryFolder,
  onCloseLibraryFolder,
  getFolderContextActions,
  getContextActions,
}: {
  block: LauncherLibraryGridBlock
  openFolderItemsById?: Map<string, LauncherLibraryDisplayItem[]>
  latestVersionByModId: Record<number, string>
  editMode: boolean
  sortingActive: boolean
  rootOrderContainerKey: string
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  childModSelectionMode: boolean
  childModSelectionParentId: string | null
  childModSelectionIds: string[]
  noneLabel: string
  selectedIdLookup: Set<string>
  boxSelectionIdLookup: Set<string>
  originFolderId: string | null
  shouldRevealItems: boolean
  revealSequence: number
  revealBatchSize: number
  estimatedRowHeight: number
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  folderEmptyLabel: string
  openFolderLabel: (name: string) => string
  missingDependenciesLabel: (count: number) => string
  closeFolderLabel?: string
  onToggleSelection: (modId: string) => void
  onToggleParentExpanded: (modId: string, anchorElement?: HTMLElement | null) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  isLibraryFolderOpen: (folderId: string) => boolean
  isClosingLibraryFolder?: (folderId: string) => boolean
  onOpenLibraryFolder: (folderId: string) => void
  onCloseLibraryFolder?: (folderId: string) => void
  getFolderContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const shouldReveal = shouldRevealItems
  return (
    <>
      {block.items.map(({ displayItem, index, columnSpan, rowSpan, columnStart, rowStart }) => {
        const blockRelativeRowStart = rowStart - block.rowStart
        if (displayItem.kind === 'folder') {
          const folderOpen = isLibraryFolderOpen(displayItem.folder.id)
          const folderClosing = isClosingLibraryFolder?.(displayItem.folder.id) ?? false
          const folderLookup = normalizeLookupKey(displayItem.folder.id)
          const folderItems = openFolderItemsById?.get(folderLookup) ?? []
          return (
            <Fragment key={`folder-group-${displayItem.folder.id}`}>
              {!folderOpen && shouldReveal ? (
                <LoadingMotionRevealItem
                  key={`folder-${displayItem.folder.id}:${revealSequence}`}
                  index={Math.floor(index / revealBatchSize) + 3}
                  className="launcher-library-grid-reveal"
                  style={{
                    gridColumnStart: columnStart + 1,
                    gridRowStart: blockRelativeRowStart + 1,
                    ...(sortingActive ? ({ '--launcher-wobble-phase': `${(index * -0.37).toFixed(2)}s` } as CSSProperties) : {}),
                  }}
                >
                  <DraggableLauncherFolderCard
                    folder={displayItem.folder}
                    mods={displayItem.mods}
                    childFolders={displayItem.childFolders}
                    countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                    openLabel={openFolderLabel(displayItem.folder.name)}
                    getContextActions={getFolderContextActions}
                    onOpen={onOpenLibraryFolder}
                    originFolderId={originFolderId}
                    reorderItemKey={sortingActive ? (encodeCustomItemKey('folder', displayItem.folder.id) ?? '') : undefined}
                    reorderContainerKey={sortingActive ? rootOrderContainerKey : undefined}
                    selectionMode={editMode || childModSelectionMode}
                  />
                </LoadingMotionRevealItem>
              ) : null}
              {!folderOpen && !shouldReveal ? (
                <div
                  key={`folder-${displayItem.folder.id}`}
                  className="launcher-library-grid-reveal"
                  style={{
                    gridColumnStart: columnStart + 1,
                    gridRowStart: blockRelativeRowStart + 1,
                    ...(sortingActive ? ({ '--launcher-wobble-phase': `${(index * -0.37).toFixed(2)}s` } as CSSProperties) : {}),
                  }}
                >
                  <DraggableLauncherFolderCard
                    folder={displayItem.folder}
                    mods={displayItem.mods}
                    childFolders={displayItem.childFolders}
                    countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                    openLabel={openFolderLabel(displayItem.folder.name)}
                    getContextActions={getFolderContextActions}
                    onOpen={onOpenLibraryFolder}
                    originFolderId={originFolderId}
                    reorderItemKey={sortingActive ? (encodeCustomItemKey('folder', displayItem.folder.id) ?? '') : undefined}
                    reorderContainerKey={sortingActive ? rootOrderContainerKey : undefined}
                    selectionMode={editMode || childModSelectionMode}
                  />
                </div>
              ) : null}
              {folderOpen ? (
                <LauncherLibraryFolderPanel
                  folder={displayItem.folder}
                  items={folderItems}
                  itemCount={displayItem.mods.length + displayItem.childFolders.length}
                  contentReady={Boolean(openFolderItemsById?.has(folderLookup))}
                  closing={folderClosing}
                  gridColumnCount={columnSpan}
                  columnSpan={columnSpan}
                  rowSpan={folderClosing ? 1 : rowSpan}
                  columnStart={columnStart}
                  rowStart={blockRelativeRowStart}
                  blankDropId={`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}${displayItem.folder.id}`}
                  estimatedRowHeight={estimatedRowHeight}
                  latestVersionByModId={latestVersionByModId}
                  editMode={editMode}
                  editingSelectionIds={editingSelectionIds}
                  boxSelectionIds={boxSelectionIds}
                  childModSelectionMode={childModSelectionMode}
                  childModSelectionParentId={childModSelectionParentId}
                  childModSelectionIds={childModSelectionIds}
                  noneLabel={noneLabel}
                  childCountLabel={childCountLabel}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                  folderCountLabel={folderCountLabel}
                  folderEmptyLabel={folderEmptyLabel}
                  openFolderLabel={openFolderLabel}
                  missingDependenciesLabel={missingDependenciesLabel}
                  closeFolderLabel={closeFolderLabel}
                  onToggleSelection={onToggleSelection}
                  onToggleParentExpanded={onToggleParentExpanded}
                  isParentExpanded={isParentExpanded}
                  onOpenModDetails={onOpenModDetails}
                  onOpenModFolder={onOpenModFolder}
                  onOpenLibraryFolder={onOpenLibraryFolder}
                  onCloseLibraryFolder={onCloseLibraryFolder}
                  getFolderContextActions={getFolderContextActions}
                  getContextActions={getContextActions}
                  sortingActive={sortingActive}
                />
              ) : null}
            </Fragment>
          )
        }
        const item = displayItem.mod
        const childCount = displayItem.childMods.length
        const expanded = childCount > 0 && isParentExpanded(item.id)
        const isChildModSelectionParent = childModSelectionMode && item.id === childModSelectionParentId
        const content = (
          <DraggableLauncherLibraryCard
            item={item}
            noneLabel={noneLabel}
            latestVersionByModId={latestVersionByModId}
            boxSelected={boxSelectionIdLookup.has(item.id)}
            originFolderId={originFolderId}
            originParentId={null}
            selectionMode={editMode || childModSelectionMode}
            selectionDisabled={isChildModSelectionParent}
            selected={selectedIdLookup.has(item.id)}
            childCount={childCount}
            childCountLabel={childCount ? childCountLabel(childCount) : undefined}
            expanded={expanded}
            expandLabel={childCount ? expandLabel(item.name) : undefined}
            collapseLabel={childCount ? collapseLabel(item.name) : undefined}
            missingDependenciesLabel={missingDependenciesLabel(item.missingRequiredDependencies.length)}
            reorderItemKey={sortingActive ? (encodeCustomItemKey('mod', getModKey(item)) ?? '') : undefined}
            reorderContainerKey={sortingActive ? rootOrderContainerKey : undefined}
            onToggleParentExpanded={childCount ? onToggleParentExpanded : undefined}
            onToggleSelection={editMode || childModSelectionMode ? onToggleSelection : undefined}
            onOpenModDetails={editMode || childModSelectionMode ? undefined : onOpenModDetails}
            onOpenModFolder={editMode || childModSelectionMode ? undefined : onOpenModFolder}
            getContextActions={editMode || childModSelectionMode ? undefined : getContextActions}
          />
        )
        if (!shouldReveal) {
          return (
            <Fragment key={`${displayItem.kind}-${item.id}`}>
              <div
                className="launcher-library-grid-reveal"
                style={{
                  gridColumnStart: columnStart + 1,
                  gridRowStart: blockRelativeRowStart + 1,
                  ...(sortingActive ? ({ '--launcher-wobble-phase': `${(index * -0.37).toFixed(2)}s` } as CSSProperties) : {}),
                }}
              >
                {content}
              </div>
            </Fragment>
          )
        }
        return (
          <Fragment key={`${displayItem.kind}-${item.id}:${revealSequence}`}>
            <LoadingMotionRevealItem
              index={Math.floor(index / revealBatchSize) + 3}
              className="launcher-library-grid-reveal"
              style={{
                gridColumnStart: columnStart + 1,
                gridRowStart: blockRelativeRowStart + 1,
                ...(sortingActive ? ({ '--launcher-wobble-phase': `${(index * -0.37).toFixed(2)}s` } as CSSProperties) : {}),
              }}
            >
              {content}
            </LoadingMotionRevealItem>
          </Fragment>
        )
      })}
    </>
  )
})

const DraggableLauncherLibraryCard = memo(function DraggableLauncherLibraryCard({
  item,
  noneLabel,
  latestVersionByModId,
  boxSelected,
  originFolderId,
  originParentId,
  selectionMode,
  selectionDisabled,
  selected,
  childCount,
  childCountLabel,
  expanded,
  expandLabel,
  collapseLabel,
  missingDependenciesLabel,
  reorderItemKey,
  reorderContainerKey,
  onToggleParentExpanded,
  onToggleSelection,
  onOpenModDetails,
  onOpenModFolder,
  getContextActions,
}: {
  item: LauncherLibraryItem
  noneLabel: string
  latestVersionByModId: Record<number, string>
  boxSelected: boolean
  originFolderId: string | null
  originParentId: string | null
  selectionMode: boolean
  selectionDisabled?: boolean
  selected: boolean
  childCount: number
  childCountLabel?: string
  expanded: boolean
  expandLabel?: string
  collapseLabel?: string
  missingDependenciesLabel?: string
  reorderItemKey?: string
  reorderContainerKey?: string
  onToggleParentExpanded?: (modId: string, anchorElement?: HTMLElement | null) => void
  onToggleSelection?: (modId: string) => void
  onOpenModDetails?: (modId: string) => void
  onOpenModFolder?: (mod: LauncherLibraryItem) => void
  getContextActions?: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const imageModKey = getLauncherCoverKey(item)
  const cover = useLauncherImage(item.imageUrl, imageModKey)
  const meta = buildLibraryCardMeta(item, noneLabel)
  const itemRef = useRef(item)
  const toggleParentExpandedRef = useRef(onToggleParentExpanded)
  const toggleSelectionRef = useRef(onToggleSelection)
  const openModDetailsRef = useRef(onOpenModDetails)
  const openModFolderRef = useRef(onOpenModFolder)
  const getContextActionsRef = useRef(getContextActions)
  useEffect(() => {
    itemRef.current = item
    toggleParentExpandedRef.current = onToggleParentExpanded
    toggleSelectionRef.current = onToggleSelection
    openModDetailsRef.current = onOpenModDetails
    openModFolderRef.current = onOpenModFolder
    getContextActionsRef.current = getContextActions
  }, [getContextActions, item, onOpenModDetails, onOpenModFolder, onToggleParentExpanded, onToggleSelection])
  const handleToggleExpanded = useCallback((event?: MouseEvent<HTMLElement>) => {
    const anchorElement = event?.currentTarget ?? null
    toggleParentExpandedRef.current?.(itemRef.current.id, anchorElement)
  }, [])
  const handleSelect = useCallback(() => toggleSelectionRef.current?.(itemRef.current.id), [])
  const handleOpenDetails = useCallback(() => openModDetailsRef.current?.(itemRef.current.id), [])
  const handleOpenDirectTarget = useCallback(() => openModFolderRef.current?.(itemRef.current), [])
  const resolveContextActions = useCallback(() => getContextActionsRef.current?.(itemRef.current), [])
  const dragSource: LauncherPointerDragSource = {
    kind: 'mod',
    modId: item.id,
    modKey: getModKey(item),
    title: item.name,
    meta,
    imageUrl: item.imageUrl,
    previewImageUrl: cover.imageUrl,
    enabled: item.enabled,
    originFolderId,
    originParentId,
    originParentKey: null,
  }
  return (
    <div
      className={cx('launcher-library-draggable-card', boxSelected && 'launcher-library-draggable-card-box-selected')}
      data-launcher-mod-card-id={item.id}
      data-launcher-parent-drop-id={item.id}
      data-launcher-reorder-item-key={reorderItemKey}
      data-launcher-reorder-container-key={reorderContainerKey}
      data-draggable="true"
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        if (!selectionMode) {
          pointerDrag?.startPointerDrag(dragSource, event)
        }
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
    >
      <LauncherModCard
        title={item.name}
        titleTooltip={item.name}
        meta={meta}
        author={item.author}
        version={item.version}
        latestVersion={item.nexusModId == null ? null : latestVersionByModId[item.nexusModId]}
        imageUrl={item.imageUrl}
        imageModKey={imageModKey}
        enabled={item.enabled}
        selectionMode={selectionMode}
        selected={selected || boxSelected}
        childCount={childCount}
        childCountLabel={childCountLabel}
        expanded={expanded}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
        missingDependencies={item.missingRequiredDependencies}
        missingDependenciesLabel={missingDependenciesLabel}
        onToggleExpanded={onToggleParentExpanded ? handleToggleExpanded : undefined}
        onSelect={!selectionDisabled && onToggleSelection ? handleSelect : undefined}
        onOpenDetails={onOpenModDetails ? handleOpenDetails : undefined}
        onOpenDirectTarget={onOpenModFolder ? handleOpenDirectTarget : undefined}
        getContextActions={getContextActions ? resolveContextActions : undefined}
      />
    </div>
  )
})

const DraggableLauncherFolderCard = memo(function DraggableLauncherFolderCard({
  folder,
  mods,
  childFolders,
  countLabel,
  openLabel,
  getContextActions,
  onOpen,
  originFolderId,
  reorderItemKey,
  reorderContainerKey,
  selectionMode,
}: {
  folder: LauncherVirtualFolder
  mods: LauncherLibraryItem[]
  childFolders: LauncherVirtualFolder[]
  countLabel: string
  openLabel: string
  getContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  onOpen: (folderId: string) => void
  originFolderId: string | null
  reorderItemKey?: string
  reorderContainerKey?: string
  selectionMode?: boolean
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const previewItems = buildLauncherFolderPreviewItems(mods, childFolders)
  const previewCount = Math.min(4, previewItems.length)
  const previewKind = previewCount === 1 ? previewItems[0]?.kind : previewCount === 0 ? 'empty' : 'mixed'
  const emptyPreviewItems = Array.from({ length: 4 }, (_, index) => index)
  const toneStyle = getLauncherFolderToneStyle(getLauncherFolderToneIndex(folder.id))
  const dragSource: LauncherPointerDragSource = { kind: 'folder', folderId: folder.id, originFolderId, title: folder.name, previewItems }
  const [resolvedContextActions, setResolvedContextActions] = useState<LauncherContextMenuAction[] | null>(null)
  const handleOpen = useCallback(() => onOpen(folder.id), [folder.id, onOpen])
  const resolveContextActions = useCallback(() => getContextActions(folder) ?? [], [folder, getContextActions])
  const handleContextMenuCapture = useCallback(() => {
    setResolvedContextActions(resolveContextActions())
  }, [resolveContextActions])
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      setResolvedContextActions(open ? resolveContextActions() : null)
    },
    [resolveContextActions],
  )

  const card = (
    <button
      type="button"
      className="launcher-library-folder-card launcher-library-draggable-card"
      data-draggable="true"
      style={toneStyle}
      aria-label={openLabel}
      data-launcher-folder-drop-id={folder.id}
      data-launcher-reorder-item-key={reorderItemKey}
      data-launcher-reorder-container-key={reorderContainerKey}
      onContextMenuCapture={handleContextMenuCapture}
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        if (!selectionMode) {
          pointerDrag?.startPointerDrag(dragSource, event)
        }
      }}
      onPointerDown={(event) => {
        if (!selectionMode) {
          pointerDrag?.handleDndPointerDown(event)
        }
      }}
      onClick={handleOpen}
    >
      <div className="launcher-library-folder-visual" aria-hidden="true">
        {previewCount === 0 ? (
          <span className="launcher-library-folder-preview-shell">
            <span className="launcher-library-folder-preview" data-preview-count={previewCount} data-preview-kind={previewKind}>
              {emptyPreviewItems.map((index) => (
                <span
                  key={`placeholder-${index}`}
                  className="launcher-library-folder-preview-item launcher-library-folder-preview-placeholder"
                />
              ))}
            </span>
          </span>
        ) : (
          <span className="launcher-library-folder-preview" data-preview-count={previewCount} data-preview-kind={previewKind}>
            {previewItems.map((item) => (
              <LauncherFolderPreviewModItem key={item.id} item={item} />
            ))}
          </span>
        )}
      </div>
      <span className="launcher-library-folder-card-copy">
        <span className="launcher-library-folder-card-name">{folder.name}</span>
        <span className="launcher-library-folder-card-count">{countLabel}</span>
      </span>
    </button>
  )

  const menuActions = resolvedContextActions ?? []

  return (
    <ContextMenu.Root onOpenChange={handleContextMenuOpenChange}>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      {menuActions.length ? (
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
            {menuActions.map((action) => (
              <LauncherContextMenuItem key={action.label} action={action} />
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  )
})

function LauncherLibraryModulesFloatingPanel({
  parentMod,
  childMods,
  anchorRect,
  viewportElement,
  gridColumnCount,
  editMode,
  editingSelectionIds,
  boxSelectionIds,
  childModSelectionMode = false,
  childModSelectionIds = [],
  sortingActive,
  noneLabel,
  childCountLabel,
  collapseLabel,
  missingDependenciesLabel,
  missingDependenciesBadgeLabel,
  onClose,
  onToggleSelection,
  onOpenModDetails,
  onOpenModFolder,
  getContextActions,
}: {
  parentMod: LauncherLibraryItem
  childMods: LauncherLibraryItem[]
  anchorRect: DOMRect
  viewportElement: HTMLElement | null
  gridColumnCount: number
  editMode: boolean
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  childModSelectionMode?: boolean
  childModSelectionIds?: string[]
  sortingActive: boolean
  noneLabel: string
  childCountLabel: (count: number) => string
  collapseLabel: (name: string) => string
  missingDependenciesLabel: (count: number) => string
  missingDependenciesBadgeLabel: string
  onClose: () => void
  onToggleSelection: (modId: string) => void
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const selectedIdLookup = useMemo(
    () => new Set(childModSelectionMode ? childModSelectionIds : editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, childModSelectionIds, childModSelectionMode, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
  const parentModKey = getModKey(parentMod)
  const parentOrderContainerKey = `parent:${parentModKey}`
  const panelLabel = `${parentMod.name} modules`
  const placement = getLauncherLibraryPanelPlacement(childMods.length, gridColumnCount, 1)
  const visibleRows = Math.min(3, placement.rowSpan)
  const panelPadding = 12
  const panelHeaderHeight = 56
  const moduleRowHeight = 84
  const moduleGridGap = 12
  const moduleCardWidth = Math.max(236, Math.min(252, LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX - 8))
  const panelWidth = placement.columnSpan * moduleCardWidth + Math.max(0, placement.columnSpan - 1) * moduleGridGap + panelPadding * 2
  const desiredPanelHeight =
    panelHeaderHeight + visibleRows * moduleRowHeight + Math.max(0, visibleRows - 1) * moduleGridGap + panelPadding * 2
  const viewportRect = viewportElement?.getBoundingClientRect() ?? null
  const margin = 12
  const viewportLeft = viewportRect?.left ?? 0
  const viewportTop = viewportRect?.top ?? 0
  const viewportRight = viewportRect?.right ?? globalThis.window?.innerWidth ?? panelWidth + margin * 2
  const viewportBottom = viewportRect?.bottom ?? globalThis.window?.innerHeight ?? desiredPanelHeight + margin * 2
  const preferredLeft = anchorRect.left
  const offset = 10
  const maxLeft = viewportRight - panelWidth - margin
  const left = Math.max(viewportLeft + margin, Math.min(preferredLeft, maxLeft))
  const spaceBelow = viewportBottom - anchorRect.bottom - offset - margin
  const spaceAbove = anchorRect.top - viewportTop - offset - margin
  const preferBelow = spaceBelow >= desiredPanelHeight || (spaceAbove < desiredPanelHeight && spaceBelow >= spaceAbove)
  const availablePanelHeight = Math.max(180, preferBelow ? spaceBelow : spaceAbove)
  const panelHeight = Math.min(desiredPanelHeight, availablePanelHeight)
  const constrainedByViewport = panelHeight < desiredPanelHeight
  const scrollable = placement.rowSpan > 3 || constrainedByViewport
  const top = preferBelow ? anchorRect.bottom + offset : anchorRect.top - panelHeight - offset
  const arrowLeft = Math.max(18, Math.min(anchorRect.left + anchorRect.width / 2 - left - 6, panelWidth - 32))
  const panel = (
    <section
      className="launcher-library-modules-floating-panel"
      role="dialog"
      aria-label={panelLabel}
      data-placement={preferBelow ? 'bottom' : 'top'}
      style={
        {
          '--launcher-modules-panel-left': `${left}px`,
          '--launcher-modules-panel-top': `${top}px`,
          '--launcher-modules-panel-width': `${panelWidth / 16}rem`,
          '--launcher-modules-panel-height': `${panelHeight / 16}rem`,
          '--launcher-modules-panel-card-width': `${moduleCardWidth / 16}rem`,
          '--launcher-modules-panel-columns': placement.columnSpan,
          '--launcher-modules-panel-arrow-left': `${arrowLeft}px`,
        } as CSSProperties
      }
    >
      <div className="launcher-library-modules-floating-header">
        <div className="launcher-library-modules-floating-title">
          <strong>{parentMod.name}</strong>
          <span>{childCountLabel(childMods.length)}</span>
        </div>
        <button
          type="button"
          className="launcher-library-modules-floating-close"
          aria-label={collapseLabel(parentMod.name)}
          title={collapseLabel(parentMod.name)}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="launcher-library-modules-floating-grid" data-scrollable={scrollable ? 'true' : 'false'}>
        {childMods.map((childMod) => {
          const childKey = encodeCustomItemKey('mod', getModKey(childMod)) ?? ''
          return (
            <div key={childMod.id} className="launcher-library-module-reveal">
              <DraggableLauncherModuleTile
                item={childMod}
                noneLabel={noneLabel}
                boxSelected={boxSelectionIdLookup.has(childMod.id)}
                originParentId={parentMod.id}
                originParentKey={parentModKey}
                selectionMode={editMode}
                selected={selectedIdLookup.has(childMod.id)}
                reorderItemKey={sortingActive ? childKey : undefined}
                reorderContainerKey={sortingActive ? parentOrderContainerKey : undefined}
                missingDependenciesLabel={missingDependenciesLabel(childMod.missingRequiredDependencies.length)}
                missingDependenciesBadgeLabel={missingDependenciesBadgeLabel}
                onToggleSelection={editMode ? onToggleSelection : undefined}
                onOpenModDetails={editMode ? undefined : onOpenModDetails}
                onOpenModFolder={editMode ? undefined : onOpenModFolder}
                getContextActions={editMode ? undefined : getContextActions}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
  return createPortal(panel, document.body)
}

const DraggableLauncherModuleTile = memo(function DraggableLauncherModuleTile({
  item,
  noneLabel,
  boxSelected,
  originParentId,
  originParentKey,
  selectionMode,
  selected,
  reorderItemKey,
  reorderContainerKey,
  missingDependenciesLabel,
  missingDependenciesBadgeLabel,
  onToggleSelection,
  onOpenModDetails,
  onOpenModFolder,
  getContextActions,
}: {
  item: LauncherLibraryItem
  noneLabel: string
  boxSelected: boolean
  originParentId: string
  originParentKey: string
  selectionMode: boolean
  selected: boolean
  reorderItemKey?: string
  reorderContainerKey?: string
  missingDependenciesLabel?: string
  missingDependenciesBadgeLabel: string
  onToggleSelection?: (modId: string) => void
  onOpenModDetails?: (modId: string) => void
  onOpenModFolder?: (mod: LauncherLibraryItem) => void
  getContextActions?: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const imageModKey = getLauncherCoverKey(item)
  const cover = useLauncherImage(item.imageUrl, imageModKey)
  const meta = buildLibraryCardMeta(item, noneLabel)
  const fallbackPalette = getLauncherCardFallbackPalette(item.name)
  const fallbackWord = getLauncherCardCoverWord(item.name)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties
  const itemRef = useRef(item)
  const toggleSelectionRef = useRef(onToggleSelection)
  const openModDetailsRef = useRef(onOpenModDetails)
  const openModFolderRef = useRef(onOpenModFolder)
  const getContextActionsRef = useRef(getContextActions)
  useEffect(() => {
    itemRef.current = item
    toggleSelectionRef.current = onToggleSelection
    openModDetailsRef.current = onOpenModDetails
    openModFolderRef.current = onOpenModFolder
    getContextActionsRef.current = getContextActions
  }, [getContextActions, item, onOpenModDetails, onOpenModFolder, onToggleSelection])
  const handleSelect = useCallback(() => toggleSelectionRef.current?.(itemRef.current.id), [])
  const handleOpenDetails = useCallback(() => openModDetailsRef.current?.(itemRef.current.id), [])
  const handleOpenDirectTarget = useCallback(() => openModFolderRef.current?.(itemRef.current), [])
  const handleActionClick = useCallback((event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    action()
  }, [])
  const dragSource: LauncherPointerDragSource = {
    kind: 'mod',
    modId: item.id,
    modKey: getModKey(item),
    title: item.name,
    meta,
    imageUrl: item.imageUrl,
    previewImageUrl: cover.imageUrl,
    enabled: item.enabled,
    originFolderId: null,
    originParentId,
    originParentKey,
  }
  const menuActions = getContextActions?.(item) ?? []
  const removeAction = menuActions.find((action) => /remove|移出/i.test(action.label))
  const tile = (
    <article
      className={cx(
        'launcher-library-module-tile launcher-library-draggable-card',
        !item.enabled && 'launcher-library-module-tile-disabled',
        (selected || boxSelected) && 'launcher-library-module-tile-selected',
      )}
      aria-label={item.name}
      data-draggable="true"
      data-launcher-mod-card-id={item.id}
      data-launcher-reorder-item-key={reorderItemKey}
      data-launcher-reorder-container-key={reorderContainerKey}
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        if (!selectionMode) {
          pointerDrag?.startPointerDrag(dragSource, event)
        }
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
      onClick={selectionMode ? handleSelect : handleOpenDetails}
      onDoubleClick={selectionMode ? undefined : handleOpenDirectTarget}
    >
      {item.missingRequiredDependencies.length ? (
        <span
          className="launcher-mod-card-missing-dependencies launcher-library-module-missing-dependencies"
          aria-label={missingDependenciesLabel}
          data-tooltip={item.missingRequiredDependencies.join(', ')}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{missingDependenciesBadgeLabel}</span>
        </span>
      ) : null}
      <LauncherArtworkCover
        title={item.name}
        imageUrl={item.imageUrl}
        imageModKey={imageModKey}
        coverStyle={coverStyle}
        coverWord={fallbackWord}
        className="launcher-library-module-thumb"
      />
      <div className="launcher-library-module-main">
        <strong title={item.name}>{item.name}</strong>
        <span title={meta}>{meta}</span>
        <div className="launcher-library-module-actions">
          <button type="button" aria-label={item.name} title={item.name} onClick={(event) => handleActionClick(event, handleOpenDetails)}>
            <Info className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={item.absolutePath}
            title={item.absolutePath}
            onClick={(event) => handleActionClick(event, handleOpenDirectTarget)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {removeAction ? (
            <button
              type="button"
              aria-label={removeAction.label}
              title={removeAction.label}
              onClick={(event) => handleActionClick(event, removeAction.onSelect)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{tile}</ContextMenu.Trigger>
      {menuActions.length ? (
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
            {menuActions.map((action) => (
              <LauncherContextMenuItem key={action.label} action={action} />
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  )
})

const LauncherFolderPreviewModItem = memo(function LauncherFolderPreviewModItem({ item }: { item: LauncherFolderPreviewItem }) {
  const fallbackPalette = getLauncherCardFallbackPalette(item.title)
  const fallbackWord = getLauncherCardCoverWord(item.title)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  if (item.kind === 'mod') {
    return (
      <span className="launcher-library-folder-preview-item launcher-library-folder-preview-cover-item">
        <LauncherArtworkCover
          title={item.title}
          imageUrl={item.imageUrl}
          coverStyle={coverStyle}
          coverWord={fallbackWord}
          className="launcher-library-folder-preview-cover"
        />
      </span>
    )
  }

  return (
    <span className="launcher-library-folder-preview-item launcher-library-folder-preview-folder">
      <Folder aria-hidden="true" />
    </span>
  )
})

function LauncherLibraryFolderPanel({
  folder,
  items,
  itemCount,
  contentReady,
  closing = false,
  gridColumnCount,
  columnSpan,
  rowSpan,
  columnStart,
  rowStart,
  blankDropId,
  estimatedRowHeight,
  latestVersionByModId,
  editMode,
  editingSelectionIds,
  boxSelectionIds,
  childModSelectionMode = false,
  childModSelectionParentId = null,
  childModSelectionIds = [],
  noneLabel,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  folderEmptyLabel,
  openFolderLabel,
  missingDependenciesLabel,
  closeFolderLabel,
  onToggleSelection,
  onToggleParentExpanded,
  isParentExpanded,
  onOpenModDetails,
  onOpenModFolder,
  onOpenLibraryFolder,
  onCloseLibraryFolder,
  getFolderContextActions,
  getContextActions,
  sortingActive,
}: {
  folder: LauncherVirtualFolder
  items: LauncherLibraryDisplayItem[]
  itemCount: number
  contentReady: boolean
  closing?: boolean
  gridColumnCount: number
  columnSpan: number
  rowSpan: number
  columnStart: number
  rowStart: number
  blankDropId: string
  estimatedRowHeight: number
  latestVersionByModId: Record<number, string>
  editMode: boolean
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  childModSelectionMode?: boolean
  childModSelectionParentId?: string | null
  childModSelectionIds?: string[]
  noneLabel: string
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  folderEmptyLabel: string
  openFolderLabel: (name: string) => string
  missingDependenciesLabel: (count: number) => string
  closeFolderLabel?: string
  onToggleSelection: (modId: string) => void
  onToggleParentExpanded: (modId: string) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  onOpenLibraryFolder: (folderId: string) => void
  onCloseLibraryFolder?: (folderId: string) => void
  getFolderContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
  sortingActive: boolean
}) {
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
  const selectedIdLookup = useMemo(
    () => new Set(childModSelectionMode ? childModSelectionIds : editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, childModSelectionIds, childModSelectionMode, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
  const closeLabel = closeFolderLabel ?? folder.name
  const [resolvedContextActions, setResolvedContextActions] = useState<LauncherContextMenuAction[] | null>(null)
  const resolveContextActions = useCallback(() => getFolderContextActions(folder) ?? [], [folder, getFolderContextActions])
  const handleContextMenuCapture = useCallback(() => {
    setResolvedContextActions(resolveContextActions())
  }, [resolveContextActions])
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      setResolvedContextActions(open ? resolveContextActions() : null)
    },
    [resolveContextActions],
  )
  const panelContextActions = resolvedContextActions ?? []
  const folderOrderContainerKey = getLibraryFolderOrderContainerKey(folder.id)

  const panel = (
    <section
      className="launcher-library-folder-panel"
      role="region"
      aria-label={folder.name}
      data-launcher-folder-panel-id={folder.id}
      data-closing={closing ? '' : undefined}
      onContextMenuCapture={handleContextMenuCapture}
      style={{
        gridColumn: `${columnStart + 1} / span ${columnSpan}`,
        gridRow: `${rowStart + 1} / span ${rowSpan}`,
        ...getLauncherFolderToneStyle(getLauncherFolderToneIndex(folder.id)),
      }}
    >
      {onCloseLibraryFolder ? (
        <button
          type="button"
          className="launcher-library-folder-panel-close"
          aria-label={closeLabel}
          title={closeLabel}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onCloseLibraryFolder(folder.id)
          }}
        >
          ×
        </button>
      ) : null}
      <div className="launcher-library-folder-panel-sticky-note" aria-hidden="true">
        <strong>{folder.name}</strong>
        <span>{folderCountLabel(contentReady ? items.length : itemCount)}</span>
      </div>
      <div className="launcher-library-folder-panel-scroll">
        {contentReady && items.length ? (
          <div
            className="launcher-library-folder-panel-grid"
            data-launcher-blank-drop-id={blankDropId}
            style={{
              gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX / 16}rem, 1fr))`,
              gridAutoRows: `minmax(${estimatedRowHeight / rootFontSize}rem, auto)`,
            }}
          >
            {items.map((displayItem) => {
              if (displayItem.kind === 'folder') {
                const folderKey = encodeCustomItemKey('folder', displayItem.folder.id) ?? ''
                return (
                  <div className="launcher-library-grid-reveal" key={`folder-${displayItem.folder.id}`}>
                    <DraggableLauncherFolderCard
                      folder={displayItem.folder}
                      mods={displayItem.mods}
                      childFolders={displayItem.childFolders}
                      countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                      openLabel={openFolderLabel(displayItem.folder.name)}
                      getContextActions={getFolderContextActions}
                      onOpen={onOpenLibraryFolder}
                      originFolderId={folder.id}
                      reorderItemKey={sortingActive ? folderKey : undefined}
                      reorderContainerKey={sortingActive ? folderOrderContainerKey : undefined}
                      selectionMode={editMode || childModSelectionMode}
                    />
                  </div>
                )
              }

              const item = displayItem.mod
              const childCount = displayItem.childMods.length
              const isChildModSelectionParent = childModSelectionMode && item.id === childModSelectionParentId
              const itemKey = encodeCustomItemKey('mod', getModKey(item)) ?? ''
              return (
                <div key={`${displayItem.kind}-${item.id}`} className="launcher-library-grid-reveal">
                  <DraggableLauncherLibraryCard
                    item={item}
                    noneLabel={noneLabel}
                    latestVersionByModId={latestVersionByModId}
                    boxSelected={boxSelectionIdLookup.has(item.id)}
                    originFolderId={folder.id}
                    originParentId={null}
                    selectionMode={editMode || childModSelectionMode}
                    selectionDisabled={isChildModSelectionParent}
                    selected={selectedIdLookup.has(item.id)}
                    childCount={childCount}
                    childCountLabel={childCount ? childCountLabel(childCount) : undefined}
                    expanded={childCount > 0 && isParentExpanded(item.id)}
                    expandLabel={childCount ? expandLabel(item.name) : undefined}
                    collapseLabel={childCount ? collapseLabel(item.name) : undefined}
                    missingDependenciesLabel={missingDependenciesLabel(item.missingRequiredDependencies.length)}
                    reorderItemKey={sortingActive ? itemKey : undefined}
                    reorderContainerKey={sortingActive ? folderOrderContainerKey : undefined}
                    onToggleParentExpanded={childCount ? onToggleParentExpanded : undefined}
                    onToggleSelection={editMode || childModSelectionMode ? onToggleSelection : undefined}
                    onOpenModDetails={editMode || childModSelectionMode ? undefined : onOpenModDetails}
                    onOpenModFolder={editMode || childModSelectionMode ? undefined : onOpenModFolder}
                    getContextActions={editMode || childModSelectionMode ? undefined : getContextActions}
                  />
                </div>
              )
            })}
          </div>
        ) : contentReady ? (
          <div className="launcher-library-folder-panel-empty" data-launcher-blank-drop-id={blankDropId} role="status" aria-live="polite">
            <span>{folderEmptyLabel}</span>
          </div>
        ) : (
          <div
            className="launcher-library-folder-panel-grid launcher-library-folder-panel-grid-pending"
            data-launcher-blank-drop-id={blankDropId}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  )

  return (
    <ContextMenu.Root onOpenChange={handleContextMenuOpenChange}>
      <ContextMenu.Trigger asChild>{panel}</ContextMenu.Trigger>
      {panelContextActions.length ? (
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
            {panelContextActions.map((action) => (
              <LauncherContextMenuItem key={action.label} action={action} />
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  )
}
