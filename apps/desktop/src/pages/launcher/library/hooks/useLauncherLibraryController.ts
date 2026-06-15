import { useCallback, useEffect, useRef, useState } from 'react'
import type { LauncherCopy } from '@locales/model'
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
  chooseArchiveFiles,
  chooseImageFile,
  isSupportedLauncherArchivePath,
  listenToLauncherArchiveDragDrop,
  type UnlistenFn,
} from '@shared/lib/desktop'
import { getLauncherCoverKey } from '@features/launcher/model/coverKey'
import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherPackPreset, LauncherSettingsDraft, LauncherVirtualFolder } from '@features/launcher/model/types'
import type { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { getPackModIds, type LibrarySortMode } from '../model/launcherLibraryDisplay'
import type {
  ArchivePreviewState,
  FolderDialogState,
  GalleryCoverDialogState,
  InstallBackupsState,
  PackDialogState,
} from '../model/launcherLibraryDialogs'
import { useLauncherLibraryDisplayState } from './useLauncherLibraryDisplayState'

export type LauncherLibraryControllerInput = {
  settings: LauncherSettingsDraft
  library: ReturnType<typeof useLauncherLibrary>
  refresh: () => Promise<void>
  copy: LauncherCopy
  onArchiveInstallSuccess?: (archivePaths: string[]) => void
}

type DroppedArchivePaths = {
  supportedPaths: string[]
  missingPathCount: number
  unsupportedCount: number
}

const LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID = 'launcher-library-gallery-loading'
const LAUNCHER_LIBRARY_ARCHIVE_PREVIEW_NOTIFICATION_ID = 'launcher-library-archive-preview'
const LAUNCHER_LIBRARY_ARCHIVE_INSTALL_NOTIFICATION_ID = 'launcher-library-archive-install'
const LAUNCHER_LIBRARY_INSTALL_RESULT_AUTO_DISMISS_MS = 15_000

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

function archiveFileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop()?.trim() || path
}

function installErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatInstallResultDescription(
  copy: LauncherCopy['library'],
  results: InstallLauncherArchiveResult[],
  failures: Array<{ archivePath: string; message: string }>,
) {
  const successNames = results.map((result) => result.modName || archiveFileNameFromPath(result.targetPath))
  const failureNames = failures.map((failure) => `${archiveFileNameFromPath(failure.archivePath)}: ${failure.message}`)
  const lines: string[] = []

  if (results.length) {
    lines.push(copy.installSummarySucceeded(results.length))
    lines.push(...successNames.map((name) => `- ${name}`))
  }

  if (failures.length) {
    if (lines.length) {
      lines.push('')
    }
    lines.push(copy.installSummaryFailed(failures.length))
    lines.push(...failureNames.map((name) => `- ${name}`))
  }

  return lines.join('\n')
}

function formatInstallProgressDescription(copy: LauncherCopy['library'], archiveName: string, completed: number, total: number) {
  return `${copy.installProgress(completed, total, archiveName)}\n${copy.installProgressKeepWorking}`
}

/** Coordinates launcher-library page state, derived display data, and local interaction refs. */
export function useLauncherLibraryController({
  settings,
  library,
  refresh,
  copy,
  onArchiveInstallSuccess,
}: LauncherLibraryControllerInput) {
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
  const [childModSelection, setChildModSelection] = useState<{ parentMod: LauncherLibraryItem; selectedModIds: string[] } | null>(null)
  const [archiveDropActive, setArchiveDropActive] = useState(false)
  const [expandedParentIds, setExpandedParentIds] = useState<string[]>([])
  const [childModManager, setChildModManager] = useState<
    import('@features/launcher/ui/shared/LauncherChildModsDialogs').LauncherChildModManagerState | null
  >(null)
  const [openLibraryFolderIds, setOpenLibraryFolderIds] = useState<string[]>([])
  const [readyLibraryFolderIds, setReadyLibraryFolderIds] = useState<string[]>([])
  const lastEditSeedRef = useRef<{ editMode: boolean; packId: string | null }>({ editMode: false, packId: null })

  const titleMenuRef = useRef<HTMLDivElement | null>(null)
  const drawerPanelRef = useRef<HTMLDivElement | null>(null)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const packDialogInputRef = useRef<HTMLInputElement | null>(null)
  const lastLoadedModsPathRef = useRef<string | null>(settings.modsPath?.trim() || null)
  const autoRefreshModsPathRef = useRef<string | null>(null)
  const installBackupsOpenRef = useRef(false)
  const archivePreviewTaskTokenRef = useRef(0)

  useEffect(() => {
    const nextModsPath = settings.modsPath?.trim() || null
    const modsPathChanged = lastLoadedModsPathRef.current !== nextModsPath
    if (modsPathChanged) {
      lastLoadedModsPathRef.current = nextModsPath
    }

    const shouldAutoRefreshEmptyLibrary =
      library.state === 'idle' && library.mods.length === 0 && !library.error && autoRefreshModsPathRef.current !== nextModsPath
    const shouldRefresh = modsPathChanged || shouldAutoRefreshEmptyLibrary
    if (!shouldRefresh) {
      return
    }

    autoRefreshModsPathRef.current = nextModsPath
    void refresh()
  }, [library.error, library.mods.length, library.state, refresh, settings.modsPath])

  useEffect(() => {
    installBackupsOpenRef.current = installBackupsOpen
  }, [installBackupsOpen])

  const displayState = useLauncherLibraryDisplayState({
    settings,
    library,
    copy,
    sortMode,
    detailModId,
    hiddenViewOpen,
    editMode,
    editingSelectionIds,
    openLibraryFolderIds,
    readyLibraryFolderIds,
  })
  const {
    packLookup,
    childGroupLookup,
    childParentLookup,
    hiddenModKeyLookup,
    hiddenMods,
    visibleLibraryModsCount,
    detailMod,
    visibleMods,
    modByKeyLookup,
    libraryFolderModLookup,
    visibleDisplayItems,
    openLibraryFolderItemsById,
    shortModsPath,
    sortOptions,
    currentSortLabel,
    editCount,
    currentPackLabel,
    supportedArchiveFormatsLabel,
    isLibraryFolderOpen,
    getLibraryFolderItemCount,
    getLibraryFolderModIds,
  } = displayState

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

  const toggleLibraryFolderOpen = useCallback(
    (folderId: string) => {
      const folderLookup = normalizeLookupKey(folderId)
      if (getLibraryFolderItemCount(folderId) <= 0) {
        return
      }

      setOpenLibraryFolderIds((current) => {
        const willClose = current.some((id) => normalizeLookupKey(id) === folderLookup)
        if (willClose) {
          setReadyLibraryFolderIds((ready) => ready.filter((id) => normalizeLookupKey(id) !== folderLookup))
          return current.filter((id) => normalizeLookupKey(id) !== folderLookup)
        }
        setReadyLibraryFolderIds((ready) => (ready.some((id) => normalizeLookupKey(id) === folderLookup) ? ready : [...ready, folderId]))
        return [...current, folderId]
      })
    },
    [getLibraryFolderItemCount],
  )

  const closeLibraryFolder = useCallback((folderId: string) => {
    const folderLookup = normalizeLookupKey(folderId)
    setReadyLibraryFolderIds((current) => current.filter((id) => normalizeLookupKey(id) !== folderLookup))
    setOpenLibraryFolderIds((current) => current.filter((id) => normalizeLookupKey(id) !== folderLookup))
  }, [])

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

  const publishArchiveInstallResult = useCallback(
    (results: InstallLauncherArchiveResult[], failures: Array<{ archivePath: string; message: string }>) => {
      if (!results.length && !failures.length) {
        return
      }

      publishNotification({
        level: failures.length && !results.length ? 'error' : failures.length ? 'warning' : 'success',
        title: copy.library.installSummaryTitle,
        summary: [
          results.length ? copy.library.installSummarySucceeded(results.length) : null,
          failures.length ? copy.library.installSummaryFailed(failures.length) : null,
        ]
          .filter(Boolean)
          .join(' / '),
        description: formatInstallResultDescription(copy.library, results, failures),
        action:
          results.length === 1
            ? {
                label: copy.actions.viewDetails,
                callback: () => openInstallSummary(results[0]!),
                tone: 'primary',
              }
            : undefined,
        autoDismissMs: LAUNCHER_LIBRARY_INSTALL_RESULT_AUTO_DISMISS_MS,
      })
    },
    [copy.actions.viewDetails, copy.library, openInstallSummary],
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
      const taskToken = archivePreviewTaskTokenRef.current + 1
      archivePreviewTaskTokenRef.current = taskToken
      const isTaskActive = () => archivePreviewTaskTokenRef.current === taskToken

      setArchivePreviewState('idle')
      setArchivePreviews([])
      setSelectedArchivePreviewPath(null)
      setArchivePreviewError(null)

      const nextPreviews: InspectLauncherArchiveResult[] = []
      let firstError: string | null = null
      const total = paths.length
      let completed = 0

      for (const path of paths) {
        if (!isTaskActive()) {
          return
        }

        publishNotification({
          id: LAUNCHER_LIBRARY_ARCHIVE_PREVIEW_NOTIFICATION_ID,
          level: 'info',
          title: copy.library.previewLoading,
          description: copy.library.previewProgress(completed, total, archiveFileNameFromPath(path)),
          autoDismissMs: null,
          progress: total > 0 ? (completed / total) * 100 : 0,
        })

        try {
          nextPreviews.push(await inspectLauncherArchive({ archivePath: path }))
          completed += 1
          if (isTaskActive()) {
            publishNotification({
              id: LAUNCHER_LIBRARY_ARCHIVE_PREVIEW_NOTIFICATION_ID,
              level: 'info',
              title: copy.library.previewLoading,
              description: copy.library.previewProgress(completed, total, archiveFileNameFromPath(path)),
              autoDismissMs: null,
              progress: total > 0 ? (completed / total) * 100 : 100,
            })
          }
        } catch (nextError) {
          completed += 1
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

      if (!isTaskActive()) {
        return
      }

      dismissNotification(LAUNCHER_LIBRARY_ARCHIVE_PREVIEW_NOTIFICATION_ID)

      if (nextPreviews.length) {
        setArchivePreviews(nextPreviews)
        setSelectedArchivePreviewPath(nextPreviews[0]?.archivePath ?? null)
        setArchivePreviewState('ready')
        return
      }

      setArchivePreviewState('idle')
      setArchivePreviews([])
      setSelectedArchivePreviewPath(null)
      setArchivePreviewError(firstError)
    },
    [copy.library],
  )

  const openArchivePreviewForPath = useCallback(
    async (path: string) => {
      try {
        await openArchivePreviewForPaths([path])
      } catch (nextError) {
        dismissNotification(LAUNCHER_LIBRARY_ARCHIVE_PREVIEW_NOTIFICATION_ID)
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

  const inspectArchive = useCallback(async () => {
    const paths = await chooseArchiveFiles(copy.actions.chooseArchive)
    if (!paths.length) {
      return
    }

    void openArchivePreviewForPaths(paths)
  }, [copy.actions.chooseArchive, openArchivePreviewForPaths])

  const confirmArchiveInstall = useCallback(async () => {
    if (!archivePreviews.length) {
      return
    }

    const previewsToInstall = archivePreviews
    const total = previewsToInstall.length

    setInstallingArchive(true)
    setArchivePreviewState('idle')
    setArchivePreviews([])
    setSelectedArchivePreviewPath(null)
    setArchivePreviewError(null)
    publishNotification({
      id: LAUNCHER_LIBRARY_ARCHIVE_INSTALL_NOTIFICATION_ID,
      level: 'info',
      title: copy.library.installProgressTitle,
      description: formatInstallProgressDescription(copy.library, archiveFileNameFromPath(previewsToInstall[0]!.archivePath), 0, total),
      autoDismissMs: null,
      progress: 0,
    })

    let successfulInstalls = 0
    const successfulArchivePaths: string[] = []
    const installResults: InstallLauncherArchiveResult[] = []
    const installFailures: Array<{ archivePath: string; message: string }> = []

    try {
      for (const preview of previewsToInstall) {
        publishNotification({
          id: LAUNCHER_LIBRARY_ARCHIVE_INSTALL_NOTIFICATION_ID,
          level: 'info',
          title: copy.library.installProgressTitle,
          description: formatInstallProgressDescription(
            copy.library,
            archiveFileNameFromPath(preview.archivePath),
            successfulInstalls + installFailures.length,
            total,
          ),
          autoDismissMs: null,
          progress: total > 0 ? ((successfulInstalls + installFailures.length) / total) * 100 : 0,
        })

        try {
          const result = await library.installArchive(preview.archivePath)
          successfulInstalls += 1
          successfulArchivePaths.push(preview.archivePath)
          installResults.push(result)
        } catch (nextError) {
          installFailures.push({
            archivePath: preview.archivePath,
            message: installErrorMessage(nextError, copy.library.previewError),
          })
        }
      }

      dismissNotification(LAUNCHER_LIBRARY_ARCHIVE_INSTALL_NOTIFICATION_ID)
      publishArchiveInstallResult(installResults, installFailures)

      if (successfulInstalls > 0) {
        onArchiveInstallSuccess?.(successfulArchivePaths)
        void refreshLibrary()
      }
    } catch (nextError) {
      dismissNotification(LAUNCHER_LIBRARY_ARCHIVE_INSTALL_NOTIFICATION_ID)
      publishArchiveInstallResult(
        [],
        [{ archivePath: copy.actions.installArchive, message: installErrorMessage(nextError, copy.library.previewError) }],
      )
    } finally {
      setInstallingArchive(false)
    }
  }, [
    archivePreviews,
    copy.actions.installArchive,
    copy.library,
    library,
    onArchiveInstallSuccess,
    publishArchiveInstallResult,
    refreshLibrary,
  ])

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

      void openArchivePreviewForPaths(supportedPaths)
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
        setInstallBackupsState('error')
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

  const selectPack = useCallback(
    async (packId: string | null, options?: { closeDrawer?: boolean }) => {
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
    },
    [library, runLibraryAction],
  )

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
      if (library.selectedModIds.includes(modId) && library.selectedModIds.length) {
        return library.selectedModIds
      }
      return [modId]
    },
    [boxSelectionIds, editMode, editingSelectionIds, library.selectedModIds],
  )

  const createLibraryFolder = useCallback(() => {
    void runLibraryAction(async () => {
      await library.createLibraryFolder()
    })
  }, [library, runLibraryAction])

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

  const startChildModSelection = useCallback(
    (parentMod: LauncherLibraryItem) => {
      const parentLookup = normalizeLookupKey(getModKey(parentMod))
      const selectedModIds = (childGroupLookup.get(parentLookup)?.childModKeys ?? [])
        .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey))?.id)
        .filter((id): id is string => Boolean(id))
      setChildModSelection({ parentMod, selectedModIds })
      setEditMode(false)
      setEditingSelectionIds([])
      setBoxSelectionIds([])
      setQuickSwitchOpen(false)
      setPackActionMenuId(null)
      setSortMenuOpen(false)
      setDrawerOpen(false)
    },
    [childGroupLookup, modByKeyLookup],
  )

  const toggleChildModSelection = useCallback((modId: string) => {
    setChildModSelection((current) =>
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

  const cancelChildModSelection = useCallback(() => {
    setChildModSelection(null)
  }, [])

  const submitChildModSelection = useCallback(async () => {
    if (!childModSelection) {
      return
    }
    await runLibraryAction(async () => {
      await library.replaceChildMods(childModSelection.parentMod.id, childModSelection.selectedModIds)
    })
    setExpandedParentIds((current) =>
      current.includes(childModSelection.parentMod.id) ? current : [...current, childModSelection.parentMod.id],
    )
    setChildModSelection(null)
  }, [childModSelection, library, runLibraryAction])

  const startEditMode = useCallback(() => {
    if (!library.currentPack) {
      return
    }
    setChildModSelection(null)
    setEditingSelectionIds(getPackModIds(library.currentPack, library.mods))
    setEditMode(true)
    setQuickSwitchOpen(false)
    setPackActionMenuId(null)
    setSortMenuOpen(false)
    setDrawerOpen(false)
  }, [library.currentPack, library.mods])

  const startEditingPack = useCallback(
    (pack: LauncherPackPreset, isCurrentPack: boolean) => {
      if (isCurrentPack) {
        startEditMode()
        return
      }
      void (async () => {
        const switched = await selectPack(pack.id)
        if (!switched) {
          return
        }
        setEditingSelectionIds(getPackModIds(pack, library.mods))
        setEditMode(true)
        setPackActionMenuId(null)
      })()
    },
    [library.mods, selectPack, startEditMode],
  )

  const cancelEditMode = useCallback(() => {
    setEditingSelectionIds([])
    setEditMode(false)
  }, [])

  const saveEditMode = useCallback(
    () =>
      runLibraryAction(async () => {
        if (!library.currentPack) {
          return
        }
        await library.replacePackMods(library.currentPack.id, editingSelectionIds)
        setEditMode(false)
      }),
    [editingSelectionIds, library, runLibraryAction],
  )

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
        await library.createPackPreset(nextName)
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
        await library.renamePackPreset(packDialog.pack.id, nextName)
      })
      if (success) {
        setPackDialog(null)
      }
      return
    }

    const success = await runLibraryAction(async () => {
      await library.deletePackPreset(packDialog.pack.id)
    })
    if (!success) {
      return
    }
    if (library.currentPack && normalizeLookupKey(library.currentPack.id) === normalizeLookupKey(packDialog.pack.id)) {
      setEditMode(false)
    }
    setPackDialog(null)
  }, [library, packDialog, runLibraryAction])

  const submitFolderDialog = useCallback(async () => {
    if (!folderDialog) {
      return
    }
    const nextName = folderDialog.value.trim()
    if (!nextName) {
      return
    }
    const success = await runLibraryAction(async () => {
      await library.renameLibraryFolder(folderDialog.folder.id, nextName)
    })
    if (success) {
      setFolderDialog(null)
    }
  }, [folderDialog, library, runLibraryAction])

  const isParentExpanded = useCallback((modId: string) => expandedParentIds.includes(modId), [expandedParentIds])
  const openGridModFolder = useCallback((mod: LauncherLibraryItem) => void openModFolder(mod), [openModFolder])
  const assignDraggedModsToLibraryFolderFromDnd = useCallback(
    (folderId: string, modIds: string[]) => {
      void assignDraggedModsToLibraryFolder(folderId, modIds)
    },
    [assignDraggedModsToLibraryFolder],
  )

  const addDraggedModsToPack = useCallback(
    (packId: string, modIds: string[]) => {
      void runLibraryAction(async () => {
        await library.addModsToPack(packId, modIds)
      })
    },
    [library, runLibraryAction],
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
        { label: mod.enabled ? copy.actions.disable : copy.actions.enable, onSelect: () => void library.toggleEnabled(mod) },
        { label: copy.library.chooseChildMods, onSelect: () => startChildModSelection(mod) },
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
      childGroupLookup,
      childParentLookup,
      clearModCover,
      copy.actions,
      copy.library.manageChildMods,
      copy.library.removeFromParent,
      copy.library.chooseChildMods,
      hiddenModKeyLookup,
      library,
      modByKeyLookup,
      openGalleryCoverDialog,
      openModDetails,
      openModFolder,
      removeChildMod,
      runLibraryAction,
      setModCover,
      startChildModSelection,
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
              await library.setModsEnabled(folderModIds, true)
            }),
        },
        {
          label: copy.library.disableLibraryFolder,
          onSelect: () =>
            void runLibraryAction(async () => {
              await library.setModsEnabled(folderModIds, false)
            }),
        },
      ]
    },
    [
      copy.library,
      getLibraryFolderModIds,
      isLibraryFolderOpen,
      library,
      openRenameLibraryFolderDialog,
      runLibraryAction,
      toggleLibraryFolderOpen,
    ],
  )

  return {
    viewModel: {
      packLookup,
      childGroupLookup,
      childParentLookup,
      hiddenModKeyLookup,
      hiddenMods,
      visibleLibraryModsCount,
      detailMod,
      visibleMods,
      modByKeyLookup,
      libraryFolderModLookup,
      visibleDisplayItems,
      openLibraryFolderItemsById,
      shortModsPath,
      sortOptions,
      currentSortLabel,
      editCount,
      currentPackLabel,
      supportedArchiveFormatsLabel,
    },
    refs: {
      titleMenuRef,
      drawerPanelRef,
      sortMenuRef,
      packDialogInputRef,
      installBackupsOpenRef,
    },
    dialogState: {
      archivePreviewState,
      archivePreviews,
      selectedArchivePreviewPath,
      archivePreviewError,
      installingArchive,
      installResult,
      installBackupsOpen,
      installBackupsState,
      installBackups,
      installBackupsError,
      restoringBackupId,
      packDialog,
      folderDialog,
      galleryCoverDialog,
      childModManager,
    },
    dragState: {
      editMode,
      editingSelectionIds,
      boxSelectionIds,
      childModSelection,
      archiveDropActive,
      expandedParentIds,
    },
    shellState: {
      actionError,
      sortMode,
      sortMenuOpen,
      drawerOpen,
      quickSwitchOpen,
      packActionMenuId,
      hiddenViewOpen,
    },
    actions: {
      closeArchivePreview,
      closeInstallSummary,
      openInstallSummary,
      openArchivePreviewForPaths,
      openArchivePreviewForPath,
      closeInstallBackupsDialog,
      loadInstallBackups,
      openInstallBackupsDialog,
      openInstallBackupsFromSummary,
      refreshLibrary,
      runLibraryAction,
      inspectArchive,
      confirmArchiveInstall,
      restoreInstallBackupSession,
      openLibraryRoot,
      openModFolder,
      setModCover,
      clearModCover,
      closeGalleryCoverDialog,
      openGalleryCoverDialog,
      applyGalleryCover,
      openModDetails,
      toggleEditSelection,
      updateBoxSelection,
      toggleChildModSelection,
      cancelChildModSelection,
      submitChildModSelection,
      selectPack,
      selectHiddenView,
      resolveDraggedModIds,
      createLibraryFolder,
      removeDraggedChildModsFromParent,
      assignDraggedModsToLibraryFolder,
      removeDraggedModsFromLibraryFolders,
      moveDraggedFolderToFolder,
      toggleParentExpanded,
      removeChildMod,
      startEditMode,
      startEditingPack,
      cancelEditMode,
      saveEditMode,
      openCreatePackDialog,
      openRenamePackDialog,
      openDeletePackDialog,
      closePackDialog,
      openRenameLibraryFolderDialog,
      closeFolderDialog,
      submitPackDialog,
      submitFolderDialog,
      isParentExpanded,
      openGridModFolder,
      assignDraggedModsToLibraryFolderFromDnd,
      addDraggedModsToPack,
      directActionsForMod,
      directActionsForLibraryFolder,
      setArchivePreviewState,
      setArchivePreviews,
      setSelectedArchivePreviewPath,
      setArchivePreviewError,
      setInstallingArchive,
      setInstallResult,
      setInstallBackupsOpen,
      setInstallBackupsState,
      setInstallBackups,
      setInstallBackupsError,
      setRestoringBackupId,
      setActionError,
      setSortMode,
      setSortMenuOpen,
      setDetailModId,
      setDrawerOpen,
      setQuickSwitchOpen,
      setPackActionMenuId,
      setPackDialog,
      setFolderDialog,
      setGalleryCoverDialog,
      setHiddenViewOpen,
      setEditMode,
      setEditingSelectionIds,
      setBoxSelectionIds,
      setArchiveDropActive,
      setExpandedParentIds,
      setChildModManager,
      isLibraryFolderOpen,
      getLibraryFolderModIds,
      toggleLibraryFolderOpen,
      closeLibraryFolder,
    },
  }
}
