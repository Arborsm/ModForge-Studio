import {
  createContext,
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
  type PointerEvent,
  type ReactNode,
} from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useSelectionContainer, boxesIntersect, type Box } from '@air/react-drag-to-select'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Folder } from 'lucide-react'
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
  LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE,
  LAUNCHER_LIBRARY_PARENT_DROP_PREFIX,
  getLauncherFolderIdFromBlankDropId,
  measureLauncherDndKitDropTargets,
  type LauncherDndKitActiveDrag,
  type LauncherDndKitDropData,
  type LauncherDndKitDropTarget,
  type LauncherPointerDragSource,
} from '../model/launcherLibraryDrag'

export type LauncherContextMenuAction = {
  label: string
  onSelect: () => void
}

type LauncherPointerDragContextValue = {
  startPointerDrag: (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => void
  suppressClickAfterDrag: (event: MouseEvent<HTMLElement>) => void
  handleDndPointerDown: (event: PointerEvent<HTMLElement>) => void
  setDraggableActivatorNodeRef: (node: HTMLElement | null) => void
}

type LauncherDndKitControls = {
  handleDndPointerDown: (event: PointerEvent<HTMLElement>) => void
  setDraggableActivatorNodeRef: (node: HTMLElement | null) => void
}

const LauncherPointerDragContext = createContext<LauncherPointerDragContextValue | null>(null)
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
  onToggleParentExpanded: (modId: string) => void
  isParentExpanded: (modId: string) => boolean
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  isLibraryFolderOpen: (folderId: string) => boolean
  onOpenLibraryFolder: (folderId: string) => void
  onCloseLibraryFolder?: (folderId: string) => void
  getFolderContextActions: (folder: LauncherVirtualFolder) => LauncherContextMenuAction[] | undefined
  getContextActions: (mod: LauncherLibraryItem) => LauncherContextMenuAction[] | undefined
}

const LAUNCHER_LIBRARY_GRID_GAP_PX = 20
const LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX = 260
const LAUNCHER_LIBRARY_CARD_ESTIMATED_HEIGHT_PX = 226
const LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT = 6
const LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX = 18

type LauncherLibraryGridRowItem = {
  displayItem: LauncherLibraryDisplayItem
  index: number
  columnSpan: number
  rowSpan: number
  columnStart: number
  rowStart: number
}

type LauncherLibraryGridBlock = {
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

function startLauncherGrabPending(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>, disabled = false) {
  if (event.button !== 0 || disabled) {
    return
  }

  const node = event.currentTarget
  if (node.classList.contains('launcher-library-card-grab-pending')) {
    return
  }

  node.classList.add('launcher-library-card-grab-pending')
  const clearGrabPending = () => {
    node.classList.remove('launcher-library-card-grab-pending')
    window.removeEventListener('pointerup', clearGrabPending)
    window.removeEventListener('pointercancel', clearGrabPending)
    window.removeEventListener('blur', clearGrabPending)
  }

  window.addEventListener('pointerup', clearGrabPending)
  window.addEventListener('pointercancel', clearGrabPending)
  window.addEventListener('blur', clearGrabPending)
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
  const estimatedRowHeight = LAUNCHER_LIBRARY_CARD_ESTIMATED_HEIGHT_PX
  const gridBlocks = useMemo(() => {
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
      const rowCount = Math.max(
        1,
        Math.min(
          LAUNCHER_LIBRARY_VIRTUAL_GRID_BLOCK_ROW_COUNT,
          Math.max(0, occupiedRows.length - rowStart),
          ...blockItems.map((item) => item.rowStart + item.rowSpan - rowStart),
        ),
      )
      return {
        items: blockItems,
        rowStart,
        rowCount,
        estimatedHeight: rowCount * estimatedRowHeight + Math.max(0, rowCount - 1) * LAUNCHER_LIBRARY_GRID_GAP_PX,
      }
    }).filter((block) => block.items.length > 0)
  }, [estimatedRowHeight, gridColumnCount, isLibraryFolderOpen, items])
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns imperative row measurement for the large launcher grid.
  const rowVirtualizer = useVirtualizer({
    count: gridBlocks.length,
    getScrollElement: () => viewportElement,
    estimateSize: (index) => (gridBlocks[index]?.estimatedHeight ?? estimatedRowHeight) + LAUNCHER_LIBRARY_GRID_GAP_PX,
    overscan: 4,
  })
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

  useEffect(() => {
    const viewport = viewportRef.current
    const grid = gridRef.current
    if (!viewport) {
      setGridColumnCount(1)
      return
    }

    const updateGridColumnCount = () => {
      const viewportWidth = viewport.getBoundingClientRect().width
      const nextColumnCount = Math.max(
        1,
        Math.floor((viewportWidth + LAUNCHER_LIBRARY_GRID_GAP_PX) / (cardMinWidth + LAUNCHER_LIBRARY_GRID_GAP_PX)),
      )
      setGridColumnCount((current) => (current === nextColumnCount ? current : nextColumnCount))
    }

    updateGridColumnCount()

    if (!shouldRevealItems || !grid) {
      setRevealBatchSize(clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length))
      return
    }

    const measuredGrid = grid

    const updateRevealBatchSize = () => {
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

    updateRevealBatchSize()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      updateGridColumnCount()
      updateRevealBatchSize()
    })
    resizeObserver.observe(viewport)
    return () => resizeObserver.disconnect()
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
          const blockItems = block?.items ?? []
          const blockRowStart = block?.rowStart ?? 0
          const blockRowCount = block?.rowCount ?? 1
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              className="launcher-library-virtual-row launcher-library-virtual-grid-block"
              data-index={virtualRow.index}
              style={{
                transform: `translateY(${virtualRow.start + LAUNCHER_LIBRARY_VIRTUAL_GRID_TOP_PADDING_PX}px)`,
                gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${LAUNCHER_LIBRARY_CARD_MIN_WIDTH_PX}px, 1fr))`,
                gridTemplateRows: `repeat(${blockRowCount}, ${LAUNCHER_LIBRARY_CARD_ESTIMATED_HEIGHT_PX}px)`,
              }}
            >
              {blockItems.map(({ displayItem, index, columnSpan, rowSpan, columnStart, rowStart }) => {
                const blockRelativeRowStart = rowStart - blockRowStart
                if (displayItem.kind === 'folder') {
                  const folderOpen = isLibraryFolderOpen(displayItem.folder.id)
                  const folderItems = openFolderItemsById?.get(normalizeLookupKey(displayItem.folder.id)) ?? []
                  return (
                    <Fragment key={`folder-group-${displayItem.folder.id}`}>
                      {!folderOpen && shouldRevealItems ? (
                        <LoadingMotionRevealItem
                          key={`folder-${displayItem.folder.id}`}
                          index={Math.floor(index / revealBatchSize) + 3}
                          className="launcher-library-grid-reveal"
                        >
                          <DraggableLauncherFolderCard
                            folder={displayItem.folder}
                            mods={displayItem.mods}
                            childFolders={displayItem.childFolders}
                            countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                            openLabel={openFolderLabel(displayItem.folder.name)}
                            contextActions={getFolderContextActions(displayItem.folder)}
                            onOpen={() => onOpenLibraryFolder(displayItem.folder.id)}
                          />
                        </LoadingMotionRevealItem>
                      ) : null}
                      {!folderOpen && !shouldRevealItems ? (
                        <div key={`folder-${displayItem.folder.id}`} className="launcher-library-grid-reveal">
                          <DraggableLauncherFolderCard
                            folder={displayItem.folder}
                            mods={displayItem.mods}
                            childFolders={displayItem.childFolders}
                            countLabel={folderCountLabel(displayItem.mods.length + displayItem.childFolders.length)}
                            openLabel={openFolderLabel(displayItem.folder.name)}
                            contextActions={getFolderContextActions(displayItem.folder)}
                            onOpen={() => onOpenLibraryFolder(displayItem.folder.id)}
                          />
                        </div>
                      ) : null}
                      {folderOpen ? (
                        <LauncherLibraryFolderPanel
                          folder={displayItem.folder}
                          items={folderItems}
                          itemCount={displayItem.mods.length + displayItem.childFolders.length}
                          contentReady={Boolean(openFolderItemsById?.has(normalizeLookupKey(displayItem.folder.id)))}
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
                const childCount = displayItem.kind === 'mod' ? displayItem.childMods.length : 0
                const expanded = childCount > 0 && isParentExpanded(item.id)
                const content = (
                  <>
                    {displayItem.kind === 'child' ? <span className="launcher-library-child-branch" aria-hidden="true" /> : null}
                    <DraggableLauncherLibraryCard
                      item={item}
                      noneLabel={noneLabel}
                      latestVersionByModId={latestVersionByModId}
                      boxSelected={boxSelectionIdLookup.has(item.id)}
                      originFolderId={originFolderId}
                      originParentId={displayItem.kind === 'child' ? displayItem.parentMod.id : null}
                      selectionMode={editMode}
                      selected={selectedIdLookup.has(item.id)}
                      childCount={childCount}
                      childCountLabel={childCount ? childCountLabel(childCount) : undefined}
                      expanded={expanded}
                      expandLabel={childCount ? expandLabel(item.name) : undefined}
                      collapseLabel={childCount ? collapseLabel(item.name) : undefined}
                      onToggleExpanded={childCount ? () => onToggleParentExpanded(item.id) : undefined}
                      onSelect={editMode ? () => onToggleSelection(item.id) : undefined}
                      onOpenDetails={editMode ? undefined : () => onOpenModDetails(item.id)}
                      onOpenDirectTarget={editMode ? undefined : () => onOpenModFolder(item)}
                      contextActions={editMode ? undefined : getContextActions(item)}
                    />
                  </>
                )
                if (!shouldRevealItems) {
                  return (
                    <div
                      key={`${displayItem.kind}-${item.id}`}
                      className={cx('launcher-library-grid-reveal', displayItem.kind === 'child' && 'launcher-library-grid-reveal-child')}
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
                    className={cx('launcher-library-grid-reveal', displayItem.kind === 'child' && 'launcher-library-grid-reveal-child')}
                    style={{ gridColumnStart: columnStart + 1, gridRowStart: blockRelativeRowStart + 1 }}
                  >
                    {content}
                  </LoadingMotionRevealItem>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})

function DraggableLauncherLibraryCard({
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
  onToggleExpanded,
  onSelect,
  onOpenDetails,
  onOpenDirectTarget,
  contextActions,
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
  onToggleExpanded?: () => void
  onSelect?: () => void
  onOpenDetails?: () => void
  onOpenDirectTarget?: () => void
  contextActions?: LauncherContextMenuAction[]
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const cover = useLauncherImage(item.imageUrl)
  const meta = buildLibraryCardMeta(item, noneLabel)
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
        startLauncherGrabPending(event, selectionMode)
        pointerDrag?.startPointerDrag(dragSource, event)
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
        onToggleExpanded={onToggleExpanded}
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
        onOpenDirectTarget={onOpenDirectTarget}
        contextActions={contextActions}
      />
    </div>
  )
}

function DraggableLauncherFolderCard({
  folder,
  mods,
  childFolders,
  countLabel,
  openLabel,
  contextActions,
  onOpen,
}: {
  folder: LauncherVirtualFolder
  mods: LauncherLibraryItem[]
  childFolders: LauncherVirtualFolder[]
  countLabel: string
  openLabel: string
  contextActions?: LauncherContextMenuAction[]
  onOpen: () => void
}) {
  const pointerDrag = useContext(LauncherPointerDragContext)
  const previewItems = buildLauncherFolderPreviewItems(mods, childFolders)
  const previewCount = Math.min(4, previewItems.length)
  const previewKind = previewCount === 1 ? previewItems[0]?.kind : previewCount === 0 ? 'empty' : 'mixed'
  const emptyPreviewItems = Array.from({ length: 4 }, (_, index) => index)
  const tone = getLauncherFolderTone(folder.id)
  const dragSource: LauncherPointerDragSource = { kind: 'folder', folderId: folder.id, title: folder.name, previewItems }

  const card = (
    <button
      type="button"
      className="launcher-library-folder-card launcher-library-draggable-card"
      data-draggable="true"
      data-folder-tone={tone}
      aria-label={openLabel}
      data-launcher-folder-drop-id={folder.id}
      onPointerDownCapture={(event) => {
        pointerDrag?.setDraggableActivatorNodeRef(event.currentTarget)
        startLauncherGrabPending(event)
        pointerDrag?.startPointerDrag(dragSource, event)
      }}
      onPointerDown={(event) => pointerDrag?.handleDndPointerDown(event)}
      onClickCapture={(event) => pointerDrag?.suppressClickAfterDrag(event)}
      onClick={onOpen}
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

  if (!contextActions?.length) {
    return card
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          {contextActions.map((action) => (
            <LauncherContextMenuItem key={action.label} action={action} />
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function LauncherFolderPreviewModItem({ item }: { item: LauncherFolderPreviewItem }) {
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
}

function LauncherContextMenuItem({ action }: { action: LauncherContextMenuAction }) {
  const handledRef = useRef(false)
  const runAction = () => {
    if (handledRef.current) {
      return
    }
    handledRef.current = true
    action.onSelect()
    window.setTimeout(() => {
      handledRef.current = false
    }, 250)
  }

  return (
    <ContextMenu.Item asChild onSelect={(event) => event.preventDefault()}>
      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onPointerDown={runAction}
        onPointerUp={runAction}
        onClick={runAction}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            runAction()
          }
        }}
      >
        {action.label}
      </button>
    </ContextMenu.Item>
  )
}

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

  const panel = (
    <section
      className="launcher-library-folder-panel"
      role="region"
      aria-label={folder.name}
      data-folder-tone={getLauncherFolderTone(folder.id)}
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
                      contextActions={getFolderContextActions(displayItem.folder)}
                      onOpen={() => onOpenLibraryFolder(displayItem.folder.id)}
                    />
                  </div>
                )
              }

              const item = displayItem.mod
              const childCount = displayItem.kind === 'mod' ? displayItem.childMods.length : 0
              return (
                <div
                  key={`${displayItem.kind}-${item.id}`}
                  className={cx('launcher-library-grid-reveal', displayItem.kind === 'child' && 'launcher-library-grid-reveal-child')}
                >
                  {displayItem.kind === 'child' ? <span className="launcher-library-child-branch" aria-hidden="true" /> : null}
                  <DraggableLauncherLibraryCard
                    item={item}
                    noneLabel={noneLabel}
                    latestVersionByModId={latestVersionByModId}
                    boxSelected={boxSelectionIdLookup.has(item.id)}
                    originFolderId={folder.id}
                    originParentId={displayItem.kind === 'child' ? displayItem.parentMod.id : null}
                    selectionMode={editMode}
                    selected={selectedIdLookup.has(item.id)}
                    childCount={childCount}
                    childCountLabel={childCount ? childCountLabel(childCount) : undefined}
                    expanded={childCount > 0 && isParentExpanded(item.id)}
                    expandLabel={childCount ? expandLabel(item.name) : undefined}
                    collapseLabel={childCount ? collapseLabel(item.name) : undefined}
                    onToggleExpanded={childCount ? () => onToggleParentExpanded(item.id) : undefined}
                    onSelect={editMode ? () => onToggleSelection(item.id) : undefined}
                    onOpenDetails={editMode ? undefined : () => onOpenModDetails(item.id)}
                    onOpenDirectTarget={editMode ? undefined : () => onOpenModFolder(item)}
                    contextActions={editMode ? undefined : getContextActions(item)}
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

  const contextActions = getFolderContextActions(folder)
  if (!contextActions?.length) {
    return panel
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{panel}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          {contextActions.map((action) => (
            <LauncherContextMenuItem key={action.label} action={action} />
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function LauncherDragPreview({ source, count, pending = false }: { source: LauncherPointerDragSource; count: number; pending?: boolean }) {
  if (source.kind === 'folder') {
    const previewItems = source.previewItems.slice(0, 4)
    const previewKind = previewItems.length === 1 ? previewItems[0]?.kind : previewItems.length === 0 ? 'empty' : 'mixed'
    return (
      <div
        className={cx(
          'launcher-library-drag-preview launcher-library-pointer-drag-preview launcher-library-folder-drag-preview',
          pending && 'launcher-library-pointer-drag-preview-pending',
        )}
        data-testid="launcher-library-drag-preview"
        aria-hidden="true"
      >
        <span
          className="launcher-library-folder-drag-preview-grid"
          data-preview-count={previewItems.length}
          data-preview-kind={previewKind}
        >
          {previewItems.length
            ? previewItems.map((item) => (
                <span
                  key={item.id}
                  className={cx(
                    'launcher-library-folder-drag-preview-tile',
                    item.kind === 'folder' && 'launcher-library-folder-drag-preview-folder-tile',
                  )}
                >
                  {item.kind === 'mod' && item.imageUrl ? (
                    <img src={item.imageUrl} alt="" draggable={false} />
                  ) : item.kind === 'folder' ? (
                    <span className="launcher-library-folder-drag-preview-folder-glyph" />
                  ) : (
                    item.title.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))
            : Array.from({ length: 4 }, (_, index) => (
                <span
                  key={`placeholder-${index}`}
                  className="launcher-library-folder-drag-preview-tile launcher-library-folder-drag-preview-placeholder"
                />
              ))}
        </span>
        <span>{source.title}</span>
      </div>
    )
  }

  return (
    <div
      className={cx(
        'launcher-library-drag-preview launcher-library-pointer-drag-preview',
        pending && 'launcher-library-pointer-drag-preview-pending',
      )}
      data-testid="launcher-library-drag-preview"
      aria-hidden="true"
    >
      <div className={cx('launcher-library-mod-drag-preview-card', !source.enabled && 'launcher-library-mod-drag-preview-card-disabled')}>
        {source.previewImageUrl ? (
          <img src={source.previewImageUrl} alt="" draggable={false} />
        ) : (
          <span className="launcher-library-mod-drag-preview-fallback">{source.title.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="launcher-library-mod-drag-preview-copy">
          <strong>{source.title}</strong>
          <span>{source.meta}</span>
        </span>
      </div>
      {count > 1 ? <span className="launcher-library-drag-preview-count">{count}</span> : null}
    </div>
  )
}

function LauncherPendingDragPreview({ drag }: { drag: LauncherDndKitActiveDrag }) {
  return (
    <div
      className="launcher-library-pending-drag-preview-layer"
      style={{
        transform: `translate3d(${drag.latestX}px, ${drag.latestY}px, 0)`,
      }}
    >
      <LauncherDragPreview source={drag.source} count={drag.modIds.length} pending={!drag.started} />
    </div>
  )
}

function LauncherDndKitDropTargetLayer({ targets }: { targets: LauncherDndKitDropTarget[] }) {
  return (
    <div className="launcher-library-dnd-target-layer" aria-hidden="true">
      {targets.map((target) => (
        <LauncherDndKitDropTargetBox key={target.dropId} target={target} />
      ))}
    </div>
  )
}

function LauncherDndKitDropTargetBox({ target }: { target: LauncherDndKitDropTarget }) {
  const { setNodeRef } = useDroppable({
    id: target.dropId,
    data: { dropId: target.dropId } satisfies LauncherDndKitDropData,
  })

  return (
    <span
      ref={setNodeRef}
      className="launcher-library-dnd-target-box"
      style={{
        left: target.rect.left,
        top: target.rect.top,
        width: target.rect.width,
        height: target.rect.height,
      }}
    />
  )
}

function LauncherLibraryDndBridge({
  onControlsChange,
  dropTargets,
  pendingOverlay,
  activeOverlay,
}: {
  onControlsChange: (controls: LauncherDndKitControls | null) => void
  dropTargets: LauncherDndKitDropTarget[]
  pendingOverlay: LauncherDndKitActiveDrag | null
  activeOverlay: LauncherDndKitActiveDrag | null
}) {
  const {
    listeners: draggableListeners,
    setActivatorNodeRef,
    setNodeRef: setDraggableNodeRef,
  } = useDraggable({
    id: LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
  })
  const draggableListenersRef = useRef(draggableListeners)

  useEffect(() => {
    draggableListenersRef.current = draggableListeners
  }, [draggableListeners])

  const handleDndPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    draggableListenersRef.current?.onPointerDown?.(event)
  }, [])

  useEffect(() => {
    const controls = {
      handleDndPointerDown,
      setDraggableActivatorNodeRef: (node: HTMLElement | null) => {
        setActivatorNodeRef(node)
        setDraggableNodeRef(node)
      },
    }
    onControlsChange(controls)
    return () => onControlsChange(null)
  }, [handleDndPointerDown, onControlsChange, setActivatorNodeRef, setDraggableNodeRef])

  return (
    <>
      <LauncherDndKitDropTargetLayer targets={dropTargets} />
      {pendingOverlay ? <LauncherPendingDragPreview drag={pendingOverlay} /> : null}
      <DragOverlay dropAnimation={null} zIndex={80}>
        {activeOverlay ? <LauncherDragPreview source={activeOverlay.source} count={activeOverlay.modIds.length} /> : null}
      </DragOverlay>
    </>
  )
}

export function LauncherLibraryDndScope({
  children,
  resolveDraggedModIds,
  onAddModsToPack,
  onAssignModsToParent,
  onAssignModsToLibraryFolder,
  onRemoveChildModsFromParent,
  onRemoveModsFromLibraryFolders,
  onReleaseModsFromLibraryFolder,
  onMoveFolderToFolder,
}: {
  children: ReactNode
  resolveDraggedModIds: (modId: string) => string[]
  onAddModsToPack: (packId: string, modIds: string[]) => void
  onAssignModsToParent: (parentModId: string, modIds: string[]) => void
  onAssignModsToLibraryFolder: (folderId: string, modIds: string[]) => void
  onRemoveChildModsFromParent: (modIds: string[]) => void
  onRemoveModsFromLibraryFolders: (modIds: string[]) => void
  onReleaseModsFromLibraryFolder: (modIds: string[]) => void
  onMoveFolderToFolder: (folderId: string, parentFolderId: string | null) => void
}) {
  const pendingDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const activeDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const suppressClickRef = useRef<{ element: HTMLElement; expiresAt: number } | null>(null)
  const [pendingOverlay, setPendingOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [activeOverlay, setActiveOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [dropTargets, setDropTargets] = useState<LauncherDndKitDropTarget[]>([])
  const [dndKitControls, setDndKitControls] = useState<LauncherDndKitControls | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX } }))
  const measuring = useMemo(
    () => ({
      droppable: {
        strategy: MeasuringStrategy.BeforeDragging,
      },
    }),
    [],
  )

  const activatePendingDrag = useCallback(() => {
    const drag = pendingDragRef.current
    if (!drag || activeDragRef.current) {
      return null
    }
    const activeDrag = { ...drag, started: true }
    activeDragRef.current = activeDrag
    pendingDragRef.current = null
    setPendingOverlay(null)
    setActiveOverlay(activeDrag)
    setDropTargets(measureLauncherDndKitDropTargets(drag.sourceElement))
    return activeDrag
  }, [])

  const finishPointerDrag = useCallback(
    (cancelled = false, overDropId?: string | null) => {
      const drag = activeDragRef.current ?? pendingDragRef.current
      activeDragRef.current = null
      pendingDragRef.current = null
      setActiveOverlay(null)
      setPendingOverlay(null)
      setDropTargets([])
      if (!drag || cancelled) {
        return
      }
      if (!drag.started) {
        return
      }
      suppressClickRef.current = { element: drag.sourceElement, expiresAt: Date.now() + 500 }

      const effectiveOverId = overDropId ?? null
      const modIds = drag.source.kind === 'mod' ? drag.modIds : []
      const folderDragId = drag.source.kind === 'folder' ? drag.source.folderId : null
      const originFolderId = drag.source.kind === 'mod' ? drag.source.originFolderId : null
      const targetFolderBlankId = effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
        ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
        : null
      const targetDropFolderId = effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX)
        ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX.length)
        : effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
          ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
          : null

      if (modIds.length && targetFolderBlankId && targetFolderBlankId !== originFolderId) {
        onAssignModsToLibraryFolder(targetFolderBlankId, modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originFolderId) {
        onReleaseModsFromLibraryFolder(modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originParentId) {
        onRemoveChildModsFromParent(modIds)
      } else if (modIds.length && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_PACK_DROP_PREFIX)) {
        onAddModsToPack(effectiveOverId.slice(LAUNCHER_LIBRARY_PACK_DROP_PREFIX.length), modIds)
      } else if (modIds.length && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_PARENT_DROP_PREFIX)) {
        onAssignModsToParent(effectiveOverId.slice(LAUNCHER_LIBRARY_PARENT_DROP_PREFIX.length), modIds)
      } else if (modIds.length && targetDropFolderId) {
        onAssignModsToLibraryFolder(targetDropFolderId, modIds)
      } else if (modIds.length && effectiveOverId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
        onRemoveChildModsFromParent(modIds)
        onRemoveModsFromLibraryFolders(modIds)
      } else if (folderDragId && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX)) {
        const targetFolderId = effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX.length)
        if (targetFolderId !== folderDragId) {
          onMoveFolderToFolder(folderDragId, targetFolderId)
        }
      } else if (folderDragId && effectiveOverId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
        onMoveFolderToFolder(folderDragId, null)
      }
    },
    [
      onAddModsToPack,
      onAssignModsToLibraryFolder,
      onAssignModsToParent,
      onMoveFolderToFolder,
      onRemoveChildModsFromParent,
      onRemoveModsFromLibraryFolders,
      onReleaseModsFromLibraryFolder,
    ],
  )

  const suppressClickAfterDrag = useCallback((event: MouseEvent<HTMLElement>) => {
    const suppressClick = suppressClickRef.current
    if (!suppressClick || Date.now() > suppressClick.expiresAt) {
      suppressClickRef.current = null
      return
    }
    if (event.currentTarget !== suppressClick.element) {
      return
    }
    suppressClickRef.current = null
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const startPointerDrag = useCallback(
    (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.buttons !== 1) {
        return
      }
      const modIds = source.kind === 'mod' ? resolveDraggedModIds(source.modId) : []
      const existingDrag = activeDragRef.current ?? pendingDragRef.current
      if (existingDrag?.sourceElement === event.currentTarget && !existingDrag.started) {
        setPendingOverlay((current) =>
          current?.sourceElement === event.currentTarget ? { ...current, latestX: event.clientX, latestY: event.clientY } : current,
        )
        return
      }
      const drag = {
        id: LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
        source,
        sourceElement: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        latestX: event.clientX,
        latestY: event.clientY,
        started: false,
        modIds,
      }
      pendingDragRef.current = drag
      setPendingOverlay(drag)
    },
    [resolveDraggedModIds],
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const drag = pendingDragRef.current
      if (!drag) {
        return
      }
      if (String(event.active.id) !== String(drag.id)) {
        return
      }
      activatePendingDrag()
    },
    [activatePendingDrag],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overDropId = (event.over?.data.current as LauncherDndKitDropData | undefined)?.dropId ?? String(event.over?.id ?? '')
      finishPointerDrag(false, overDropId || null)
    },
    [finishPointerDrag],
  )

  const handleDragCancel = useCallback(() => {
    finishPointerDrag(true)
  }, [finishPointerDrag])

  useEffect(() => {
    const cancelPendingDrag = () => {
      if (pendingDragRef.current) {
        pendingDragRef.current = null
        setPendingOverlay(null)
      }
    }
    const handleWindowBlur = () => finishPointerDrag(true)
    window.addEventListener('pointerup', cancelPendingDrag)
    window.addEventListener('pointercancel', cancelPendingDrag)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointerup', cancelPendingDrag)
      window.removeEventListener('pointercancel', cancelPendingDrag)
      window.removeEventListener('blur', handleWindowBlur)
      finishPointerDrag(true)
    }
  }, [finishPointerDrag])

  return (
    <LauncherPointerDragContext.Provider
      value={useMemo(
        () => ({
          startPointerDrag,
          suppressClickAfterDrag,
          handleDndPointerDown: (event: PointerEvent<HTMLElement>) => dndKitControls?.handleDndPointerDown(event),
          setDraggableActivatorNodeRef: (node: HTMLElement | null) => {
            dndKitControls?.setDraggableActivatorNodeRef(node)
          },
        }),
        [dndKitControls, startPointerDrag, suppressClickAfterDrag],
      )}
    >
      {children}
      <DndContext
        sensors={sensors}
        measuring={measuring}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <LauncherLibraryDndBridge
          onControlsChange={setDndKitControls}
          dropTargets={dropTargets}
          pendingOverlay={pendingOverlay}
          activeOverlay={activeOverlay}
        />
      </DndContext>
    </LauncherPointerDragContext.Provider>
  )
}
