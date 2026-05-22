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
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  ChevronDown,
  Folder,
  FolderArchive,
  FolderPlus,
  FolderOpen,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEditorCopy } from '@locales/localeContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import {
  inspectLauncherArchive,
  listLauncherInstallBackups,
  loadLauncherRemoteModDetail,
  openLauncherPath,
  resolveLauncherImage,
  restoreLauncherInstallBackup,
  setLauncherLibraryCover,
  type InspectLauncherArchiveResult,
  type InstallLauncherArchiveResult,
  type LauncherInstallBackupSummary,
} from '@features/launcher/api'
import {
  LAUNCHER_ARCHIVE_FILE_SUFFIXES,
  chooseArchiveFile,
  chooseImageFile,
  isSupportedLauncherArchivePath,
  listenToLauncherArchiveDragDrop,
  type UnlistenFn,
} from '@shared/lib/desktop'
import { cx } from '@shared/lib/cx'
import { LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { getLauncherCoverKey } from '@features/launcher/model/coverKey'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { buildChildModLookup, buildParentModLookup } from '@features/launcher/model/childModRelations'
import { getModKey, includesLibraryFilter, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type {
  LauncherLibraryItem,
  LauncherPackPreset,
  LauncherVirtualFolder,
  LauncherSettingsDraft,
  QueueLauncherDownloadInput,
} from '@features/launcher/model/types'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { LauncherArchiveInstallDialog } from '@features/launcher/ui/shared/LauncherArchiveInstallDialog'
import { LauncherInstallBackupsDialog } from '@features/launcher/ui/shared/LauncherInstallBackupsDialog'
import { LauncherInstallSummaryDialog } from '@features/launcher/ui/shared/LauncherInstallSummaryDialog'
import { LauncherStateBlock } from '@features/launcher/ui/shared/LauncherStateBlock'
import {
  LauncherChildModsDialogs,
  type LauncherChildModManagerState,
  type LauncherChildModPickerState,
} from '@features/launcher/ui/shared/LauncherChildModsDialogs'
import { LauncherModCard } from '@features/launcher/ui/cards/LauncherModCard'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'

type LauncherLibraryPageProps = {
  settings: LauncherSettingsDraft
  launchGameLabel: string
  launchGameDisabled: boolean
  launchGameBusy: boolean
  onLaunchGame: () => void
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
}

type LauncherLibraryPageContentProps = LauncherLibraryPageProps & {
  library: ReturnType<typeof useLauncherLibrary>
}

type ArchivePreviewState = 'idle' | 'loading' | 'ready' | 'error'
type InstallBackupsState = 'idle' | 'loading' | 'ready' | 'error'
type LibrarySortMode = 'name' | 'enabled-first' | 'pack'
type PackDialogState =
  | { kind: 'create'; value: string }
  | { kind: 'rename'; pack: LauncherPackPreset; value: string }
  | { kind: 'delete'; pack: LauncherPackPreset }
type FolderDialogState = { kind: 'rename'; folder: LauncherVirtualFolder; value: string }
type GalleryCoverDialogState = {
  mod: LauncherLibraryItem
  imageUrls: string[]
  selectedImageUrl: string
  applying: boolean
}
type LauncherLibraryDisplayItem =
  | { kind: 'mod'; mod: LauncherLibraryItem; childMods: LauncherLibraryItem[]; isChild: false }
  | { kind: 'child'; mod: LauncherLibraryItem; parentMod: LauncherLibraryItem }
  | { kind: 'folder'; folder: LauncherVirtualFolder; mods: LauncherLibraryItem[]; childFolders: LauncherVirtualFolder[] }
type LauncherFolderPreviewItem =
  | { kind: 'mod'; id: string; title: string; imageUrl: string | null }
  | { kind: 'folder'; id: string; title: string }

type DroppedArchivePaths = {
  supportedPaths: string[]
  missingPathCount: number
  unsupportedCount: number
}

const LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID = 'launcher-library-gallery-loading'
const LAUNCHER_LIBRARY_INSTALL_RESULT_AUTO_DISMISS_MS = 15_000
const LAUNCHER_LIBRARY_PARENT_DROP_PREFIX = 'launcher-parent:'
const LAUNCHER_LIBRARY_PACK_DROP_PREFIX = 'launcher-pack:'
const LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX = 'launcher-folder:'
const LAUNCHER_LIBRARY_BLANK_DROP_ID = 'launcher-library-blank'
const LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX = 'launcher-folder-blank:'
const LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE = 'data-launcher-parent-drop-id'
const LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX = 2
const LAUNCHER_LIBRARY_BOX_SELECTING_CLASS = 'launcher-library-draggable-card-box-selecting'

type LauncherPointerDragSource =
  | {
      kind: 'mod'
      modId: string
      title: string
      meta: string
      imageUrl: string | null
      previewImageUrl: string | null
      enabled: boolean
      originFolderId: string | null
      originParentId: string | null
    }
  | {
      kind: 'folder'
      folderId: string
      title: string
      previewItems: LauncherFolderPreviewItem[]
    }

type LauncherPointerDragContextValue = {
  startPointerDrag: (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => void
  suppressClickAfterDrag: (event: MouseEvent<HTMLElement>) => void
}

const LauncherPointerDragContext = createContext<LauncherPointerDragContextValue | null>(null)

type LauncherContextMenuAction = {
  label: string
  onSelect: () => void
}

type LauncherBoxSelectionCardRect = {
  id: string
  element: HTMLElement
  rect: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

type LauncherBoxSelectionState = {
  startX: number
  startY: number
  started: boolean
  latestX: number
  latestY: number
  animationFrame: number | null
  cardRects: LauncherBoxSelectionCardRect[]
  selectedIds: string[]
  highlightedElements: HTMLElement[]
  rectVisible: boolean
}

const shortenLibraryPath = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const normalized = value.replaceAll('/', '\\')
  const parts = normalized.split('\\').filter(Boolean)
  if (parts.length <= 3) {
    return normalized
  }

  return `...\\${parts.slice(-3).join('\\')}`
}

function splitDroppedArchivePaths(paths: string[] | undefined): DroppedArchivePaths {
  return (paths ?? []).reduce<DroppedArchivePaths>(
    (state, value) => {
      const nextPath = value.trim()
      if (!nextPath) {
        state.missingPathCount += 1
        return state
      }

      if (!isSupportedLauncherArchivePath(nextPath)) {
        state.unsupportedCount += 1
        return state
      }

      state.supportedPaths.push(nextPath)
      return state
    },
    {
      supportedPaths: [],
      missingPathCount: 0,
      unsupportedCount: 0,
    },
  )
}

function buildPackLookup(packPresets: LauncherPackPreset[]) {
  const lookup = new Map<string, LauncherPackPreset[]>()
  for (const pack of packPresets) {
    for (const modKey of pack.modKeys) {
      const normalized = normalizeLookupKey(modKey)
      if (!normalized) continue
      const existing = lookup.get(normalized)
      if (existing) existing.push(pack)
      else lookup.set(normalized, [pack])
    }
  }
  return lookup
}

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').localeCompare(right ?? '', undefined, { sensitivity: 'base' })
}

function sortLibraryMods(
  items: LauncherLibraryItem[],
  sortMode: LibrarySortMode,
  packLookup: Map<string, LauncherPackPreset[]>,
  currentPackId: string | null,
) {
  return [...items].sort((left, right) => {
    const leftKey = normalizeLookupKey(getModKey(left))
    const rightKey = normalizeLookupKey(getModKey(right))
    const leftPacks = packLookup.get(leftKey) ?? []
    const rightPacks = packLookup.get(rightKey) ?? []
    const leftPack =
      leftPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ?? leftPacks[0]?.name ?? ''
    const rightPack =
      rightPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ?? rightPacks[0]?.name ?? ''

    if (sortMode === 'enabled-first') {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
      return compareText(left.name, right.name)
    }
    if (sortMode === 'pack') return compareText(leftPack, rightPack) || compareText(left.name, right.name)
    return compareText(left.name, right.name)
  })
}

function buildLibraryCardMeta(mod: LauncherLibraryItem, noneLabel: string) {
  const author = mod.author?.trim()
  const version = mod.version?.trim()
  if (author && version) {
    return `${author} · v${version}`
  }
  if (author) {
    return author
  }
  if (version) {
    return `v${version}`
  }
  return noneLabel
}

function getPackModIds(pack: LauncherPackPreset | null, mods: LauncherLibraryItem[]) {
  if (!pack) {
    return []
  }

  const wantedKeys = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
  return mods.filter((item) => wantedKeys.has(normalizeLookupKey(getModKey(item)))).map((item) => item.id)
}

type VirtualizedLauncherGridProps = {
  items: LauncherLibraryDisplayItem[]
  blankDropId?: string
  openFolderItemsById?: Map<string, LauncherLibraryDisplayItem[]>
  latestVersionByModId?: Record<number, string>
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

const MAX_LIBRARY_REVEAL_BATCH_SIZE = 4
const TARGET_LIBRARY_REVEAL_WAVES = 4
const FALLBACK_LIBRARY_REVEAL_BATCH_SIZE = 2

function getLauncherFolderIdFromBlankDropId(blankDropId: string) {
  return blankDropId.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
    ? blankDropId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
    : null
}

function buildLauncherFolderPreviewItems(mods: LauncherLibraryItem[], childFolders: LauncherVirtualFolder[]): LauncherFolderPreviewItem[] {
  const previewMods = mods.slice(0, 4).map<LauncherFolderPreviewItem>((mod) => ({
    kind: 'mod',
    id: mod.id,
    title: mod.name,
    imageUrl: mod.imageUrl,
  }))
  const remainingPreviewSlots = Math.max(0, 4 - previewMods.length)
  const previewFolders = childFolders.slice(0, remainingPreviewSlots).map<LauncherFolderPreviewItem>((childFolder) => ({
    kind: 'folder',
    id: childFolder.id,
    title: childFolder.name,
  }))
  return [...previewMods, ...previewFolders]
}

function getLauncherFolderTone(folderId: string) {
  const tones = ['blue', 'teal', 'amber', 'rose', 'violet', 'slate'] as const
  let hash = 0
  for (const character of folderId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return tones[hash % tones.length]
}

function clampLibraryRevealBatchSize(value: number, itemCount: number) {
  if (itemCount <= 0) return 1
  return Math.max(1, Math.min(MAX_LIBRARY_REVEAL_BATCH_SIZE, itemCount, value))
}

function computeLibraryRevealBatchSize({
  itemCount,
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
}: {
  itemCount: number
  viewportWidth: number
  viewportHeight: number
  cardWidth: number
  cardHeight: number
}) {
  if (itemCount <= 0) return 1
  if (viewportWidth <= 0 || viewportHeight <= 0 || cardWidth <= 0 || cardHeight <= 0) {
    return clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, itemCount)
  }

  const visibleColumns = Math.max(1, Math.floor(viewportWidth / cardWidth))
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / cardHeight))
  const visibleItemCount = Math.min(itemCount, visibleColumns * visibleRows)
  return clampLibraryRevealBatchSize(Math.ceil(visibleItemCount / TARGET_LIBRARY_REVEAL_WAVES), itemCount)
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
    window.removeEventListener('mouseup', clearGrabPending)
    window.removeEventListener('blur', clearGrabPending)
  }

  window.addEventListener('pointerup', clearGrabPending)
  window.addEventListener('pointercancel', clearGrabPending)
  window.addEventListener('mouseup', clearGrabPending)
  window.addEventListener('blur', clearGrabPending)
}

function getLauncherDropIdFromPoint(clientX: number, clientY: number) {
  if (typeof document === 'undefined' || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null
  }

  const elementsFromPoint =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-launcher-folder-drop-id], [data-launcher-pack-drop-id], [data-launcher-parent-drop-id], [data-launcher-blank-drop-id]',
          ),
        ).filter((element) => {
          const rect = element.getBoundingClientRect()
          return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        })

  for (const element of elementsFromPoint) {
    const folderId = element instanceof HTMLElement ? element.getAttribute('data-launcher-folder-drop-id') : null
    if (folderId) {
      return `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}${folderId}`
    }

    const packId = element instanceof HTMLElement ? element.getAttribute('data-launcher-pack-drop-id') : null
    if (packId) {
      return `${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}${packId}`
    }

    const parentId = element instanceof HTMLElement ? element.getAttribute(LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE) : null
    if (parentId) {
      return `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}${parentId}`
    }
  }

  for (const element of elementsFromPoint) {
    const blankId = element instanceof HTMLElement ? element.getAttribute('data-launcher-blank-drop-id') : null
    if (blankId) {
      return blankId
    }
  }

  return null
}

function getLauncherBlankDropIdFromPoint(clientX: number, clientY: number) {
  if (typeof document === 'undefined' || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null
  }

  const elementsFromPoint =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : Array.from(document.querySelectorAll<HTMLElement>('[data-launcher-blank-drop-id]')).filter((element) => {
          const rect = element.getBoundingClientRect()
          return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        })

  for (const element of elementsFromPoint) {
    const blankId = element instanceof HTMLElement ? element.getAttribute('data-launcher-blank-drop-id') : null
    if (blankId) {
      return blankId
    }
  }

  return null
}

function rectsIntersect(
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
}

function buildLauncherBoxSelectionRect(startX: number, startY: number, currentX: number, currentY: number) {
  const left = Math.min(startX, currentX)
  const top = Math.min(startY, currentY)
  const width = Math.abs(currentX - startX)
  const height = Math.abs(currentY - startY)
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

const VirtualizedLauncherGrid = memo(function VirtualizedLauncherGrid({
  items,
  blankDropId = LAUNCHER_LIBRARY_BLANK_DROP_ID,
  openFolderItemsById,
  latestVersionByModId = {},
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
  const [revealBatchSize, setRevealBatchSize] = useState(() =>
    clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length),
  )
  const selectedIdLookup = useMemo(
    () => new Set(editMode ? editingSelectionIds : boxSelectionIds),
    [boxSelectionIds, editMode, editingSelectionIds],
  )
  const boxSelectionIdLookup = useMemo(() => new Set(boxSelectionIds), [boxSelectionIds])
  const boxSelectionVisualRef = useRef<HTMLSpanElement | null>(null)
  const boxSelectRef = useRef<LauncherBoxSelectionState | null>(null)
  const originFolderId = getLauncherFolderIdFromBlankDropId(blankDropId)

  const updateBoxSelectionVisual = useCallback((left: number, top: number, width: number, height: number) => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    let visual = boxSelectionVisualRef.current
    if (!visual) {
      visual = document.createElement('span')
      visual.className = 'launcher-library-box-select'
      visual.dataset.testid = 'launcher-library-box-select'
      visual.setAttribute('aria-hidden', 'true')
      viewport.appendChild(visual)
      boxSelectionVisualRef.current = visual
    }
    visual.style.left = `${left}px`
    visual.style.top = `${top}px`
    visual.style.width = `${Math.max(2, width)}px`
    visual.style.height = `${Math.max(2, height)}px`
  }, [])

  const clearBoxSelectionHighlights = useCallback((boxSelect: LauncherBoxSelectionState | null) => {
    if (!boxSelect) {
      return
    }
    for (const element of boxSelect.highlightedElements) {
      element.classList.remove(LAUNCHER_LIBRARY_BOX_SELECTING_CLASS)
    }
    boxSelect.highlightedElements = []
  }, [])

  const updateBoxSelection = useCallback(
    (clientX: number, clientY: number, options?: { measureCards?: boolean }) => {
      const boxSelect = boxSelectRef.current
      const viewport = viewportRef.current
      const grid = gridRef.current
      if (!boxSelect || !viewport || !grid) {
        return
      }

      const selectionRect = buildLauncherBoxSelectionRect(boxSelect.startX, boxSelect.startY, clientX, clientY)
      const viewportRect = viewport.getBoundingClientRect()
      const visualRect = {
        left: selectionRect.left - viewportRect.left + viewport.scrollLeft,
        top: selectionRect.top - viewportRect.top + viewport.scrollTop,
        width: selectionRect.width,
        height: selectionRect.height,
      }
      updateBoxSelectionVisual(visualRect.left, visualRect.top, visualRect.width, visualRect.height)
      boxSelect.rectVisible = true

      if (options?.measureCards || boxSelect.cardRects.length === 0) {
        boxSelect.cardRects = Array.from(grid.querySelectorAll<HTMLElement>('[data-launcher-mod-card-id]'))
          .map((element) => {
            const id = element.getAttribute('data-launcher-mod-card-id')
            if (!id) {
              return null
            }
            const rect = element.getBoundingClientRect()
            return {
              id,
              element,
              rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              },
            }
          })
          .filter((value): value is LauncherBoxSelectionCardRect => Boolean(value))
      }

      const selectedCards = boxSelect.cardRects.filter((card) => rectsIntersect(selectionRect, card.rect))
      boxSelect.selectedIds = selectedCards.map((card) => card.id)
      const nextElements = selectedCards.map((card) => card.element)
      const nextElementSet = new Set(nextElements)
      for (const element of boxSelect.highlightedElements) {
        if (!nextElementSet.has(element)) {
          element.classList.remove(LAUNCHER_LIBRARY_BOX_SELECTING_CLASS)
        }
      }
      for (const element of nextElements) {
        element.classList.add(LAUNCHER_LIBRARY_BOX_SELECTING_CLASS)
      }
      boxSelect.highlightedElements = nextElements
    },
    [updateBoxSelectionVisual],
  )

  const finishBoxSelection = useCallback(() => {
    const boxSelect = boxSelectRef.current
    if (boxSelect?.animationFrame != null) {
      window.cancelAnimationFrame(boxSelect.animationFrame)
    }
    clearBoxSelectionHighlights(boxSelect)
    boxSelectRef.current = null
    boxSelectionVisualRef.current?.remove()
    boxSelectionVisualRef.current = null
  }, [clearBoxSelectionHighlights])

  const scheduleBoxSelectionUpdate = useCallback(
    (clientX: number, clientY: number) => {
      const boxSelect = boxSelectRef.current
      if (!boxSelect) {
        return
      }
      boxSelect.latestX = clientX
      boxSelect.latestY = clientY
      if (boxSelect.animationFrame != null) {
        return
      }
      boxSelect.animationFrame = window.requestAnimationFrame(() => {
        const current = boxSelectRef.current
        if (!current) {
          return
        }
        current.animationFrame = null
        updateBoxSelection(current.latestX, current.latestY)
      })
    },
    [updateBoxSelection],
  )

  const handleBoxSelectionPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (editMode || event.button !== 0 || (event.pointerType === 'mouse' && event.buttons !== 1)) {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement) || target.closest('.launcher-library-draggable-card')) {
        return
      }
      boxSelectRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        latestX: event.clientX,
        latestY: event.clientY,
        animationFrame: null,
        cardRects: [],
        selectedIds: [],
        highlightedElements: [],
        rectVisible: false,
      }
      const viewportRect = event.currentTarget.getBoundingClientRect()
      updateBoxSelectionVisual(
        event.clientX - viewportRect.left + event.currentTarget.scrollLeft,
        event.clientY - viewportRect.top + event.currentTarget.scrollTop,
        2,
        2,
      )
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [editMode, updateBoxSelectionVisual],
  )

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const boxSelect = boxSelectRef.current
      if (!boxSelect) {
        return
      }
      const distance = Math.hypot(event.clientX - boxSelect.startX, event.clientY - boxSelect.startY)
      if (!boxSelect.started) {
        if (distance < LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX) {
          return
        }
        boxSelect.started = true
        updateBoxSelection(event.clientX, event.clientY, { measureCards: true })
        event.preventDefault()
        return
      }
      scheduleBoxSelectionUpdate(event.clientX, event.clientY)
      event.preventDefault()
    }
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (!boxSelectRef.current) {
        return
      }
      if (!boxSelectRef.current.started) {
        onBoxSelectionChange([])
      } else {
        if (boxSelectRef.current.animationFrame != null) {
          window.cancelAnimationFrame(boxSelectRef.current.animationFrame)
          boxSelectRef.current.animationFrame = null
        }
        updateBoxSelection(event.clientX, event.clientY)
        onBoxSelectionChange(boxSelectRef.current.selectedIds)
      }
      finishBoxSelection()
    }
    const handlePointerCancel = () => {
      finishBoxSelection()
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('blur', handlePointerCancel)
      finishBoxSelection()
    }
  }, [finishBoxSelection, onBoxSelectionChange, scheduleBoxSelectionUpdate, updateBoxSelection])

  useEffect(() => {
    const viewport = viewportRef.current
    const grid = gridRef.current
    if (!viewport || !grid) {
      setRevealBatchSize(clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length))
      return
    }

    const updateRevealBatchSize = () => {
      const firstCard = grid.querySelector<HTMLElement>('.launcher-library-grid-reveal')
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

    const resizeObserver = new ResizeObserver(updateRevealBatchSize)
    resizeObserver.observe(viewport)
    return () => resizeObserver.disconnect()
  }, [items.length])

  return (
    <div
      ref={(node) => {
        viewportRef.current = node
      }}
      className={cx('launcher-library-grid-viewport', editMode && 'launcher-library-grid-viewport-editing')}
      data-launcher-blank-drop-id={blankDropId}
      onPointerDownCapture={handleBoxSelectionPointerDown}
    >
      <div ref={gridRef} className="launcher-library-grid">
        {items.map((displayItem, index) => {
          if (displayItem.kind === 'folder') {
            const folderOpen = isLibraryFolderOpen(displayItem.folder.id)
            const folderItems = openFolderItemsById?.get(normalizeLookupKey(displayItem.folder.id)) ?? []
            return (
              <Fragment key={`folder-group-${displayItem.folder.id}`}>
                {!folderOpen ? (
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
                {folderOpen ? (
                  <LauncherLibraryFolderPanel
                    folder={displayItem.folder}
                    items={folderItems}
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
                    onBoxSelectionChange={onBoxSelectionChange}
                    onToggleParentExpanded={onToggleParentExpanded}
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
              </Fragment>
            )
          }
          const item = displayItem.mod
          const childCount = displayItem.kind === 'mod' ? displayItem.childMods.length : 0
          const expanded = childCount > 0 && isParentExpanded(item.id)
          return (
            <LoadingMotionRevealItem
              key={`${displayItem.kind}-${item.id}`}
              index={Math.floor(index / revealBatchSize) + 3}
              className={cx('launcher-library-grid-reveal', displayItem.kind === 'child' && 'launcher-library-grid-reveal-child')}
            >
              {displayItem.kind === 'child' ? <span className="launcher-library-child-branch" aria-hidden="true" /> : null}
              <DraggableLauncherLibraryCard
                item={item}
                noneLabel={noneLabel}
                latestVersionByModId={latestVersionByModId}
                dropTarget={false}
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
            </LoadingMotionRevealItem>
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
  dropTarget,
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
  dropTarget: boolean
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
  return (
    <div
      className={cx('launcher-library-draggable-card', boxSelected && 'launcher-library-draggable-card-box-selected')}
      data-launcher-mod-card-id={item.id}
      {...(!selectionMode ? { [LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE]: item.id } : {})}
      onMouseDownCapture={(event) => startLauncherGrabPending(event, selectionMode)}
      onPointerDownCapture={(event) => {
        startLauncherGrabPending(event, selectionMode)
        pointerDrag?.startPointerDrag(
          {
            kind: 'mod',
            modId: item.id,
            title: item.name,
            meta,
            imageUrl: item.imageUrl,
            previewImageUrl: cover.imageUrl,
            enabled: item.enabled,
            originFolderId,
            originParentId,
          },
          event,
        )
      }}
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
        dropTarget={dropTarget}
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

  const card = (
    <button
      type="button"
      className="launcher-library-folder-card launcher-library-draggable-card"
      data-folder-tone={tone}
      aria-label={openLabel}
      data-launcher-folder-drop-id={folder.id}
      onMouseDownCapture={startLauncherGrabPending}
      onPointerDownCapture={(event) => {
        startLauncherGrabPending(event)
        pointerDrag?.startPointerDrag({ kind: 'folder', folderId: folder.id, title: folder.name, previewItems }, event)
      }}
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
  const image = useLauncherImage(item.kind === 'mod' ? item.imageUrl : null)
  const fallbackLabel = item.title.slice(0, 1).toUpperCase()

  if (item.kind === 'mod') {
    return (
      <span className="launcher-library-folder-preview-item">
        {image.imageUrl ? <img src={image.imageUrl} alt="" draggable={false} /> : <span>{fallbackLabel}</span>}
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
}: {
  folder: LauncherVirtualFolder
  items: LauncherLibraryDisplayItem[]
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
}) {
  const panel = (
    <section className="launcher-library-folder-panel" role="region" aria-label={folder.name}>
      <div className="launcher-library-folder-panel-header">
        <div>
          <h2 className="launcher-library-folder-panel-title">{folder.name}</h2>
          <p className="launcher-library-folder-panel-count">{folderCountLabel(items.length)}</p>
        </div>
        {onCloseLibraryFolder ? (
          <button
            type="button"
            className="launcher-library-icon-button"
            aria-label={closeFolderLabel}
            title={closeFolderLabel}
            onPointerDown={(event) => {
              event.stopPropagation()
              onCloseLibraryFolder(folder.id)
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onCloseLibraryFolder(folder.id)
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <VirtualizedLauncherGrid
        items={items}
        blankDropId={blankDropId}
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
        onBoxSelectionChange={onBoxSelectionChange}
        onToggleParentExpanded={onToggleParentExpanded}
        isParentExpanded={isParentExpanded}
        onOpenModDetails={onOpenModDetails}
        onOpenModFolder={onOpenModFolder}
        isLibraryFolderOpen={isLibraryFolderOpen}
        onOpenLibraryFolder={onOpenLibraryFolder}
        onCloseLibraryFolder={onCloseLibraryFolder}
        getFolderContextActions={getFolderContextActions}
        getContextActions={getContextActions}
      />
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

function DroppableLauncherPackRow({ pack, children }: { pack: LauncherPackPreset; children: (isDropTarget: boolean) => ReactNode }) {
  return (
    <div className="launcher-library-pack-drop-zone" data-launcher-pack-drop-id={pack.id}>
      {children(false)}
    </div>
  )
}

function createLauncherPointerDragPreview(source: LauncherPointerDragSource, count: number) {
  const preview = document.createElement('div')
  preview.className = 'launcher-library-drag-preview launcher-library-pointer-drag-preview'
  preview.setAttribute('data-testid', 'launcher-library-drag-preview')
  preview.setAttribute('aria-hidden', 'true')

  if (source.kind === 'folder') {
    preview.classList.add('launcher-library-folder-drag-preview')
    const icon = document.createElement('span')
    icon.className = 'launcher-library-folder-drag-preview-grid'
    const previewItems = source.previewItems.slice(0, 4)
    icon.dataset.previewCount = String(previewItems.length)
    icon.dataset.previewKind = previewItems.length === 1 ? previewItems[0]?.kind : previewItems.length === 0 ? 'empty' : 'mixed'
    for (const item of previewItems) {
      const tile = document.createElement('span')
      tile.className = cx(
        'launcher-library-folder-drag-preview-tile',
        item.kind === 'folder' && 'launcher-library-folder-drag-preview-folder-tile',
      )
      if (item.kind === 'mod' && item.imageUrl) {
        const image = document.createElement('img')
        image.src = item.imageUrl
        image.alt = ''
        image.draggable = false
        tile.append(image)
      } else if (item.kind === 'folder') {
        const folderGlyph = document.createElement('span')
        folderGlyph.className = 'launcher-library-folder-drag-preview-folder-glyph'
        tile.append(folderGlyph)
      } else {
        tile.textContent = item.title.slice(0, 1).toUpperCase()
      }
      icon.append(tile)
    }
    if (!previewItems.length) {
      for (let index = 0; index < 4; index += 1) {
        const placeholder = document.createElement('span')
        placeholder.className = 'launcher-library-folder-drag-preview-tile launcher-library-folder-drag-preview-placeholder'
        icon.append(placeholder)
      }
    }
    const label = document.createElement('span')
    label.textContent = source.title
    preview.append(icon, label)
    return preview
  }

  const card = document.createElement('div')
  card.className = cx('launcher-library-mod-drag-preview-card', !source.enabled && 'launcher-library-mod-drag-preview-card-disabled')
  if (source.previewImageUrl) {
    const image = document.createElement('img')
    image.src = source.previewImageUrl
    image.alt = ''
    image.draggable = false
    card.append(image)
  } else {
    const fallback = document.createElement('span')
    fallback.className = 'launcher-library-mod-drag-preview-fallback'
    fallback.textContent = source.title.slice(0, 1).toUpperCase()
    card.append(fallback)
  }
  const copy = document.createElement('span')
  copy.className = 'launcher-library-mod-drag-preview-copy'
  const title = document.createElement('strong')
  title.textContent = source.title
  const meta = document.createElement('span')
  meta.textContent = source.meta
  copy.append(title, meta)
  card.append(copy)
  preview.append(card)

  if (count > 1) {
    const countBadge = document.createElement('span')
    countBadge.className = 'launcher-library-drag-preview-count'
    countBadge.textContent = String(count)
    preview.append(countBadge)
  }

  return preview
}

function positionLauncherPointerDragPreview(preview: HTMLElement, clientX: number, clientY: number) {
  preview.style.transform = `translate3d(${clientX + 12}px, ${clientY + 12}px, 0)`
}

function LauncherLibraryDndScope({
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
  const activeDragRef = useRef<{
    source: LauncherPointerDragSource
    sourceElement: HTMLElement
    startX: number
    startY: number
    started: boolean
    preview: HTMLElement | null
    modIds: string[]
  } | null>(null)
  const suppressClickRef = useRef<{ element: HTMLElement; expiresAt: number } | null>(null)

  const finishPointerDrag = useCallback(
    (clientX: number, clientY: number, cancelled = false) => {
      const drag = activeDragRef.current
      activeDragRef.current = null
      drag?.preview?.remove()
      if (!drag || cancelled || !drag.started) {
        return
      }
      suppressClickRef.current = { element: drag.sourceElement, expiresAt: Date.now() + 500 }

      const effectiveOverId = getLauncherDropIdFromPoint(clientX, clientY)
      const modIds = drag.source.kind === 'mod' ? drag.modIds : []
      const folderDragId = drag.source.kind === 'folder' ? drag.source.folderId : null
      const originFolderId = drag.source.kind === 'mod' ? drag.source.originFolderId : null
      const folderBlankId = modIds.length ? getLauncherBlankDropIdFromPoint(clientX, clientY) : null
      const targetFolderBlankId = folderBlankId?.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
        ? folderBlankId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
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
      if (event.button !== 0 || (event.pointerType === 'mouse' && event.buttons !== 1)) {
        return
      }
      const modIds = source.kind === 'mod' ? resolveDraggedModIds(source.modId) : []
      const preview = createLauncherPointerDragPreview(source, modIds.length)
      preview.classList.add('launcher-library-pointer-drag-preview-pending')
      positionLauncherPointerDragPreview(preview, event.clientX, event.clientY)
      document.body.append(preview)
      activeDragRef.current = {
        source,
        sourceElement: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        preview,
        modIds,
      }
    },
    [resolveDraggedModIds],
  )

  useEffect(() => {
    const handleWindowBlur = () => finishPointerDrag(0, 0, true)
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const drag = activeDragRef.current
      if (!drag) {
        return
      }
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (!drag.started) {
        if (distance < LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX) {
          if (drag.preview) {
            positionLauncherPointerDragPreview(drag.preview, event.clientX, event.clientY)
          }
          return
        }
        drag.started = true
        drag.preview?.classList.remove('launcher-library-pointer-drag-preview-pending')
      }
      if (drag.preview) {
        positionLauncherPointerDragPreview(drag.preview, event.clientX, event.clientY)
      }
      event.preventDefault()
    }
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      finishPointerDrag(event.clientX, event.clientY)
    }
    const handlePointerCancel = (event: globalThis.PointerEvent) => {
      finishPointerDrag(event.clientX, event.clientY, true)
    }
    document.addEventListener('pointermove', handlePointerMove, { passive: false })
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
      finishPointerDrag(0, 0, true)
    }
  }, [finishPointerDrag])

  return (
    <LauncherPointerDragContext.Provider
      value={useMemo(() => ({ startPointerDrag, suppressClickAfterDrag }), [startPointerDrag, suppressClickAfterDrag])}
    >
      {children}
    </LauncherPointerDragContext.Provider>
  )
}

function GalleryCoverOption({ url, selected, label, onSelect }: { url: string; selected: boolean; label: string; onSelect: () => void }) {
  const image = useLauncherImage(url)

  return (
    <button
      type="button"
      className={cx('launcher-gallery-cover-option', selected && 'launcher-gallery-cover-option-selected')}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
    >
      <div className="launcher-gallery-cover-frame">
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-gallery-cover-image" /> : null}
        {!image.imageUrl ? <span className="launcher-gallery-cover-loading">{label}</span> : null}
      </div>
    </button>
  )
}

export function LauncherLibraryPageContent({
  settings,
  library,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
  onQueueDownload,
}: LauncherLibraryPageContentProps) {
  const editorCopy = useEditorCopy()
  const copy = editorCopy.launcher
  const {
    refresh,
    selectedModIds,
    toggleEnabled,
    addModsToPack,
    createPackPreset,
    renamePackPreset,
    deletePackPreset,
    replacePackMods,
    renameLibraryFolder,
    setModsEnabled,
  } = library

  const [archivePreviewState, setArchivePreviewState] = useState<ArchivePreviewState>('idle')
  const [archivePreviews, setArchivePreviews] = useState<InspectLauncherArchiveResult[]>([])
  const [selectedArchivePreviewPath, setSelectedArchivePreviewPath] = useState<string | null>(null)
  const [archivePreviewError, setArchivePreviewError] = useState<string | null>(null)
  const [installingArchive, setInstallingArchive] = useState(false)
  const [installResult, setInstallResult] = useState<InstallLauncherArchiveResult | null>(null)
  const [installBackupsOpen, setInstallBackupsOpen] = useState(false)
  const [installBackupsState, setInstallBackupsState] = useState<InstallBackupsState>('idle')
  const [installBackups, setInstallBackups] = useState<LauncherInstallBackupSummary[]>([])
  const [installBackupsError, setInstallBackupsError] = useState<string | null>(null)
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<LibrarySortMode>('name')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [detailModId, setDetailModId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false)
  const [packActionMenuId, setPackActionMenuId] = useState<string | null>(null)
  const [packDialog, setPackDialog] = useState<PackDialogState | null>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null)
  const [galleryCoverDialog, setGalleryCoverDialog] = useState<GalleryCoverDialogState | null>(null)
  const [hiddenViewOpen, setHiddenViewOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingSelectionIds, setEditingSelectionIds] = useState<string[]>([])
  const [boxSelectionIds, setBoxSelectionIds] = useState<string[]>([])
  const [archiveDropActive, setArchiveDropActive] = useState(false)
  const [expandedParentIds, setExpandedParentIds] = useState<string[]>([])
  const [childModManager, setChildModManager] = useState<LauncherChildModManagerState | null>(null)
  const [childModPicker, setChildModPicker] = useState<LauncherChildModPickerState | null>(null)
  const [openLibraryFolderIds, setOpenLibraryFolderIds] = useState<string[]>([])
  const lastEditSeedRef = useRef<{ editMode: boolean; packId: string | null }>({ editMode: false, packId: null })

  const titleMenuRef = useRef<HTMLDivElement | null>(null)
  const drawerPanelRef = useRef<HTMLDivElement | null>(null)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const packDialogInputRef = useRef<HTMLInputElement | null>(null)
  const lastLoadedModsPathRef = useRef<string | null>(settings.modsPath?.trim() || null)
  const installBackupsOpenRef = useRef(false)

  useEffect(() => {
    const nextModsPath = settings.modsPath?.trim() || null
    const modsPathChanged = lastLoadedModsPathRef.current !== nextModsPath
    if (modsPathChanged) {
      lastLoadedModsPathRef.current = nextModsPath
    }

    const shouldRefresh = modsPathChanged || (library.state === 'idle' && library.mods.length === 0 && !library.error)
    if (!shouldRefresh) {
      return
    }

    void refresh()
  }, [library.error, library.mods.length, library.state, refresh, settings.modsPath])

  useEffect(() => {
    installBackupsOpenRef.current = installBackupsOpen
  }, [installBackupsOpen])

  const packLookup = useMemo(() => buildPackLookup(library.packPresets), [library.packPresets])
  const childGroupLookup = useMemo(() => buildChildModLookup(library.childModGroups), [library.childModGroups])
  const childParentLookup = useMemo(() => buildParentModLookup(library.childModGroups), [library.childModGroups])
  const hiddenModKeyLookup = useMemo(
    () => new Set(library.hiddenModKeys.map((value) => normalizeLookupKey(value))),
    [library.hiddenModKeys],
  )
  const hiddenMods = useMemo(
    () => library.mods.filter((item) => hiddenModKeyLookup.has(normalizeLookupKey(getModKey(item)))),
    [hiddenModKeyLookup, library.mods],
  )
  const visibleLibraryModsCount = library.mods.length - hiddenMods.length
  const selectedDetailMod = useMemo(
    () => (detailModId ? (library.mods.find((item) => item.id === detailModId) ?? null) : null),
    [detailModId, library.mods],
  )
  const detailMod = detailModId ? selectedDetailMod : null

  useEffect(() => {
    const enteredEditMode = editMode && !lastEditSeedRef.current.editMode
    const changedPackWhileEditing = editMode && library.currentPackId !== lastEditSeedRef.current.packId

    if (enteredEditMode || changedPackWhileEditing) {
      setEditingSelectionIds(getPackModIds(library.currentPack, library.mods))
    }

    lastEditSeedRef.current = {
      editMode,
      packId: library.currentPackId,
    }
  }, [editMode, library.currentPack, library.currentPackId, library.mods])

  useEffect(() => {
    if (!quickSwitchOpen && !packActionMenuId && !sortMenuOpen) {
      return
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node
      if (titleMenuRef.current?.contains(target) || drawerPanelRef.current?.contains(target) || sortMenuRef.current?.contains(target)) {
        return
      }
      setQuickSwitchOpen(false)
      setPackActionMenuId(null)
      setSortMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [packActionMenuId, quickSwitchOpen, sortMenuOpen])

  useEffect(() => {
    if (!packDialog || packDialog.kind === 'delete') {
      return
    }

    const input = packDialogInputRef.current
    if (!input) {
      return
    }

    input.focus()
    input.select()
  }, [packDialog])

  const visibleMods = useMemo(() => {
    const browseScoped = hiddenViewOpen
      ? hiddenMods.filter((item) => includesLibraryFilter(item, library.filterText)).filter((item) => !library.enabledOnly || item.enabled)
      : editMode
        ? library.mods
            .filter((item) => includesLibraryFilter(item, library.filterText))
            .filter((item) => !library.enabledOnly || item.enabled)
        : library.filteredMods

    return sortLibraryMods(browseScoped, sortMode, packLookup, library.currentPackId)
  }, [
    editMode,
    hiddenMods,
    hiddenViewOpen,
    library.currentPackId,
    library.enabledOnly,
    library.filterText,
    library.filteredMods,
    library.mods,
    packLookup,
    sortMode,
  ])

  const modByKeyLookup = useMemo(() => {
    const lookup = new Map<string, LauncherLibraryItem>()
    for (const mod of library.mods) {
      lookup.set(normalizeLookupKey(getModKey(mod)), mod)
    }
    return lookup
  }, [library.mods])

  const libraryFolderModLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const folder of library.libraryFolders) {
      for (const modKey of folder.modKeys) {
        lookup.set(normalizeLookupKey(modKey), folder.id)
      }
    }
    return lookup
  }, [library.libraryFolders])

  const buildFolderDisplayItem = useCallback(
    (folder: LauncherVirtualFolder): LauncherLibraryDisplayItem => ({
      kind: 'folder',
      folder,
      mods: folder.modKeys
        .map((modKey) => modByKeyLookup.get(normalizeLookupKey(modKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item)),
      childFolders: library.libraryFolders.filter(
        (childFolder) => normalizeLookupKey(childFolder.parentFolderId ?? '') === normalizeLookupKey(folder.id),
      ),
    }),
    [library.libraryFolders, modByKeyLookup],
  )

  const visibleDisplayItems = useMemo<LauncherLibraryDisplayItem[]>(() => {
    const visibleKeyLookup = new Set(visibleMods.map((mod) => normalizeLookupKey(getModKey(mod))))
    const items: LauncherLibraryDisplayItem[] = []
    for (const folder of library.libraryFolders) {
      if (folder.parentFolderId) {
        continue
      }
      items.push(buildFolderDisplayItem(folder))
    }
    for (const mod of visibleMods) {
      const modLookup = normalizeLookupKey(getModKey(mod))
      if (libraryFolderModLookup.has(modLookup)) {
        continue
      }
      const parentKey = childParentLookup.get(modLookup)
      if (parentKey && visibleKeyLookup.has(normalizeLookupKey(parentKey))) {
        continue
      }

      const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
        .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item))
      items.push({ kind: 'mod', mod, childMods, isChild: false })

      if (!expandedParentIds.includes(mod.id)) {
        continue
      }

      for (const childMod of childMods) {
        items.push({ kind: 'child', mod: childMod, parentMod: mod })
      }
    }
    return items
  }, [
    buildFolderDisplayItem,
    childGroupLookup,
    childParentLookup,
    expandedParentIds,
    library.libraryFolders,
    libraryFolderModLookup,
    modByKeyLookup,
    visibleMods,
  ])

  const openLibraryFolderIdLookup = useMemo(() => new Set(openLibraryFolderIds.map((id) => normalizeLookupKey(id))), [openLibraryFolderIds])

  const isLibraryFolderOpen = useCallback(
    (folderId: string) => openLibraryFolderIdLookup.has(normalizeLookupKey(folderId)),
    [openLibraryFolderIdLookup],
  )

  const getLibraryFolderModIds = useCallback(
    (folder: LauncherVirtualFolder) => {
      const folderModLookup = new Set(folder.modKeys.map((value) => normalizeLookupKey(value)))
      return library.mods.filter((mod) => folderModLookup.has(normalizeLookupKey(getModKey(mod)))).map((mod) => mod.id)
    },
    [library.mods],
  )

  const openLibraryFolderItemsById = useMemo(() => {
    const itemsById = new Map<string, LauncherLibraryDisplayItem[]>()
    for (const folder of library.libraryFolders) {
      const folderLookup = normalizeLookupKey(folder.id)
      if (!openLibraryFolderIdLookup.has(folderLookup)) {
        continue
      }
      const folderModLookup = new Set(folder.modKeys.map((value) => normalizeLookupKey(value)))
      const childFolders = library.libraryFolders.filter(
        (candidate) => normalizeLookupKey(candidate.parentFolderId ?? '') === normalizeLookupKey(folder.id),
      )
      const items: LauncherLibraryDisplayItem[] = childFolders.map(buildFolderDisplayItem)
      for (const mod of visibleMods) {
        const modLookup = normalizeLookupKey(getModKey(mod))
        if (!folderModLookup.has(modLookup)) {
          continue
        }
        const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
          .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
          .filter((item): item is LauncherLibraryItem => Boolean(item))
        items.push({ kind: 'mod', mod, childMods, isChild: false })
      }
      itemsById.set(folderLookup, items)
    }
    return itemsById
  }, [buildFolderDisplayItem, childGroupLookup, library.libraryFolders, modByKeyLookup, openLibraryFolderIdLookup, visibleMods])

  const shortModsPath = useMemo(() => shortenLibraryPath(settings.modsPath), [settings.modsPath])
  const supportedArchiveFormatsLabel = useMemo(() => LAUNCHER_ARCHIVE_FILE_SUFFIXES.join(', '), [])
  const sortOptions = useMemo(
    () => [
      { value: 'name' as const, label: copy.library.sortByName },
      { value: 'enabled-first' as const, label: copy.library.sortByEnabled },
      { value: 'pack' as const, label: copy.library.sortByPack },
    ],
    [copy.library.sortByEnabled, copy.library.sortByName, copy.library.sortByPack],
  )
  const currentSortLabel = sortOptions.find((option) => option.value === sortMode)?.label ?? copy.library.sortByName

  const closeArchivePreview = useCallback(() => {
    setArchivePreviewState('idle')
    setArchivePreviews([])
    setSelectedArchivePreviewPath(null)
    setArchivePreviewError(null)
    setInstallingArchive(false)
  }, [])

  const closeInstallSummary = useCallback(() => {
    setInstallResult(null)
  }, [])

  const openInstallSummary = useCallback((result: InstallLauncherArchiveResult) => {
    setInstallBackupsOpen(false)
    setInstallBackupsError(null)
    setInstallResult(result)
  }, [])

  const publishArchiveInstallSuccess = useCallback(
    (result: InstallLauncherArchiveResult) => {
      publishNotification({
        level: 'success',
        title: copy.library.installSummaryTitle,
        summary: result.modName,
        description: copy.library.installSummaryInstalledMods(result.installedMods.length),
        action: {
          label: copy.actions.viewDetails,
          callback: () => openInstallSummary(result),
          tone: 'primary',
        },
        autoDismissMs: LAUNCHER_LIBRARY_INSTALL_RESULT_AUTO_DISMISS_MS,
      })
    },
    [copy.actions.viewDetails, copy.library, openInstallSummary],
  )

  const publishArchiveInstallError = useCallback(
    (error: unknown) => {
      publishNotification({
        level: 'error',
        title: copy.actions.installArchive,
        description: error instanceof Error ? error.message : copy.library.previewError,
      })
    },
    [copy.actions.installArchive, copy.library.previewError],
  )

  const publishArchiveDropError = useCallback(
    (description: string) => {
      publishNotification({
        level: 'error',
        title: copy.actions.installArchive,
        description,
      })
    },
    [copy.actions.installArchive],
  )

  const openArchivePreviewForPaths = useCallback(
    async (paths: string[]) => {
      setArchivePreviewState('loading')
      setArchivePreviews([])
      setSelectedArchivePreviewPath(null)
      setArchivePreviewError(null)

      const nextPreviews: InspectLauncherArchiveResult[] = []
      let firstError: string | null = null

      for (const path of paths) {
        try {
          nextPreviews.push(await inspectLauncherArchive({ archivePath: path }))
        } catch (nextError) {
          const description = nextError instanceof Error ? nextError.message : copy.library.previewError
          if (!firstError) {
            firstError = description
          }
          publishNotification({
            level: 'error',
            title: copy.library.previewTitle,
            description,
          })
        }
      }

      if (nextPreviews.length) {
        setArchivePreviews(nextPreviews)
        setSelectedArchivePreviewPath(nextPreviews[0]?.archivePath ?? null)
        setArchivePreviewState('ready')
        return
      }

      if (firstError) {
        setArchivePreviewState('idle')
        setArchivePreviews([])
        setSelectedArchivePreviewPath(null)
        setArchivePreviewError(firstError)
        return
      }

      setArchivePreviewState('idle')
      setArchivePreviews([])
      setSelectedArchivePreviewPath(null)
      setArchivePreviewError(null)
    },
    [copy.library.previewError, copy.library.previewTitle],
  )

  const openArchivePreviewForPath = useCallback(
    async (path: string) => {
      try {
        await openArchivePreviewForPaths([path])
      } catch (nextError) {
        setArchivePreviewState('idle')
        setArchivePreviews([])
        setSelectedArchivePreviewPath(null)
        setArchivePreviewError(null)
        publishNotification({
          level: 'error',
          title: copy.library.previewTitle,
          description: nextError instanceof Error ? nextError.message : copy.library.previewError,
        })
      }
    },
    [copy.library.previewError, copy.library.previewTitle, openArchivePreviewForPaths],
  )

  const closeInstallBackupsDialog = useCallback(() => {
    if (restoringBackupId) {
      return
    }
    setInstallBackupsOpen(false)
    setInstallBackupsError(null)
  }, [restoringBackupId])

  const loadInstallBackups = useCallback(async () => {
    setInstallBackupsOpen(true)
    setInstallBackupsState('loading')
    setInstallBackupsError(null)

    try {
      const backups = await listLauncherInstallBackups({
        modsPath: settings.modsPath,
      })
      setInstallBackups(backups)
      setInstallBackupsState('ready')
      return true
    } catch (nextError) {
      setInstallBackups([])
      setInstallBackupsState('error')
      setInstallBackupsError(nextError instanceof Error ? nextError.message : copy.library.installBackupsError)
      return false
    }
  }, [copy.library.installBackupsError, settings.modsPath])

  const openInstallBackupsDialog = useCallback(() => {
    void loadInstallBackups()
  }, [loadInstallBackups])

  const openInstallBackupsFromSummary = useCallback(() => {
    void loadInstallBackups().then((opened) => {
      if (opened && installBackupsOpenRef.current) {
        setInstallResult(null)
      }
    })
  }, [loadInstallBackups])

  const refreshLibrary = useCallback(async () => {
    setActionError(null)

    try {
      await refresh()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : copy.library.empty)
    }
  }, [copy.library.empty, refresh])

  const runLibraryAction = useCallback(
    async (action: () => Promise<void>) => {
      setActionError(null)
      try {
        await action()
        return true
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : copy.library.empty)
        return false
      }
    },
    [copy.library.empty],
  )

  const inspectArchive = async () => {
    const path = await chooseArchiveFile(copy.actions.chooseArchive)
    if (!path) {
      return
    }

    await openArchivePreviewForPath(path)
  }

  const confirmArchiveInstall = async () => {
    if (!archivePreviews.length) {
      return
    }

    setInstallingArchive(true)

    let successfulInstalls = 0

    try {
      for (const preview of archivePreviews) {
        try {
          const result = await library.installArchive(preview.archivePath)
          successfulInstalls += 1
          publishArchiveInstallSuccess(result)
        } catch (nextError) {
          publishArchiveInstallError(nextError)
        }
      }

      if (successfulInstalls > 0) {
        closeArchivePreview()
        void refreshLibrary()
      }
    } catch (nextError) {
      publishArchiveInstallError(nextError)
    } finally {
      setInstallingArchive(false)
    }
  }

  const handleDroppedArchives = useCallback(
    async (paths: string[] | undefined) => {
      const { supportedPaths, missingPathCount, unsupportedCount } = splitDroppedArchivePaths(paths)

      if (!supportedPaths.length) {
        if (missingPathCount > 0 && unsupportedCount === 0) {
          publishArchiveDropError(copy.library.dragDropMissingPath)
          return
        }

        publishArchiveDropError(copy.library.dragDropUnsupportedArchive(supportedArchiveFormatsLabel))
        return
      }

      if (missingPathCount > 0) {
        publishArchiveDropError(copy.library.dragDropSkippedMissingPaths(missingPathCount))
      }

      if (unsupportedCount > 0) {
        publishArchiveDropError(copy.library.dragDropSkippedUnsupportedArchives(unsupportedCount, supportedArchiveFormatsLabel))
      }

      await openArchivePreviewForPaths(supportedPaths)
    },
    [copy.library, openArchivePreviewForPaths, publishArchiveDropError, supportedArchiveFormatsLabel],
  )

  useEffect(() => {
    let cancelled = false
    let dispose: UnlistenFn | null = null

    void listenToLauncherArchiveDragDrop(async (payload) => {
      if (cancelled) {
        return
      }

      if (payload.type === 'leave') {
        setArchiveDropActive(false)
        return
      }

      if (payload.type === 'enter') {
        setArchiveDropActive(splitDroppedArchivePaths(payload.paths).supportedPaths.length > 0)
        return
      }

      if (payload.type === 'over') {
        return
      }

      setArchiveDropActive(false)

      await handleDroppedArchives(payload.paths)
    }).then((unlisten) => {
      if (cancelled) {
        unlisten()
        return
      }
      dispose = unlisten
    })

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [handleDroppedArchives])

  const restoreInstallBackupSession = useCallback(
    async (backupId: string) => {
      setInstallBackupsError(null)
      setRestoringBackupId(backupId)

      try {
        await restoreLauncherInstallBackup({
          backupId,
          modsPath: settings.modsPath,
        })
        setInstallResult(null)
        setInstallBackupsOpen(false)
        publishNotification({
          level: 'success',
          title: copy.library.restoreInstallBackup,
          description: backupId,
        })
        void refreshLibrary()
      } catch (nextError) {
        setInstallBackupsError(nextError instanceof Error ? nextError.message : copy.library.installBackupsError)
      } finally {
        setRestoringBackupId(null)
      }
    },
    [copy.library.installBackupsError, copy.library.restoreInstallBackup, refreshLibrary, settings.modsPath],
  )

  const openLibraryRoot = useCallback(
    () =>
      runLibraryAction(async () => {
        if (!settings.modsPath) {
          throw new Error(copy.states.missingModsPath)
        }
        await openLauncherPath({ path: settings.modsPath })
      }),
    [copy.states.missingModsPath, runLibraryAction, settings.modsPath],
  )

  const openModFolder = useCallback(
    (mod: LauncherLibraryItem) =>
      runLibraryAction(async () => {
        await openLauncherPath({ path: mod.absolutePath })
      }),
    [runLibraryAction],
  )

  const setModCover = useCallback(
    (mod: LauncherLibraryItem) =>
      runLibraryAction(async () => {
        const imagePath = await chooseImageFile(copy.actions.setCover)
        if (!imagePath) {
          return
        }
        await setLauncherLibraryCover({ labelKey: getLauncherCoverKey(mod), imagePath })
        await refresh()
      }),
    [copy.actions.setCover, refresh, runLibraryAction],
  )

  const clearModCover = useCallback(
    (mod: LauncherLibraryItem) =>
      runLibraryAction(async () => {
        await setLauncherLibraryCover({ labelKey: getLauncherCoverKey(mod), imagePath: null })
        await refresh()
      }),
    [refresh, runLibraryAction],
  )

  const closeGalleryCoverDialog = useCallback(() => {
    setGalleryCoverDialog(null)
  }, [])

  const openGalleryCoverDialog = useCallback(
    async (mod: LauncherLibraryItem) => {
      setActionError(null)

      if (!mod.nexusModId) {
        publishNotification({
          level: 'warning',
          title: copy.actions.chooseGalleryCover,
          description: copy.library.galleryCoverEmpty,
        })
        return
      }

      try {
        publishNotification({
          id: LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID,
          level: 'info',
          title: copy.actions.chooseGalleryCover,
          description: copy.library.galleryCoverLoading,
          autoDismissMs: null,
        })

        const detail = await loadLauncherRemoteModDetail({ modId: mod.nexusModId })
        const imageUrls = Array.from(new Set(detail.galleryImages.map((value) => value.trim()).filter(Boolean)))
        if (!imageUrls.length) {
          dismissNotification(LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID)
          publishNotification({
            level: 'warning',
            title: copy.actions.chooseGalleryCover,
            description: copy.library.galleryCoverEmpty,
          })
          return
        }

        setGalleryCoverDialog({
          mod,
          imageUrls,
          selectedImageUrl: imageUrls[0]!,
          applying: false,
        })
      } catch (nextError) {
        dismissNotification(LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID)
        publishNotification({
          level: 'error',
          title: copy.actions.chooseGalleryCover,
          description: nextError instanceof Error ? nextError.message : copy.library.empty,
        })
        return
      }
      dismissNotification(LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID)
    },
    [copy.actions.chooseGalleryCover, copy.library.empty, copy.library.galleryCoverEmpty, copy.library.galleryCoverLoading],
  )

  const applyGalleryCover = useCallback(async () => {
    setActionError(null)

    if (!galleryCoverDialog) {
      return
    }

    setGalleryCoverDialog((current) => (current ? { ...current, applying: true } : current))

    try {
      const resolved = await resolveLauncherImage({ url: galleryCoverDialog.selectedImageUrl })
      await setLauncherLibraryCover({
        labelKey: getLauncherCoverKey(galleryCoverDialog.mod),
        imagePath: resolved.localPath,
      })
      await refresh()
      setGalleryCoverDialog(null)
      publishNotification({
        level: 'success',
        title: copy.actions.setCover,
        description: galleryCoverDialog.mod.name,
      })
    } catch (nextError) {
      publishNotification({
        level: 'error',
        title: copy.actions.setCover,
        description: nextError instanceof Error ? nextError.message : copy.library.empty,
      })
      setGalleryCoverDialog((current) => (current ? { ...current, applying: false } : current))
    }
  }, [copy.actions.setCover, copy.library.empty, galleryCoverDialog, refresh])

  const openModDetails = useCallback((modId: string) => {
    setDetailModId(modId)
  }, [])

  const toggleEditSelection = useCallback((modId: string) => {
    setEditingSelectionIds((current) => (current.includes(modId) ? current.filter((item) => item !== modId) : [...current, modId]))
  }, [])

  const updateBoxSelection = useCallback((modIds: string[]) => {
    setBoxSelectionIds((current) => {
      if (current.length === modIds.length && current.every((id, index) => id === modIds[index])) {
        return current
      }
      return modIds
    })
  }, [])

  const selectPack = async (packId: string | null, options?: { closeDrawer?: boolean }) => {
    const success = await runLibraryAction(async () => {
      await library.setCurrentPackId(packId)
    })
    if (!success) {
      return false
    }

    setHiddenViewOpen(false)
    setQuickSwitchOpen(false)
    setPackActionMenuId(null)
    setSortMenuOpen(false)
    if (options?.closeDrawer) {
      setDrawerOpen(false)
    }
    return true
  }

  const selectHiddenView = useCallback((options?: { closeDrawer?: boolean }) => {
    setHiddenViewOpen(true)
    setQuickSwitchOpen(false)
    setPackActionMenuId(null)
    setSortMenuOpen(false)
    if (options?.closeDrawer) {
      setDrawerOpen(false)
    }
  }, [])

  const resolveDraggedModIds = useCallback(
    (modId: string) => {
      if (!editMode && boxSelectionIds.includes(modId)) {
        return boxSelectionIds
      }
      if (editMode && editingSelectionIds.includes(modId)) {
        return editingSelectionIds
      }
      if (selectedModIds.includes(modId) && selectedModIds.length) {
        return selectedModIds
      }
      return [modId]
    },
    [boxSelectionIds, editMode, editingSelectionIds, selectedModIds],
  )

  const createLibraryFolder = useCallback(() => {
    void runLibraryAction(async () => {
      await library.createLibraryFolder()
    })
  }, [library, runLibraryAction])

  const toggleLibraryFolderOpen = useCallback((folderId: string) => {
    setOpenLibraryFolderIds((current) => {
      const folderLookup = normalizeLookupKey(folderId)
      return current.some((id) => normalizeLookupKey(id) === folderLookup)
        ? current.filter((id) => normalizeLookupKey(id) !== folderLookup)
        : [...current, folderId]
    })
  }, [])

  const closeLibraryFolder = useCallback((folderId: string) => {
    const folderLookup = normalizeLookupKey(folderId)
    setOpenLibraryFolderIds((current) => current.filter((id) => normalizeLookupKey(id) !== folderLookup))
  }, [])

  const assignDraggedModsToParent = useCallback(
    async (parentModId: string, childModIds: string[]) => {
      const nextChildIds = childModIds.filter((id) => id !== parentModId)
      if (!nextChildIds.length) {
        return
      }
      await runLibraryAction(async () => {
        await library.setChildMods(parentModId, nextChildIds)
      })
      setExpandedParentIds((current) => (current.includes(parentModId) ? current : [...current, parentModId]))
    },
    [library, runLibraryAction],
  )

  const removeDraggedChildModsFromParent = useCallback(
    (modIds: string[]) => {
      const draggedChildIds = modIds.filter((modId) => {
        const mod = library.mods.find((item) => item.id === modId)
        return Boolean(mod && childParentLookup.has(normalizeLookupKey(getModKey(mod))))
      })
      if (!draggedChildIds.length) {
        return
      }

      void runLibraryAction(async () => {
        await library.removeChildMods(draggedChildIds)
      })
    },
    [childParentLookup, library, runLibraryAction],
  )

  const assignDraggedModsToLibraryFolder = useCallback(
    async (folderId: string, modIds: string[]) => {
      if (!modIds.length) {
        return
      }
      await runLibraryAction(async () => {
        await library.addModsToLibraryFolder(folderId, modIds)
      })
    },
    [library, runLibraryAction],
  )

  const removeDraggedModsFromLibraryFolders = useCallback(
    (modIds: string[]) => {
      const folderedModIds = modIds.filter((modId) => {
        const mod = library.mods.find((item) => item.id === modId)
        return Boolean(mod && libraryFolderModLookup.has(normalizeLookupKey(getModKey(mod))))
      })
      if (!folderedModIds.length) {
        return
      }
      void runLibraryAction(async () => {
        await library.removeModsFromLibraryFolders(folderedModIds)
      })
    },
    [library, libraryFolderModLookup, runLibraryAction],
  )

  const moveDraggedFolderToFolder = useCallback(
    (folderId: string, parentFolderId: string | null) => {
      void runLibraryAction(async () => {
        await library.moveLibraryFolderToFolder(folderId, parentFolderId)
      })
    },
    [library, runLibraryAction],
  )

  const toggleParentExpanded = useCallback((modId: string) => {
    setExpandedParentIds((current) => (current.includes(modId) ? current.filter((item) => item !== modId) : [...current, modId]))
  }, [])

  const removeChildMod = useCallback(
    (modId: string) => {
      void runLibraryAction(async () => {
        await library.removeChildMods([modId])
      })
    },
    [library, runLibraryAction],
  )

  const openChildModPicker = useCallback(
    (parentMod: LauncherLibraryItem) => {
      const parentLookup = normalizeLookupKey(getModKey(parentMod))
      const selectedModIds = (childGroupLookup.get(parentLookup)?.childModKeys ?? [])
        .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey))?.id)
        .filter((id): id is string => Boolean(id))
      setChildModPicker({ parentMod, selectedModIds })
    },
    [childGroupLookup, modByKeyLookup],
  )

  const toggleChildModPickerSelection = useCallback((modId: string) => {
    setChildModPicker((current) =>
      current
        ? {
            ...current,
            selectedModIds: current.selectedModIds.includes(modId)
              ? current.selectedModIds.filter((id) => id !== modId)
              : [...current.selectedModIds, modId],
          }
        : current,
    )
  }, [])

  const submitChildModPicker = useCallback(async () => {
    if (!childModPicker) {
      return
    }
    await runLibraryAction(async () => {
      await library.replaceChildMods(childModPicker.parentMod.id, childModPicker.selectedModIds)
    })
    setExpandedParentIds((current) => (current.includes(childModPicker.parentMod.id) ? current : [...current, childModPicker.parentMod.id]))
    setChildModPicker(null)
  }, [childModPicker, library, runLibraryAction])

  const startEditMode = () => {
    if (!library.currentPack) {
      return
    }
    setEditingSelectionIds(getPackModIds(library.currentPack, library.mods))
    setEditMode(true)
    setQuickSwitchOpen(false)
    setPackActionMenuId(null)
    setSortMenuOpen(false)
    setDrawerOpen(false)
  }

  const cancelEditMode = () => {
    setEditingSelectionIds([])
    setEditMode(false)
  }

  const saveEditMode = () =>
    runLibraryAction(async () => {
      if (!library.currentPack) {
        return
      }
      await replacePackMods(library.currentPack.id, editingSelectionIds)
      setEditMode(false)
    })

  const openCreatePackDialog = useCallback(() => {
    setPackDialog({ kind: 'create', value: '' })
    setPackActionMenuId(null)
    setSortMenuOpen(false)
  }, [])

  const openRenamePackDialog = useCallback((pack: LauncherPackPreset) => {
    setPackDialog({ kind: 'rename', pack, value: pack.name })
    setPackActionMenuId(null)
    setSortMenuOpen(false)
  }, [])

  const openDeletePackDialog = useCallback((pack: LauncherPackPreset) => {
    setPackDialog({ kind: 'delete', pack })
    setPackActionMenuId(null)
    setSortMenuOpen(false)
  }, [])

  const closePackDialog = useCallback(() => {
    setPackDialog(null)
  }, [])

  const openRenameLibraryFolderDialog = useCallback((folder: LauncherVirtualFolder) => {
    setFolderDialog({ kind: 'rename', folder, value: folder.name })
    setPackActionMenuId(null)
    setSortMenuOpen(false)
  }, [])

  const closeFolderDialog = useCallback(() => {
    setFolderDialog(null)
  }, [])

  const submitPackDialog = useCallback(async () => {
    if (!packDialog) {
      return
    }

    if (packDialog.kind === 'create') {
      const nextName = packDialog.value.trim()
      if (!nextName) {
        return
      }

      const success = await runLibraryAction(async () => {
        await createPackPreset(nextName)
      })
      if (success) {
        setPackDialog(null)
      }
      return
    }

    if (packDialog.kind === 'rename') {
      const nextName = packDialog.value.trim()
      if (!nextName) {
        return
      }

      const success = await runLibraryAction(async () => {
        await renamePackPreset(packDialog.pack.id, nextName)
      })
      if (success) {
        setPackDialog(null)
      }
      return
    }

    const success = await runLibraryAction(async () => {
      await deletePackPreset(packDialog.pack.id)
    })
    if (!success) {
      return
    }
    if (library.currentPack && normalizeLookupKey(library.currentPack.id) === normalizeLookupKey(packDialog.pack.id)) {
      setEditMode(false)
    }
    setPackDialog(null)
  }, [createPackPreset, deletePackPreset, library.currentPack, packDialog, renamePackPreset, runLibraryAction])

  const submitFolderDialog = useCallback(async () => {
    if (!folderDialog) {
      return
    }
    const nextName = folderDialog.value.trim()
    if (!nextName) {
      return
    }
    const success = await runLibraryAction(async () => {
      await renameLibraryFolder(folderDialog.folder.id, nextName)
    })
    if (success) {
      setFolderDialog(null)
    }
  }, [folderDialog, renameLibraryFolder, runLibraryAction])

  const isParentExpanded = useCallback((modId: string) => expandedParentIds.includes(modId), [expandedParentIds])
  const openGridModFolder = useCallback((mod: LauncherLibraryItem) => void openModFolder(mod), [openModFolder])
  const assignDraggedModsToParentFromDnd = useCallback(
    (parentModId: string, modIds: string[]) => {
      void assignDraggedModsToParent(parentModId, modIds)
    },
    [assignDraggedModsToParent],
  )
  const assignDraggedModsToLibraryFolderFromDnd = useCallback(
    (folderId: string, modIds: string[]) => {
      void assignDraggedModsToLibraryFolder(folderId, modIds)
    },
    [assignDraggedModsToLibraryFolder],
  )

  const addDraggedModsToPack = useCallback(
    (packId: string, modIds: string[]) => {
      void runLibraryAction(async () => {
        await addModsToPack(packId, modIds)
      })
    },
    [addModsToPack, runLibraryAction],
  )

  const directActionsForMod = useCallback(
    (mod: LauncherLibraryItem) => {
      const isHidden = hiddenModKeyLookup.has(normalizeLookupKey(getModKey(mod)))
      const isChild = childParentLookup.has(normalizeLookupKey(getModKey(mod)))
      const childMods = childGroupLookup
        .get(normalizeLookupKey(getModKey(mod)))
        ?.childModKeys.map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item))
      const hasChildren = Boolean(childMods?.length)
      return [
        { label: copy.actions.viewDetails, onSelect: () => openModDetails(mod.id) },
        { label: copy.actions.openFolder, onSelect: () => void openModFolder(mod) },
        { label: mod.enabled ? copy.actions.disable : copy.actions.enable, onSelect: () => void toggleEnabled(mod) },
        { label: copy.library.setAsChildMod, onSelect: () => openChildModPicker(mod) },
        ...(isChild ? [{ label: copy.library.removeFromParent, onSelect: () => removeChildMod(mod.id) }] : []),
        ...(hasChildren
          ? [{ label: copy.library.manageChildMods, onSelect: () => setChildModManager({ parentMod: mod, childMods: childMods ?? [] }) }]
          : []),
        {
          label: isHidden ? copy.actions.showMod : copy.actions.hideMod,
          onSelect: () =>
            void runLibraryAction(async () => {
              if (isHidden) {
                await library.showMods([mod.id])
                return
              }
              await library.hideMods([mod.id])
            }),
        },
        { label: copy.actions.setCover, onSelect: () => void setModCover(mod) },
        ...(mod.nexusModId ? [{ label: copy.actions.chooseGalleryCover, onSelect: () => void openGalleryCoverDialog(mod) }] : []),
        { label: copy.actions.clearCover, onSelect: () => void clearModCover(mod) },
      ]
    },
    [
      clearModCover,
      childGroupLookup,
      childParentLookup,
      copy.actions.chooseGalleryCover,
      copy.actions.clearCover,
      copy.actions.disable,
      copy.actions.enable,
      copy.actions.hideMod,
      copy.actions.openFolder,
      copy.actions.setCover,
      copy.actions.showMod,
      copy.actions.viewDetails,
      copy.library.manageChildMods,
      copy.library.removeFromParent,
      copy.library.setAsChildMod,
      hiddenModKeyLookup,
      library,
      modByKeyLookup,
      openGalleryCoverDialog,
      openModDetails,
      openModFolder,
      removeChildMod,
      runLibraryAction,
      setModCover,
      openChildModPicker,
      toggleEnabled,
    ],
  )

  const directActionsForLibraryFolder = useCallback(
    (folder: LauncherVirtualFolder) => {
      const folderModIds = getLibraryFolderModIds(folder)
      return [
        {
          label: isLibraryFolderOpen(folder.id) ? copy.library.closeLibraryFolder : copy.library.openLibraryFolder(folder.name),
          onSelect: () => toggleLibraryFolderOpen(folder.id),
        },
        { label: copy.library.renameLibraryFolder, onSelect: () => openRenameLibraryFolderDialog(folder) },
        {
          label: copy.library.enableLibraryFolder,
          onSelect: () =>
            void runLibraryAction(async () => {
              await setModsEnabled(folderModIds, true)
            }),
        },
        {
          label: copy.library.disableLibraryFolder,
          onSelect: () =>
            void runLibraryAction(async () => {
              await setModsEnabled(folderModIds, false)
            }),
        },
      ]
    },
    [
      copy.library,
      getLibraryFolderModIds,
      isLibraryFolderOpen,
      openRenameLibraryFolderDialog,
      runLibraryAction,
      setModsEnabled,
      toggleLibraryFolderOpen,
    ],
  )

  const editCount = editingSelectionIds.length
  const currentPackLabel = hiddenViewOpen ? copy.library.hiddenMods : library.currentPack ? library.currentPack.name : copy.library.allPacks

  return (
    <>
      <LauncherLibraryDndScope
        resolveDraggedModIds={resolveDraggedModIds}
        onAddModsToPack={addDraggedModsToPack}
        onAssignModsToParent={assignDraggedModsToParentFromDnd}
        onAssignModsToLibraryFolder={assignDraggedModsToLibraryFolderFromDnd}
        onRemoveChildModsFromParent={removeDraggedChildModsFromParent}
        onRemoveModsFromLibraryFolders={removeDraggedModsFromLibraryFolders}
        onReleaseModsFromLibraryFolder={removeDraggedModsFromLibraryFolders}
        onMoveFolderToFolder={moveDraggedFolderToFolder}
      >
        <section className="launcher-library-page">
          {!editMode ? (
            <LoadingMotionRevealItem index={0} as="section" className="launcher-library-console">
              <div className="launcher-library-console-top">
                <div className="launcher-library-console-heading">
                  <button
                    type="button"
                    className="launcher-library-icon-button launcher-library-inline-menu-button"
                    aria-label={copy.library.packTitle}
                    title={copy.library.packTitle}
                    onClick={() => {
                      setDrawerOpen((current) => !current)
                      setQuickSwitchOpen(false)
                      setPackActionMenuId(null)
                      setSortMenuOpen(false)
                    }}
                  >
                    <Menu className="h-4 w-4" />
                  </button>

                  <div className="launcher-library-console-copy" ref={titleMenuRef}>
                    <button
                      type="button"
                      className="launcher-library-title-button"
                      onClick={() => {
                        if (drawerOpen) {
                          return
                        }
                        setQuickSwitchOpen((current) => !current)
                        setPackActionMenuId(null)
                        setSortMenuOpen(false)
                      }}
                    >
                      <h1 className="launcher-library-console-title">{currentPackLabel}</h1>
                      {!drawerOpen ? <ChevronDown className="h-4 w-4" /> : null}
                    </button>
                    {shortModsPath ? (
                      <p className="launcher-library-console-subtitle" title={settings.modsPath ?? undefined}>
                        {shortModsPath}
                      </p>
                    ) : null}

                    {quickSwitchOpen && !drawerOpen ? (
                      <div className="launcher-library-title-menu">
                        <button
                          type="button"
                          className={cx(
                            'launcher-library-title-menu-item',
                            !hiddenViewOpen && !library.currentPackId && 'launcher-library-title-menu-item-active',
                          )}
                          aria-label={copy.library.allPacks}
                          onClick={() => void selectPack(null)}
                        >
                          <span>{copy.library.allPacks}</span>
                          <span>{visibleLibraryModsCount}</span>
                        </button>

                        <button
                          type="button"
                          className={cx('launcher-library-title-menu-item', hiddenViewOpen && 'launcher-library-title-menu-item-active')}
                          aria-label={copy.library.hiddenMods}
                          onClick={() => selectHiddenView()}
                        >
                          <span>{copy.library.hiddenMods}</span>
                          <span>{hiddenMods.length}</span>
                        </button>

                        {library.packPresets.map((pack) => (
                          <button
                            key={pack.id}
                            type="button"
                            className={cx(
                              'launcher-library-title-menu-item',
                              !hiddenViewOpen &&
                                normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? '') &&
                                'launcher-library-title-menu-item-active',
                            )}
                            aria-label={pack.name}
                            onClick={() => void selectPack(pack.id)}
                          >
                            <span>{pack.name}</span>
                            <span>{pack.modKeys.length}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="launcher-library-console-actions">
                  <button
                    type="button"
                    className="launcher-library-icon-button"
                    onClick={createLibraryFolder}
                    aria-label={copy.library.createLibraryFolder}
                    title={copy.library.createLibraryFolder}
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="launcher-library-icon-button"
                    onClick={() => void refreshLibrary()}
                    aria-label={copy.actions.refresh}
                    title={copy.actions.refresh}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="launcher-library-icon-button"
                    onClick={() => void openLibraryRoot()}
                    aria-label={copy.actions.openStorageFolder}
                    title={copy.actions.openStorageFolder}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={() => void inspectArchive()}>
                    <FolderArchive className="h-4 w-4" />
                    <span>{copy.actions.installArchive}</span>
                  </button>
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={openInstallBackupsDialog}>
                    <Folder className="h-4 w-4" />
                    <span>{copy.library.installBackupsTitle}</span>
                  </button>
                  <button
                    type="button"
                    className="control-button control-button-primary launcher-library-primary-action"
                    disabled={launchGameDisabled}
                    onClick={onLaunchGame}
                  >
                    <Play className="h-4 w-4" />
                    <span>{launchGameBusy ? `${launchGameLabel}...` : launchGameLabel}</span>
                  </button>
                </div>
              </div>

              <div className="launcher-library-console-divider" />

              <div className="launcher-library-console-bottom">
                <div className="launcher-library-console-left">
                  <label className="launcher-library-search">
                    <Search className="h-4 w-4" />
                    <input
                      value={library.filterText}
                      onChange={(event) => library.setFilterText(event.target.value)}
                      placeholder={copy.fields.filterLibrary}
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="launcher-library-console-right">
                  <button
                    type="button"
                    className={cx('launcher-library-switch-button', library.enabledOnly && 'launcher-library-switch-button-active')}
                    role="switch"
                    aria-checked={library.enabledOnly}
                    onClick={() => library.setEnabledOnly(!library.enabledOnly)}
                  >
                    <span className="launcher-library-switch-track" aria-hidden="true">
                      <span className="launcher-library-switch-thumb" />
                    </span>
                    <span>{copy.toggles.enabledOnly}</span>
                  </button>

                  <div className="launcher-library-popover-shell" ref={sortMenuRef}>
                    <button
                      type="button"
                      className="launcher-library-sort-trigger"
                      aria-haspopup="menu"
                      aria-expanded={sortMenuOpen}
                      aria-label={copy.library.sortLabel}
                      onClick={() => {
                        setSortMenuOpen((current) => !current)
                        setQuickSwitchOpen(false)
                        setPackActionMenuId(null)
                      }}
                    >
                      <span>{currentSortLabel}</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>

                    {sortMenuOpen ? (
                      <div className="launcher-library-sort-menu" role="menu" aria-label={copy.library.sortLabel}>
                        {sortOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={sortMode === option.value}
                            className={cx(
                              'launcher-library-sort-option',
                              sortMode === option.value && 'launcher-library-sort-option-active',
                            )}
                            onClick={() => {
                              setSortMode(option.value)
                              setSortMenuOpen(false)
                            }}
                          >
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </LoadingMotionRevealItem>
          ) : (
            <LoadingMotionRevealItem index={0} as="section" className="launcher-library-edit-bar">
              <div className="launcher-library-edit-bar-left">
                <button
                  type="button"
                  className="launcher-library-icon-button launcher-library-inline-menu-button"
                  aria-label={copy.library.packTitle}
                  title={copy.library.packTitle}
                  onClick={() => {
                    setDrawerOpen((current) => !current)
                    setQuickSwitchOpen(false)
                    setPackActionMenuId(null)
                    setSortMenuOpen(false)
                  }}
                >
                  <Menu className="h-4 w-4" />
                </button>
                <span className="launcher-library-edit-label">
                  {copy.library.editingPackLabel} <strong>{library.currentPack?.name ?? copy.library.allPacks}</strong>
                </span>
              </div>
              <div className="launcher-library-edit-bar-center">
                <span className="launcher-library-edit-label">{copy.library.includedModsCount(editCount)}</span>
              </div>
              <div className="launcher-library-edit-bar-right">
                <button type="button" className="control-button launcher-library-secondary-action" onClick={cancelEditMode}>
                  {copy.library.cancelEdit}
                </button>
                <button
                  type="button"
                  className="control-button control-button-primary launcher-library-primary-action"
                  onClick={() => void saveEditMode()}
                >
                  {copy.library.saveChanges}
                </button>
              </div>
            </LoadingMotionRevealItem>
          )}

          <div
            className={cx(
              'launcher-library-shell',
              drawerOpen ? 'launcher-library-shell-sidebar-open' : 'launcher-library-shell-sidebar-collapsed',
            )}
          >
            <aside
              className={cx(
                'launcher-library-sidebar',
                drawerOpen ? 'launcher-library-sidebar-open' : 'launcher-library-sidebar-collapsed',
              )}
              ref={drawerPanelRef}
            >
              <div className={cx('launcher-library-sidebar-inner', !drawerOpen && 'launcher-library-sidebar-inner-collapsed')}>
                <div className="launcher-library-sidebar-header">
                  <div
                    className={cx('launcher-library-sidebar-header-meta', !drawerOpen && 'launcher-library-sidebar-header-meta-hidden')}
                    aria-hidden={!drawerOpen}
                  >
                    <p className="launcher-library-pack-drawer-title">{copy.library.packTitle}</p>
                    <button type="button" className="launcher-library-drawer-add-button" onClick={openCreatePackDialog}>
                      <Plus className="h-4 w-4" />
                      <span>{copy.actions.createPack}</span>
                    </button>
                  </div>
                </div>

                <div
                  className={cx('launcher-library-sidebar-body', !drawerOpen && 'launcher-library-sidebar-body-hidden')}
                  aria-hidden={!drawerOpen}
                >
                  <div className="launcher-library-pack-drawer-divider" />

                  <div className="launcher-library-pack-drawer-list">
                    <div
                      className={cx(
                        'launcher-library-pack-row-shell',
                        'launcher-library-pack-row-shell-static',
                        !library.currentPackId && 'launcher-library-pack-row-shell-active',
                      )}
                    >
                      <button
                        type="button"
                        className={cx(
                          'launcher-library-pack-row',
                          !hiddenViewOpen && !library.currentPackId && 'launcher-library-pack-row-active',
                        )}
                        aria-label={copy.library.allPacks}
                        onClick={() => void selectPack(null)}
                      >
                        <span className="launcher-library-pack-row-main">
                          <LayoutGrid className="launcher-library-pack-row-icon h-4 w-4" />
                          <span className="launcher-library-pack-row-name">{copy.library.allPacks}</span>
                        </span>
                        <span className="launcher-library-pack-row-trailing">
                          <span className="launcher-library-pack-row-count-badge">{visibleLibraryModsCount}</span>
                        </span>
                      </button>
                    </div>

                    <div
                      className={cx(
                        'launcher-library-pack-row-shell',
                        'launcher-library-pack-row-shell-static',
                        hiddenViewOpen && 'launcher-library-pack-row-shell-active',
                      )}
                    >
                      <button
                        type="button"
                        className={cx('launcher-library-pack-row', hiddenViewOpen && 'launcher-library-pack-row-active')}
                        aria-label={copy.library.hiddenMods}
                        onClick={() => selectHiddenView()}
                      >
                        <span className="launcher-library-pack-row-main">
                          <FolderArchive className="launcher-library-pack-row-icon h-4 w-4" />
                          <span className="launcher-library-pack-row-name">{copy.library.hiddenMods}</span>
                        </span>
                        <span className="launcher-library-pack-row-trailing">
                          <span className="launcher-library-pack-row-count-badge">{hiddenMods.length}</span>
                        </span>
                      </button>
                    </div>

                    <div className="launcher-library-pack-row-separator" />

                    {library.packPresets.map((pack) => {
                      const isCurrentPack =
                        !hiddenViewOpen && normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? '')
                      const isActionMenuOpen = packActionMenuId === pack.id

                      return (
                        <DroppableLauncherPackRow key={pack.id} pack={pack}>
                          {(isDropTarget) => (
                            <div
                              className={cx(
                                'launcher-library-pack-row-shell',
                                isCurrentPack && 'launcher-library-pack-row-shell-active',
                                isDropTarget && 'launcher-library-pack-row-shell-drop-target',
                              )}
                            >
                              <button
                                type="button"
                                className={cx('launcher-library-pack-row', isCurrentPack && 'launcher-library-pack-row-active')}
                                aria-label={pack.name}
                                onClick={() => void selectPack(pack.id)}
                              >
                                <span className="launcher-library-pack-row-main">
                                  <Folder className="launcher-library-pack-row-icon h-4 w-4" />
                                  <span className="launcher-library-pack-row-name">{pack.name}</span>
                                </span>
                                <span className="launcher-library-pack-row-trailing">
                                  <span className="launcher-library-pack-row-count-badge">{pack.modKeys.length}</span>
                                </span>
                              </button>

                              <button
                                type="button"
                                className="launcher-library-pack-row-menu-button"
                                aria-label={`${copy.library.manageCurrentPack} ${pack.name}`}
                                aria-expanded={isActionMenuOpen}
                                onClick={() => setPackActionMenuId((current) => (current === pack.id ? null : pack.id))}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>

                              {isActionMenuOpen ? (
                                <div className="launcher-library-pack-row-menu">
                                  <button
                                    type="button"
                                    className="launcher-library-pack-row-menu-item"
                                    onClick={async () => {
                                      if (isCurrentPack) {
                                        startEditMode()
                                        return
                                      }
                                      const switched = await selectPack(pack.id)
                                      if (!switched) {
                                        return
                                      }
                                      setEditingSelectionIds(getPackModIds(pack, library.mods))
                                      setEditMode(true)
                                      setPackActionMenuId(null)
                                    }}
                                  >
                                    {copy.library.editCurrentPack}
                                  </button>
                                  <button
                                    type="button"
                                    className="launcher-library-pack-row-menu-item"
                                    onClick={() => openRenamePackDialog(pack)}
                                  >
                                    {copy.library.renameCurrentPack}
                                  </button>
                                  <button
                                    type="button"
                                    className="launcher-library-pack-row-menu-item"
                                    onClick={() => openDeletePackDialog(pack)}
                                  >
                                    {copy.library.deleteCurrentPack}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </DroppableLauncherPackRow>
                      )
                    })}
                  </div>
                </div>
              </div>
            </aside>

            <div className="launcher-library-content">
              <div className="launcher-library-browser">
                {archiveDropActive ? (
                  <div className="launcher-library-drop-overlay" role="status" aria-live="polite">
                    <div className="launcher-library-drop-overlay-card">
                      <strong>{copy.library.dragDropInstallTitle}</strong>
                      <span>{copy.library.dragDropInstallSubtitle(supportedArchiveFormatsLabel)}</span>
                    </div>
                  </div>
                ) : null}
                {actionError ? <LauncherStateBlock title={currentPackLabel} detail={actionError} tone="warning" /> : null}
                {library.state === 'error' ? (
                  <LauncherStateBlock title={currentPackLabel} detail={library.error ?? copy.library.empty} tone="warning" />
                ) : null}
                {library.state !== 'error' && !visibleDisplayItems.length ? (
                  <LauncherStateBlock
                    title={
                      !settings.modsPath
                        ? copy.states.missingModsPath
                        : !library.mods.length
                          ? copy.library.empty
                          : copy.library.filteredEmpty
                    }
                    detail={copy.library.subtitle}
                  />
                ) : (
                  <VirtualizedLauncherGrid
                    items={visibleDisplayItems}
                    latestVersionByModId={library.latestVersionByModId}
                    openFolderItemsById={openLibraryFolderItemsById}
                    editMode={editMode}
                    editingSelectionIds={editingSelectionIds}
                    boxSelectionIds={boxSelectionIds}
                    noneLabel={editorCopy.common.none}
                    childCountLabel={copy.library.childModsCount}
                    expandLabel={copy.library.expandChildMods}
                    collapseLabel={copy.library.collapseChildMods}
                    folderCountLabel={copy.library.libraryFolderCount}
                    openFolderLabel={copy.library.openLibraryFolder}
                    closeFolderLabel={copy.library.closeLibraryFolder}
                    onToggleSelection={toggleEditSelection}
                    onBoxSelectionChange={updateBoxSelection}
                    onToggleParentExpanded={toggleParentExpanded}
                    isParentExpanded={isParentExpanded}
                    onOpenModDetails={openModDetails}
                    onOpenModFolder={openGridModFolder}
                    isLibraryFolderOpen={isLibraryFolderOpen}
                    onOpenLibraryFolder={toggleLibraryFolderOpen}
                    onCloseLibraryFolder={closeLibraryFolder}
                    getFolderContextActions={directActionsForLibraryFolder}
                    getContextActions={directActionsForMod}
                  />
                )}
              </div>
            </div>
          </div>

          <LauncherModDetailPanel
            open={Boolean(detailMod)}
            onClose={() => setDetailModId(null)}
            closeLabel={copy.actions.closeDialog}
            title={copy.library.detailsTitle}
            subtitle={copy.library.detailsSubtitle}
            empty={copy.library.selectionEmpty}
            mod={detailMod}
            labels={{
              currentVersion: copy.fields.currentVersion,
              uniqueId: copy.fields.uniqueId,
              path: copy.fields.path,
              dependencies: copy.fields.dependencies,
              updateKeys: copy.fields.updateKeys,
              pack: copy.library.packLabel,
            }}
            noSummary={copy.states.noSummary}
            onToggleEnabled={() => {
              if (detailMod) {
                void library.toggleEnabled(detailMod)
              }
            }}
            enableLabel={copy.actions.enable}
            disableLabel={copy.actions.disable}
            enabledStateLabel={copy.overview.enabledMods}
            disabledStateLabel={copy.overview.disabledMods}
            openFolderLabel={copy.actions.openFolder}
            setCoverLabel={copy.actions.setCover}
            clearCoverLabel={copy.actions.clearCover}
            openModPageLabel={copy.actions.openModPage}
            onQueueDownload={onQueueDownload}
            remoteFilesDeferred={Boolean(onQueueDownload)}
            onOpenFolder={() => {
              if (detailMod) {
                void openModFolder(detailMod)
              }
            }}
            onSetCover={() => {
              if (detailMod) {
                void setModCover(detailMod)
              }
            }}
            onClearCover={() => {
              if (detailMod) {
                void clearModCover(detailMod)
              }
            }}
            packName={
              detailMod
                ? (packLookup
                    .get(normalizeLookupKey(getModKey(detailMod)))
                    ?.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? ''))?.name ?? null)
                : null
            }
          />
        </section>
        <LauncherArchiveInstallDialog
          open={archivePreviewState !== 'idle'}
          loading={archivePreviewState === 'loading'}
          installing={installingArchive}
          previews={archivePreviews}
          selectedArchivePath={selectedArchivePreviewPath}
          error={archivePreviewState === 'error' ? archivePreviewError : null}
          onClose={closeArchivePreview}
          onConfirm={() => void confirmArchiveInstall()}
          onSelectArchive={setSelectedArchivePreviewPath}
        />

        <LauncherInstallSummaryDialog
          open={Boolean(installResult)}
          result={installResult}
          onClose={closeInstallSummary}
          onManageBackups={openInstallBackupsFromSummary}
        />

        <LauncherInstallBackupsDialog
          open={installBackupsOpen}
          loading={installBackupsState === 'loading'}
          backups={installBackups}
          error={installBackupsState === 'error' ? installBackupsError : null}
          restoringBackupId={restoringBackupId}
          onClose={closeInstallBackupsDialog}
          onRestore={(backupId) => void restoreInstallBackupSession(backupId)}
        />

        <LauncherChildModsDialogs
          picker={childModPicker}
          manager={childModManager}
          mods={library.mods}
          labels={{
            chooseChildMods: copy.library.chooseChildMods,
            chooseChildModsSubtitle: copy.library.chooseChildModsSubtitle,
            confirmChildMods: copy.library.confirmChildMods,
            cancelEdit: copy.library.cancelEdit,
            manageChildMods: copy.library.manageChildMods,
            parentModLabel: copy.library.parentModLabel,
            removeFromParent: copy.library.removeFromParent,
            closeDialog: copy.actions.closeDialog,
          }}
          onClosePicker={() => setChildModPicker(null)}
          onTogglePickerSelection={toggleChildModPickerSelection}
          onSubmitPicker={() => void submitChildModPicker()}
          onCloseManager={() => setChildModManager(null)}
          onRemoveChild={removeChildMod}
          onManagerChildrenChange={(childMods) =>
            setChildModManager((current) =>
              current
                ? {
                    ...current,
                    childMods,
                  }
                : current,
            )
          }
        />

        {galleryCoverDialog ? (
          <div
            className="launcher-modal-backdrop launcher-library-dialog-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !galleryCoverDialog.applying) {
                closeGalleryCoverDialog()
              }
            }}
          >
            <section
              className="launcher-library-dialog launcher-gallery-cover-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={copy.library.galleryCoverTitle}
            >
              <div className="launcher-library-dialog-header">
                <h2 className="launcher-library-dialog-title">{copy.library.galleryCoverTitle}</h2>
                <p className="launcher-library-dialog-copy">{copy.library.galleryCoverSubtitle}</p>
              </div>

              <div className="launcher-gallery-cover-grid">
                {galleryCoverDialog.imageUrls.map((url, index) => (
                  <GalleryCoverOption
                    key={url}
                    url={url}
                    selected={galleryCoverDialog.selectedImageUrl === url}
                    label={copy.library.galleryCoverImageLabel(index + 1)}
                    onSelect={() =>
                      setGalleryCoverDialog((current) =>
                        current
                          ? {
                              ...current,
                              selectedImageUrl: url,
                            }
                          : current,
                      )
                    }
                  />
                ))}
              </div>

              <div className="launcher-library-dialog-actions">
                <button
                  type="button"
                  className="control-button launcher-library-secondary-action"
                  onClick={closeGalleryCoverDialog}
                  disabled={galleryCoverDialog.applying}
                >
                  {copy.library.cancelEdit}
                </button>
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={() => void applyGalleryCover()}
                  disabled={galleryCoverDialog.applying}
                >
                  {copy.actions.setCover}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {packDialog ? (
          <div
            className="launcher-modal-backdrop launcher-library-dialog-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closePackDialog()
              }
            }}
          >
            <section
              className="launcher-library-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={
                packDialog.kind === 'create'
                  ? copy.actions.createPack
                  : packDialog.kind === 'rename'
                    ? copy.library.renameCurrentPack
                    : copy.library.deleteCurrentPack
              }
            >
              <div className="launcher-library-dialog-header">
                <h2 className="launcher-library-dialog-title">
                  {packDialog.kind === 'create'
                    ? copy.actions.createPack
                    : packDialog.kind === 'rename'
                      ? copy.library.renameCurrentPack
                      : copy.library.deleteCurrentPack}
                </h2>
                {packDialog.kind === 'rename' ? (
                  <p className="launcher-library-dialog-copy">{copy.library.renameCurrentPackPrompt(packDialog.pack.name)}</p>
                ) : null}
                {packDialog.kind === 'delete' ? (
                  <p className="launcher-library-dialog-copy">{copy.library.deleteCurrentPackConfirm(packDialog.pack.name)}</p>
                ) : null}
              </div>

              {packDialog.kind === 'delete' ? (
                <div className="launcher-library-dialog-actions">
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={closePackDialog}>
                    {copy.library.cancelEdit}
                  </button>
                  <button type="button" className="control-button launcher-library-danger-action" onClick={() => void submitPackDialog()}>
                    {copy.library.deleteCurrentPack}
                  </button>
                </div>
              ) : (
                <form
                  className="launcher-library-dialog-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitPackDialog()
                  }}
                >
                  <label className="launcher-library-dialog-field">
                    <span className="sr-only">
                      {packDialog.kind === 'create' ? copy.actions.createPack : copy.library.renameCurrentPack}
                    </span>
                    <input
                      ref={packDialogInputRef}
                      value={packDialog.value}
                      onChange={(event) =>
                        setPackDialog((current) =>
                          current && current.kind !== 'delete'
                            ? {
                                ...current,
                                value: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder={copy.library.newPackPlaceholder}
                      spellCheck={false}
                    />
                  </label>
                  <div className="launcher-library-dialog-actions">
                    <button type="button" className="control-button launcher-library-secondary-action" onClick={closePackDialog}>
                      {copy.library.cancelEdit}
                    </button>
                    <button type="submit" className="control-button control-button-primary launcher-library-primary-action">
                      {packDialog.kind === 'create' ? copy.actions.createPack : copy.library.saveChanges}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        ) : null}

        {folderDialog ? (
          <div
            className="launcher-modal-backdrop launcher-library-dialog-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeFolderDialog()
              }
            }}
          >
            <section className="launcher-library-dialog" role="dialog" aria-modal="true" aria-label={copy.library.renameLibraryFolder}>
              <div className="launcher-library-dialog-header">
                <h2 className="launcher-library-dialog-title">{copy.library.renameLibraryFolder}</h2>
                <p className="launcher-library-dialog-copy">{copy.library.renameLibraryFolderPrompt(folderDialog.folder.name)}</p>
              </div>

              <form
                className="launcher-library-dialog-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitFolderDialog()
                }}
              >
                <label className="launcher-library-dialog-field">
                  <span className="sr-only">{copy.library.renameLibraryFolder}</span>
                  <input
                    value={folderDialog.value}
                    onChange={(event) =>
                      setFolderDialog((current) =>
                        current
                          ? {
                              ...current,
                              value: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder={copy.library.newLibraryFolderName}
                    spellCheck={false}
                    autoFocus
                  />
                </label>
                <div className="launcher-library-dialog-actions">
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={closeFolderDialog}>
                    {copy.library.cancelEdit}
                  </button>
                  <button type="submit" className="control-button control-button-primary launcher-library-primary-action">
                    {copy.library.saveChanges}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </LauncherLibraryDndScope>
    </>
  )
}

export function LauncherLibraryPage(props: LauncherLibraryPageProps) {
  const library = useLauncherLibrary(props.settings)
  return <LauncherLibraryPageContent {...props} library={library} />
}
