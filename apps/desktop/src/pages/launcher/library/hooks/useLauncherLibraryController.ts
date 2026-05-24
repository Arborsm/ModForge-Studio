import { useCallback, useEffect, useRef, useState } from 'react'
import type { LauncherCopy } from '@locales/schema'
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
  chooseArchiveFile,
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
}

type DroppedArchivePaths = {
  supportedPaths: string[]
  missingPathCount: number
  unsupportedCount: number
}

const LAUNCHER_LIBRARY_GALLERY_LOADING_NOTIFICATION_ID = 'launcher-library-gallery-loading'
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

/** Coordinates launcher-library page state, derived display data, and local interaction refs. */
export function useLauncherLibraryController({ settings, library, refresh, copy }: LauncherLibraryControllerInput) {
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
  const [childModManager, setChildModManager] = useState<
    import('@features/launcher/ui/shared/LauncherChildModsDialogs').LauncherChildModManagerState | null
  >(null)
  const [childModPicker, setChildModPicker] = useState<
    import('@features/launcher/ui/shared/LauncherChildModsDialogs').LauncherChildModPickerState | null
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
    expandedParentIds,
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

      setArchivePreviewState('idle')
      setArchivePreviews([])
      setSelectedArchivePreviewPath(null)
      setArchivePreviewError(firstError)
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

  const inspectArchive = useCallback(async () => {
    const path = await chooseArchiveFile(copy.actions.chooseArchive)
    if (!path) {
      return
    }

    await openArchivePreviewForPath(path)
  }, [copy.actions.chooseArchive, openArchivePreviewForPath])

  const confirmArchiveInstall = useCallback(async () => {
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
  }, [archivePreviews, closeArchivePreview, library, publishArchiveInstallError, publishArchiveInstallSuccess, refreshLibrary])

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

  const startEditMode = useCallback(() => {
    if (!library.currentPack) {
      return
    }
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
      childGroupLookup,
      childParentLookup,
      clearModCover,
      copy.actions,
      copy.library.manageChildMods,
      copy.library.removeFromParent,
      copy.library.setAsChildMod,
      hiddenModKeyLookup,
      library,
      modByKeyLookup,
      openChildModPicker,
      openGalleryCoverDialog,
      openModDetails,
      openModFolder,
      removeChildMod,
      runLibraryAction,
      setModCover,
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
      childModPicker,
    },
    dragState: {
      editMode,
      editingSelectionIds,
      boxSelectionIds,
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
      selectPack,
      selectHiddenView,
      resolveDraggedModIds,
      createLibraryFolder,
      assignDraggedModsToParent,
      removeDraggedChildModsFromParent,
      assignDraggedModsToLibraryFolder,
      removeDraggedModsFromLibraryFolders,
      moveDraggedFolderToFolder,
      toggleParentExpanded,
      removeChildMod,
      openChildModPicker,
      toggleChildModPickerSelection,
      submitChildModPicker,
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
      assignDraggedModsToParentFromDnd,
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
      setChildModPicker,
      isLibraryFolderOpen,
      getLibraryFolderModIds,
      toggleLibraryFolderOpen,
      closeLibraryFolder,
    },
  }
}
