import type { DragEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Folder,
  FolderArchive,
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
import { getModKey, includesLibraryFilter, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type {
  LauncherLibraryItem,
  LauncherPackPreset,
  LauncherSettingsDraft,
  QueueLauncherDownloadInput,
} from '@features/launcher/model/types'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { LauncherArchiveInstallDialog } from '@features/launcher/ui/shared/LauncherArchiveInstallDialog'
import { LauncherInstallBackupsDialog } from '@features/launcher/ui/shared/LauncherInstallBackupsDialog'
import { LauncherInstallSummaryDialog } from '@features/launcher/ui/shared/LauncherInstallSummaryDialog'
import { LauncherStateBlock } from '@features/launcher/ui/shared/LauncherStateBlock'
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
type GalleryCoverDialogState = {
  mod: LauncherLibraryItem
  imageUrls: string[]
  selectedImageUrl: string
  applying: boolean
}

type DroppedArchivePaths = {
  supportedPaths: string[]
  missingPathCount: number
  unsupportedCount: number
}

const LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID = 'launcher-library-gallery-loading'
const LAUNCHER_LIBRARY_INSTALL_RESULT_AUTO_DISMISS_MS = 15_000

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
  items: LauncherLibraryItem[]
  latestVersionByModId?: Record<number, string>
  editMode: boolean
  editingSelectionIds: string[]
  noneLabel: string
  onDragStart: (modId: string, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onToggleSelection: (modId: string) => void
  onOpenModDetails: (modId: string) => void
  onOpenModFolder: (mod: LauncherLibraryItem) => void
  getContextActions: (mod: LauncherLibraryItem) => { label: string; onSelect: () => void }[] | undefined
}

const MAX_LIBRARY_REVEAL_BATCH_SIZE = 4
const TARGET_LIBRARY_REVEAL_WAVES = 4
const FALLBACK_LIBRARY_REVEAL_BATCH_SIZE = 2

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

const VirtualizedLauncherGrid = memo(function VirtualizedLauncherGrid({
  items,
  latestVersionByModId = {},
  editMode,
  editingSelectionIds,
  noneLabel,
  onDragStart,
  onDragEnd,
  onToggleSelection,
  onOpenModDetails,
  onOpenModFolder,
  getContextActions,
}: VirtualizedLauncherGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [revealBatchSize, setRevealBatchSize] = useState(() =>
    clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, items.length),
  )
  const selectedIdLookup = useMemo(() => new Set(editingSelectionIds), [editingSelectionIds])

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
    <div ref={viewportRef} className={cx('launcher-library-grid-viewport', editMode && 'launcher-library-grid-viewport-editing')}>
      <div ref={gridRef} className="launcher-library-grid">
        {items.map((item, index) => (
          <LoadingMotionRevealItem key={item.id} index={Math.floor(index / revealBatchSize) + 3} className="launcher-library-grid-reveal">
            <LauncherModCard
              title={item.name}
              titleTooltip={item.name}
              meta={buildLibraryCardMeta(item, noneLabel)}
              author={item.author}
              version={item.version}
              latestVersion={item.nexusModId == null ? null : latestVersionByModId[item.nexusModId]}
              imageUrl={item.imageUrl}
              enabled={item.enabled}
              draggable
              onDragStart={(event) => onDragStart(item.id, event)}
              onDragEnd={onDragEnd}
              selectionMode={editMode}
              selected={selectedIdLookup.has(item.id)}
              onSelect={editMode ? () => onToggleSelection(item.id) : undefined}
              onOpenDetails={editMode ? undefined : () => onOpenModDetails(item.id)}
              onOpenDirectTarget={editMode ? undefined : () => onOpenModFolder(item)}
              contextActions={editMode ? undefined : getContextActions(item)}
            />
          </LoadingMotionRevealItem>
        ))}
      </div>
    </div>
  )
})

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
  const { refresh, selectedModIds, toggleEnabled, addModsToPack, createPackPreset, renamePackPreset, deletePackPreset, replacePackMods } =
    library

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
  const [galleryCoverDialog, setGalleryCoverDialog] = useState<GalleryCoverDialogState | null>(null)
  const [hiddenViewOpen, setHiddenViewOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingSelectionIds, setEditingSelectionIds] = useState<string[]>([])
  const [archiveDropActive, setArchiveDropActive] = useState(false)
  const [draggedModIds, setDraggedModIds] = useState<string[]>([])
  const [dragOverPackId, setDragOverPackId] = useState<string | null>(null)
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

    const handlePointerDown = (event: MouseEvent) => {
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
      if (editMode && editingSelectionIds.includes(modId)) {
        return editingSelectionIds
      }
      if (selectedModIds.includes(modId) && selectedModIds.length) {
        return selectedModIds
      }
      return [modId]
    },
    [editMode, editingSelectionIds, selectedModIds],
  )

  const startDraggingMod = useCallback(
    (modId: string, event: DragEvent<HTMLElement>) => {
      const nextDraggedIds = resolveDraggedModIds(modId)
      setDraggedModIds(nextDraggedIds)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', nextDraggedIds.join(','))
    },
    [resolveDraggedModIds],
  )

  const stopDraggingMod = useCallback(() => {
    setDraggedModIds([])
    setDragOverPackId(null)
  }, [])

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

  const dropModsIntoPack = async (pack: LauncherPackPreset) => {
    if (!draggedModIds.length) {
      return
    }

    await runLibraryAction(async () => {
      await addModsToPack(pack.id, draggedModIds)
    })
    stopDraggingMod()
  }

  const directActionsForMod = useCallback(
    (mod: LauncherLibraryItem) => {
      const isHidden = hiddenModKeyLookup.has(normalizeLookupKey(getModKey(mod)))
      return [
        { label: copy.actions.viewDetails, onSelect: () => openModDetails(mod.id) },
        { label: copy.actions.openFolder, onSelect: () => void openModFolder(mod) },
        { label: mod.enabled ? copy.actions.disable : copy.actions.enable, onSelect: () => void toggleEnabled(mod) },
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
      copy.actions.chooseGalleryCover,
      copy.actions.clearCover,
      copy.actions.disable,
      copy.actions.enable,
      copy.actions.hideMod,
      copy.actions.openFolder,
      copy.actions.setCover,
      copy.actions.showMod,
      copy.actions.viewDetails,
      hiddenModKeyLookup,
      library,
      openGalleryCoverDialog,
      openModDetails,
      openModFolder,
      runLibraryAction,
      setModCover,
      toggleEnabled,
    ],
  )

  const editCount = editingSelectionIds.length
  const currentPackLabel = hiddenViewOpen ? copy.library.hiddenMods : library.currentPack ? library.currentPack.name : copy.library.allPacks

  return (
    <>
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
                          className={cx('launcher-library-sort-option', sortMode === option.value && 'launcher-library-sort-option-active')}
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
            className={cx('launcher-library-sidebar', drawerOpen ? 'launcher-library-sidebar-open' : 'launcher-library-sidebar-collapsed')}
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
                    const isCurrentPack = !hiddenViewOpen && normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? '')
                    const isActionMenuOpen = packActionMenuId === pack.id
                    const isDropTarget = dragOverPackId === pack.id

                    return (
                      <div
                        key={pack.id}
                        className={cx(
                          'launcher-library-pack-row-shell',
                          isCurrentPack && 'launcher-library-pack-row-shell-active',
                          isDropTarget && 'launcher-library-pack-row-shell-drop-target',
                        )}
                        onDragOver={(event) => {
                          if (!draggedModIds.length) {
                            return
                          }
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                          setDragOverPackId(pack.id)
                        }}
                        onDragLeave={() => {
                          setDragOverPackId((current) => (current === pack.id ? null : current))
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          void dropModsIntoPack(pack)
                        }}
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
              {library.state !== 'error' && !visibleMods.length ? (
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
                  items={visibleMods}
                  latestVersionByModId={library.latestVersionByModId}
                  editMode={editMode}
                  editingSelectionIds={editingSelectionIds}
                  noneLabel={editorCopy.common.none}
                  onDragStart={startDraggingMod}
                  onDragEnd={stopDraggingMod}
                  onToggleSelection={toggleEditSelection}
                  onOpenModDetails={openModDetails}
                  onOpenModFolder={(mod) => void openModFolder(mod)}
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
                  <span className="sr-only">{packDialog.kind === 'create' ? copy.actions.createPack : copy.library.renameCurrentPack}</span>
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
    </>
  )
}

export function LauncherLibraryPage(props: LauncherLibraryPageProps) {
  const library = useLauncherLibrary(props.settings)
  return <LauncherLibraryPageContent {...props} library={library} />
}
