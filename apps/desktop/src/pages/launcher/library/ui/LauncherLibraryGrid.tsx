import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useSelectionContainer, boxesIntersect, type Box } from '@air/react-drag-to-select'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ExternalLink, Folder, Info, X } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import { LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherVirtualFolder } from '@features/launcher/model/types'
import { LauncherArtworkCover } from '@features/launcher/ui/cards/LauncherArtworkCover'
import { LauncherModCard } from '@features/launcher/ui/cards/LauncherModCard'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from '@features/launcher/ui/cards/launcherCardPresentation'
import {
  buildLauncherFolderPreviewItems,
  buildLibraryCardMeta,
  clampLibraryRevealBatchSize,
  computeLibraryRevealBatchSize,
  FALLBACK_LIBRARY_REVEAL_BATCH_SIZE,
  getLauncherFolderTone,
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
  LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE,
  getLauncherFolderIdFromBlankDropId,
  type LauncherPointerDragSource,
} from '../model/launcherLibraryDrag'
import { LauncherPointerDragContext } from './launcherLibraryPointerDragContext'
import { LauncherContextMenuItem, type LauncherContextMenuAction } from './LauncherLibraryContextMenuItem'

export { LauncherLibraryDndScope } from './LauncherLibraryDndScope'

export type { LauncherContextMenuAction } from './LauncherLibraryContextMenuItem'

export type VirtualizedLauncherGridProps = {
  items: LauncherLibraryDisplayItem[]
  blankDropId?: string
  openFolderItemsById?: Map<string, LauncherLibraryDisplayItem[]>
  latestVersionByModId?: Record<number, string>
  enableBoxSelection?: boolean
  enableRevealMotion?: boolean
  editMode: boolean
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  noneLabel: string
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  openFolderLabel: (name: string) => string
  closeFolderLabel?: string
  onToggleSelection: (modId: string) => void
  onBoxSelectionChange: (modIds: string[]) => void
  onToggleParentExpanded: (modId: string, anchorElement?: HTMLElement | null) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  isLibraryFolderOpen: (folderId: string) => boolean
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
  editMode,
  editingSelectionIds,
  boxSelectionIds,
  noneLabel,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  openFolderLabel,
  closeFolderLabel,
  onToggleSelection,
  onBoxSelectionChange,
  onToggleParentExpanded,
  isParentExpanded,
  onOpenModDetails,
  onOpenModFolder,
  isLibraryFolderOpen,
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
  const setViewportNode = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node
    setViewportElement((current) => (current === node ? current : node))
  }, [])
  const selectedIdLookup = useMemo(
    () => new Set(editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
  const originFolderId = getLauncherFolderIdFromBlankDropId(blankDropId)
  const isFolderGrid = originFolderId !== null
  const shouldRevealItems = enableRevealMotion && (isFolderGrid || !hasPlayedInitialReveal)
  const cardMinWidth = LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX
  const [estimatedRowHeight, setEstimatedRowHeight] = useState(LAUNCHER_LIBRARY_CARD_FALLBACK_ESTIMATED_HEIGHT_PX)
  const gridBlocks = useMemo(
    () => buildLauncherLibraryGridBlocks(items, gridColumnCount, isLibraryFolderOpen, estimatedRowHeight),
    [estimatedRowHeight, gridColumnCount, isLibraryFolderOpen, items],
  )
  // TanStack Virtual owns imperative row measurement for the large launcher grid.
  const rowVirtualizer = useVirtualizer({
    count: gridBlocks.length,
    getScrollElement: () => viewportElement,
    estimateSize: (index) => (gridBlocks[index]?.estimatedHeight ?? estimatedRowHeight) + LAUNCHER_LIBRARY_GRID_GAP_PX,
    overscan: 1,
  })
  useEffect(() => {
    gridBlocks.forEach((block, index) => {
      rowVirtualizer.resizeItem?.(index, block.estimatedHeight + LAUNCHER_LIBRARY_GRID_GAP_PX)
    })
  }, [estimatedRowHeight, gridBlocks, rowVirtualizer])
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
          return boxesIntersect(box, {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          })
        })
        .map((element) => element.getAttribute('data-launcher-mod-card-id'))
        .filter((id): id is string => Boolean(id))
      onBoxSelectionChange(selectedIds)
    },
    [onBoxSelectionChange],
  )
  const { DragSelection } = useSelectionContainer<HTMLDivElement>({
    eventsElement: viewportElement,
    isEnabled: enableBoxSelection && !editMode,
    isValidSelectionStart: () => true,
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
      const viewportWidth = viewport.getBoundingClientRect().width
      const nextColumnCount = Math.max(
        1,
        Math.floor((viewportWidth + LAUNCHER_LIBRARY_GRID_GAP_PX) / (cardMinWidth + LAUNCHER_LIBRARY_GRID_GAP_PX)),
      )
      setGridColumnCount((current) => (current === nextColumnCount ? current : nextColumnCount))
      const cardWidth = (viewportWidth - Math.max(0, nextColumnCount - 1) * LAUNCHER_LIBRARY_GRID_GAP_PX) / nextColumnCount
      const nextEstimatedRowHeight = estimateLauncherLibraryCardHeight(cardWidth)
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

    let frameId: number | null = null
    const updateLayoutMeasurements = () => {
      updateGridMetrics()
      updateRevealBatchSize()
    }
    const scheduleLayoutMeasurements = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        updateLayoutMeasurements()
      })
    }

    updateLayoutMeasurements()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            scheduleLayoutMeasurements()
          })
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', scheduleLayoutMeasurements)
    window.visualViewport?.addEventListener('resize', scheduleLayoutMeasurements)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleLayoutMeasurements)
      window.visualViewport?.removeEventListener('resize', scheduleLayoutMeasurements)
    }
  }, [cardMinWidth, items.length, shouldRevealItems])

  useEffect(() => {
    if (!enableRevealMotion || isFolderGrid || hasPlayedInitialReveal) {
      return
    }
    const timeoutId = window.setTimeout(() => setHasPlayedInitialReveal(true), 900)
    return () => window.clearTimeout(timeoutId)
  }, [enableRevealMotion, hasPlayedInitialReveal, isFolderGrid])

  return (
    <div
      ref={setViewportNode}
      className={cx('launcher-library-grid-viewport', editMode && 'launcher-library-grid-viewport-editing')}
      data-launcher-blank-drop-id={blankDropId}
    >
      <DragSelection />
      <div
        ref={gridRef}
        className="launcher-library-grid launcher-library-virtual-grid"
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
              className="launcher-library-virtual-row launcher-library-virtual-grid-block"
              data-index={virtualRow.index}
              style={{
                transform: `translateY(${virtualRow.start + LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX}px)`,
                gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX}px, 1fr))`,
                gridTemplateRows: `repeat(${blockRowCount}, ${estimatedRowHeight}px)`,
              }}
            >
              {block ? (
                <LauncherLibraryVirtualBlockContent
                  block={block}
                  openFolderItemsById={openFolderItemsById}
                  latestVersionByModId={latestVersionByModId}
                  editMode={editMode}
                  editingSelectionIds={editingSelectionIds}
                  boxSelectionIds={boxSelectionIds}
                  noneLabel={noneLabel}
                  selectedIdLookup={selectedIdLookup}
                  boxSelectionIdLookup={boxSelectionIdLookup}
                  originFolderId={originFolderId}
                  shouldRevealItems={shouldRevealItems}
                  revealBatchSize={revealBatchSize}
                  childCountLabel={childCountLabel}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                  folderCountLabel={folderCountLabel}
                  openFolderLabel={openFolderLabel}
                  closeFolderLabel={closeFolderLabel}
                  onToggleSelection={onToggleSelection}
                  onToggleParentExpanded={handleToggleParentModulesPanel}
                  isParentExpanded={isParentExpanded}
                  onOpenModDetails={onOpenModDetails}
                  onOpenModFolder={onOpenModFolder}
                  isLibraryFolderOpen={isLibraryFolderOpen}
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
          editingSelectionIds={editingSelectionIds}
          boxSelectionIds={boxSelectionIds}
          noneLabel={noneLabel}
          childCountLabel={childCountLabel}
          collapseLabel={collapseLabel}
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
  editingSelectionIds,
  boxSelectionIds,
  noneLabel,
  selectedIdLookup,
  boxSelectionIdLookup,
  originFolderId,
  shouldRevealItems,
  revealBatchSize,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  openFolderLabel,
  closeFolderLabel,
  onToggleSelection,
  onToggleParentExpanded,
  isParentExpanded,
  onOpenModDetails,
  onOpenModFolder,
  isLibraryFolderOpen,
  onOpenLibraryFolder,
  onCloseLibraryFolder,
  getFolderContextActions,
  getContextActions,
}: {
  block: LauncherLibraryGridBlock
  openFolderItemsById?: Map<string, LauncherLibraryDisplayItem[]>
  latestVersionByModId: Record<number, string>
  editMode: boolean
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  noneLabel: string
  selectedIdLookup: Set<string>
  boxSelectionIdLookup: Set<string>
  originFolderId: string | null
  shouldRevealItems: boolean
  revealBatchSize: number
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  openFolderLabel: (name: string) => string
  closeFolderLabel?: string
  onToggleSelection: (modId: string) => void
  onToggleParentExpanded: (modId: string, anchorElement?: HTMLElement | null) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  isLibraryFolderOpen: (folderId: string) => boolean
  onOpenLibraryFolder: (folderId: string) => void
  onCloseLibraryFolder?: (folderId: string) => void
  getFolderContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  return (
    <>
      {block.items.map(({ displayItem, index, columnSpan, rowSpan, columnStart, rowStart }) => {
        const blockRelativeRowStart = rowStart - block.rowStart
        if (displayItem.kind === 'folder') {
          const folderOpen = isLibraryFolderOpen(displayItem.folder.id)
          const folderLookup = normalizeLookupKey(displayItem.folder.id)
          const folderItems = openFolderItemsById?.get(folderLookup) ?? []
          return (
            <Fragment key={`folder-group-${displayItem.folder.id}`}>
              {!folderOpen && shouldRevealItems ? (
                <LoadingMotionRevealItem
                  key={`folder-${displayItem.folder.id}`}
                  index={Math.floor(index / revealBatchSize) + 3}
                  className="launcher-library-grid-reveal"
                  style={{ gridColumnStart: columnStart + 1, gridRowStart: blockRelativeRowStart + 1 }}
                >
                  <DraggableLauncherFolderCard
                    folder={displayItem.folder}
                    mods={displayItem.mods}
                    childFolders={displayItem.childFolders}
                    countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                    openLabel={openFolderLabel(displayItem.folder.name)}
                    getContextActions={getFolderContextActions}
                    onOpen={onOpenLibraryFolder}
                  />
                </LoadingMotionRevealItem>
              ) : null}
              {!folderOpen && !shouldRevealItems ? (
                <div
                  key={`folder-${displayItem.folder.id}`}
                  className="launcher-library-grid-reveal"
                  style={{ gridColumnStart: columnStart + 1, gridRowStart: blockRelativeRowStart + 1 }}
                >
                  <DraggableLauncherFolderCard
                    folder={displayItem.folder}
                    mods={displayItem.mods}
                    childFolders={displayItem.childFolders}
                    countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                    openLabel={openFolderLabel(displayItem.folder.name)}
                    getContextActions={getFolderContextActions}
                    onOpen={onOpenLibraryFolder}
                  />
                </div>
              ) : null}
              {folderOpen ? (
                <LauncherLibraryFolderPanel
                  folder={displayItem.folder}
                  items={folderItems}
                  itemCount={displayItem.mods.length + displayItem.childFolders.length}
                  contentReady={Boolean(openFolderItemsById?.has(folderLookup))}
                  gridColumnCount={columnSpan}
                  columnSpan={columnSpan}
                  rowSpan={rowSpan}
                  columnStart={columnStart}
                  rowStart={blockRelativeRowStart}
                  blankDropId={`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}${displayItem.folder.id}`}
                  latestVersionByModId={latestVersionByModId}
                  editMode={editMode}
                  editingSelectionIds={editingSelectionIds}
                  boxSelectionIds={boxSelectionIds}
                  noneLabel={noneLabel}
                  childCountLabel={childCountLabel}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                  folderCountLabel={folderCountLabel}
                  openFolderLabel={openFolderLabel}
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
                />
              ) : null}
            </Fragment>
          )
        }
        const item = displayItem.mod
        const childCount = displayItem.childMods.length
        const expanded = childCount > 0 && isParentExpanded(item.id)
        const content = (
          <DraggableLauncherLibraryCard
            item={item}
            noneLabel={noneLabel}
            latestVersionByModId={latestVersionByModId}
            boxSelected={boxSelectionIdLookup.has(item.id)}
            originFolderId={originFolderId}
            originParentId={null}
            selectionMode={editMode}
            selected={selectedIdLookup.has(item.id)}
            childCount={childCount}
            childCountLabel={childCount ? childCountLabel(childCount) : undefined}
            expanded={expanded}
            expandLabel={childCount ? expandLabel(item.name) : undefined}
            collapseLabel={childCount ? collapseLabel(item.name) : undefined}
            onToggleParentExpanded={childCount ? onToggleParentExpanded : undefined}
            onToggleSelection={editMode ? onToggleSelection : undefined}
            onOpenModDetails={editMode ? undefined : onOpenModDetails}
            onOpenModFolder={editMode ? undefined : onOpenModFolder}
            getContextActions={editMode ? undefined : getContextActions}
          />
        )
        if (!shouldRevealItems) {
          return (
            <div
              key={`${displayItem.kind}-${item.id}`}
              className="launcher-library-grid-reveal"
              style={{ gridColumnStart: columnStart + 1, gridRowStart: blockRelativeRowStart + 1 }}
            >
              {content}
            </div>
          )
        }
        return (
          <LoadingMotionRevealItem
            key={`${displayItem.kind}-${item.id}`}
            index={Math.floor(index / revealBatchSize) + 3}
            className="launcher-library-grid-reveal"
            style={{ gridColumnStart: columnStart + 1, gridRowStart: blockRelativeRowStart + 1 }}
          >
            {content}
          </LoadingMotionRevealItem>
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
  selected,
  childCount,
  childCountLabel,
  expanded,
  expandLabel,
  collapseLabel,
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
  selected: boolean
  childCount: number
  childCountLabel?: string
  expanded: boolean
  expandLabel?: string
  collapseLabel?: string
  onToggleParentExpanded?: (modId: string, anchorElement?: HTMLElement | null) => void
  onToggleSelection?: (modId: string) => void
  onOpenModDetails?: (modId: string) => void
  onOpenModFolder?: (mod: LauncherLibraryItem) => void
  getContextActions?: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const cover = useLauncherImage(item.imageUrl)
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
    title: item.name,
    meta,
    imageUrl: item.imageUrl,
    previewImageUrl: cover.imageUrl,
    enabled: item.enabled,
    originFolderId,
    originParentId,
  }
  return (
    <div
      className={cx('launcher-library-draggable-card', boxSelected && 'launcher-library-draggable-card-box-selected')}
      data-launcher-mod-card-id={item.id}
      data-draggable="true"
      {...(!selectionMode ? { [LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE]: item.id } : {})}
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        if (!selectionMode) {
          pointerDrag?.startPointerDrag(dragSource, event)
        }
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
      onClickCapture={(event) => pointerDrag?.suppressClickAfterDrag(event)}
    >
      <LauncherModCard
        title={item.name}
        titleTooltip={item.name}
        meta={meta}
        author={item.author}
        version={item.version}
        latestVersion={item.nexusModId == null ? null : latestVersionByModId[item.nexusModId]}
        imageUrl={item.imageUrl}
        enabled={item.enabled}
        selectionMode={selectionMode}
        selected={selected || boxSelected}
        childCount={childCount}
        childCountLabel={childCountLabel}
        expanded={expanded}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
        onToggleExpanded={onToggleParentExpanded ? handleToggleExpanded : undefined}
        onSelect={onToggleSelection ? handleSelect : undefined}
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
}: {
  folder: LauncherVirtualFolder
  mods: LauncherLibraryItem[]
  childFolders: LauncherVirtualFolder[]
  countLabel: string
  openLabel: string
  getContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  onOpen: (folderId: string) => void
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const previewItems = buildLauncherFolderPreviewItems(mods, childFolders)
  const previewCount = Math.min(4, previewItems.length)
  const previewKind = previewCount === 1 ? previewItems[0]?.kind : previewCount === 0 ? 'empty' : 'mixed'
  const emptyPreviewItems = Array.from({ length: 4 }, (_, index) => index)
  const tone = getLauncherFolderTone(folder.id)
  const dragSource: LauncherPointerDragSource = { kind: 'folder', folderId: folder.id, title: folder.name, previewItems }
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
      data-folder-tone={tone}
      aria-label={openLabel}
      data-launcher-folder-drop-id={folder.id}
      onContextMenuCapture={handleContextMenuCapture}
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        pointerDrag?.startPointerDrag(dragSource, event)
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
      onClickCapture={(event) => pointerDrag?.suppressClickAfterDrag(event)}
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
      <span className="launcher-library-folder-card-name">{folder.name}</span>
      <span className="launcher-library-folder-card-count">{countLabel}</span>
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
  noneLabel,
  childCountLabel,
  collapseLabel,
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
  noneLabel: string
  childCountLabel: (count: number) => string
  collapseLabel: (name: string) => string
  onClose: () => void
  onToggleSelection: (modId: string) => void
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const selectedIdLookup = useMemo(
    () => new Set(editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
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
          '--launcher-modules-panel-width': `${panelWidth}px`,
          '--launcher-modules-panel-height': `${panelHeight}px`,
          '--launcher-modules-panel-card-width': `${moduleCardWidth}px`,
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
        {childMods.map((childMod) => (
          <div key={childMod.id} className="launcher-library-module-reveal">
            <DraggableLauncherModuleTile
              item={childMod}
              noneLabel={noneLabel}
              boxSelected={boxSelectionIdLookup.has(childMod.id)}
              originParentId={parentMod.id}
              selectionMode={editMode}
              selected={selectedIdLookup.has(childMod.id)}
              onToggleSelection={editMode ? onToggleSelection : undefined}
              onOpenModDetails={editMode ? undefined : onOpenModDetails}
              onOpenModFolder={editMode ? undefined : onOpenModFolder}
              getContextActions={editMode ? undefined : getContextActions}
            />
          </div>
        ))}
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
  selectionMode,
  selected,
  onToggleSelection,
  onOpenModDetails,
  onOpenModFolder,
  getContextActions,
}: {
  item: LauncherLibraryItem
  noneLabel: string
  boxSelected: boolean
  originParentId: string
  selectionMode: boolean
  selected: boolean
  onToggleSelection?: (modId: string) => void
  onOpenModDetails?: (modId: string) => void
  onOpenModFolder?: (mod: LauncherLibraryItem) => void
  getContextActions?: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const cover = useLauncherImage(item.imageUrl)
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
    title: item.name,
    meta,
    imageUrl: item.imageUrl,
    previewImageUrl: cover.imageUrl,
    enabled: item.enabled,
    originFolderId: null,
    originParentId,
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
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        if (!selectionMode) {
          pointerDrag?.startPointerDrag(dragSource, event)
        }
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
      onClickCapture={(event) => pointerDrag?.suppressClickAfterDrag(event)}
      onClick={selectionMode ? handleSelect : handleOpenDetails}
      onDoubleClick={selectionMode ? undefined : handleOpenDirectTarget}
    >
      <LauncherArtworkCover
        title={item.name}
        imageUrl={cover.imageUrl}
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
  gridColumnCount,
  columnSpan,
  rowSpan,
  columnStart,
  rowStart,
  blankDropId,
  latestVersionByModId,
  editMode,
  editingSelectionIds,
  boxSelectionIds,
  noneLabel,
  childCountLabel,
  expandLabel,
  collapseLabel,
  folderCountLabel,
  openFolderLabel,
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
}: {
  folder: LauncherVirtualFolder
  items: LauncherLibraryDisplayItem[]
  itemCount: number
  contentReady: boolean
  gridColumnCount: number
  columnSpan: number
  rowSpan: number
  columnStart: number
  rowStart: number
  blankDropId: string
  latestVersionByModId: Record<number, string>
  editMode: boolean
  editingSelectionIds: string[]
  boxSelectionIds: string[]
  noneLabel: string
  childCountLabel: (count: number) => string
  expandLabel: (name: string) => string
  collapseLabel: (name: string) => string
  folderCountLabel: (count: number) => string
  openFolderLabel: (name: string) => string
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
}) {
  const selectedIdLookup = useMemo(
    () => new Set(editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, editMode, editingSelectionIds],
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

  const panel = (
    <section
      className="launcher-library-folder-panel"
      role="region"
      aria-label={folder.name}
      data-folder-tone={getLauncherFolderTone(folder.id)}
      data-launcher-folder-panel-id={folder.id}
      onContextMenuCapture={handleContextMenuCapture}
      style={{
        gridColumn: `${columnStart + 1} / span ${columnSpan}`,
        gridRow: `${rowStart + 1} / span ${rowSpan}`,
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
      <div className="launcher-library-folder-panel-scroll" data-launcher-blank-drop-id={blankDropId}>
        {contentReady ? (
          <div
            className="launcher-library-folder-panel-grid"
            style={{ gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX}px, 1fr))` }}
          >
            {items.map((displayItem) => {
              if (displayItem.kind === 'folder') {
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
                    />
                  </div>
                )
              }

              const item = displayItem.mod
              const childCount = displayItem.childMods.length
              return (
                <div key={`${displayItem.kind}-${item.id}`} className="launcher-library-grid-reveal">
                  <DraggableLauncherLibraryCard
                    item={item}
                    noneLabel={noneLabel}
                    latestVersionByModId={latestVersionByModId}
                    boxSelected={boxSelectionIdLookup.has(item.id)}
                    originFolderId={folder.id}
                    originParentId={null}
                    selectionMode={editMode}
                    selected={selectedIdLookup.has(item.id)}
                    childCount={childCount}
                    childCountLabel={childCount ? childCountLabel(childCount) : undefined}
                    expanded={childCount > 0 && isParentExpanded(item.id)}
                    expandLabel={childCount ? expandLabel(item.name) : undefined}
                    collapseLabel={childCount ? collapseLabel(item.name) : undefined}
                    onToggleParentExpanded={childCount ? onToggleParentExpanded : undefined}
                    onToggleSelection={editMode ? onToggleSelection : undefined}
                    onOpenModDetails={editMode ? undefined : onOpenModDetails}
                    onOpenModFolder={editMode ? undefined : onOpenModFolder}
                    getContextActions={editMode ? undefined : getContextActions}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="launcher-library-folder-panel-grid launcher-library-folder-panel-grid-pending" aria-hidden="true">
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
