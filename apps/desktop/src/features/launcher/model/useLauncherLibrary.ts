import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import { useEditorCopy } from '@locales/localeContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import type {
  LauncherLibraryModSummary,
  LauncherLibraryPackPreset,
  LauncherLibraryScopeMode,
  LauncherLibraryState,
  LauncherLibraryStorageFolder,
} from './launcherContracts'
import { getLauncherCoverKey, getLauncherCoverKeyCandidates } from './coverKey'
import { getModKey, includesFilter, normalizeLookupKey, normalizeModKey } from './libraryHelpers'
import { canAutoCheckLauncherUpdates, canAutoFetchLauncherRemoteCovers } from './nexusDiagnostics'
import type { LauncherSettingsDraft, LauncherViewState } from './types'

const UNSORTED_FOLDER_ID = 'unsorted'
const UNSORTED_FOLDER_NAME = 'Unsorted'
const LAUNCHER_LIBRARY_AUTO_COVER_CONCURRENCY = 3
const LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID = 'launcher-library-auto-cover-progress'

function createDefaultLibraryState(): LauncherLibraryState {
  return {
    storageFolders: [
      {
        id: UNSORTED_FOLDER_ID,
        name: UNSORTED_FOLDER_NAME,
        modKeys: [],
      },
    ],
    hiddenModKeys: [],
    packPresets: [],
    currentPackId: null,
    scopeMode: 'all',
  }
}

function normalizeLibraryState(state: LauncherLibraryState): LauncherLibraryState {
  const seenFolderIds = new Set<string>()
  const seenFolderModKeys = new Set<string>()
  const storageFolders: LauncherLibraryStorageFolder[] = []
  let hasUnsortedFolder = false

  for (const folder of state.storageFolders) {
    const id = folder.id.trim()
    const name = folder.name.trim()
    if (!id || !name) {
      continue
    }

    const idLookup = normalizeLookupKey(id)
    const canonicalId = idLookup === UNSORTED_FOLDER_ID ? UNSORTED_FOLDER_ID : id
    if (idLookup === UNSORTED_FOLDER_ID) {
      hasUnsortedFolder = true
    }
    if (seenFolderIds.has(normalizeLookupKey(canonicalId))) {
      continue
    }
    seenFolderIds.add(normalizeLookupKey(canonicalId))

    const seenInFolder = new Set<string>()
    const modKeys: string[] = []
    for (const modKeyValue of folder.modKeys) {
      const modKey = normalizeModKey(modKeyValue)
      if (!modKey) {
        continue
      }

      const modLookup = normalizeLookupKey(modKey)
      if (seenInFolder.has(modLookup) || seenFolderModKeys.has(modLookup)) {
        continue
      }

      seenInFolder.add(modLookup)
      seenFolderModKeys.add(modLookup)
      modKeys.push(modKey)
    }

    storageFolders.push({
      id: canonicalId,
      name: canonicalId === UNSORTED_FOLDER_ID ? UNSORTED_FOLDER_NAME : name,
      modKeys,
    })
  }

  if (!hasUnsortedFolder) {
    storageFolders.push({
      id: UNSORTED_FOLDER_ID,
      name: UNSORTED_FOLDER_NAME,
      modKeys: [],
    })
  }

  const seenPackIds = new Set<string>()
  const packIdLookup = new Map<string, string>()
  const packPresets: LauncherLibraryPackPreset[] = []
  for (const pack of state.packPresets) {
    const id = pack.id.trim()
    const name = pack.name.trim()
    if (!id || !name) {
      continue
    }

    const idLookup = normalizeLookupKey(id)
    if (seenPackIds.has(idLookup)) {
      continue
    }
    seenPackIds.add(idLookup)
    packIdLookup.set(idLookup, id)

    const seenPackMods = new Set<string>()
    const modKeys: string[] = []
    for (const modKeyValue of pack.modKeys) {
      const modKey = normalizeModKey(modKeyValue)
      if (!modKey) {
        continue
      }
      const modLookup = normalizeLookupKey(modKey)
      if (seenPackMods.has(modLookup)) {
        continue
      }
      seenPackMods.add(modLookup)
      modKeys.push(modKey)
    }

    packPresets.push({
      id,
      name,
      modKeys,
    })
  }

  const requestedCurrentPackId = state.currentPackId?.trim()
  const currentPackId = requestedCurrentPackId ? (packIdLookup.get(normalizeLookupKey(requestedCurrentPackId)) ?? null) : null

  const seenHiddenModKeys = new Set<string>()
  const hiddenModKeys = (state.hiddenModKeys ?? [])
    .map((value) => normalizeModKey(value))
    .filter(Boolean)
    .filter((value) => {
      const lookup = normalizeLookupKey(value)
      if (seenHiddenModKeys.has(lookup)) {
        return false
      }
      seenHiddenModKeys.add(lookup)
      return true
    })

  const scopeMode: LauncherLibraryScopeMode = state.scopeMode === 'current-pack' ? 'current-pack' : 'all'

  return {
    storageFolders,
    hiddenModKeys,
    packPresets,
    currentPackId,
    scopeMode,
  }
}

function slugifyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function nextUniqueId(existingIds: string[], rawName: string, fallback: string) {
  const base = slugifyName(rawName) || fallback
  const existing = new Set(existingIds.map((value) => normalizeLookupKey(value)))
  let candidate = base
  let suffix = 1
  while (existing.has(normalizeLookupKey(candidate))) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}

function normalizeSuppressedModIds(values: number[] | null | undefined) {
  return new Set((values ?? []).map((value) => Math.trunc(value)).filter((value) => Number.isFinite(value) && value > 0))
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        await worker(items[currentIndex]!)
      }
    }),
  )
}

type AutoCoverProgressStage = 'local' | 'apiCover' | 'apiGallery' | 'remoteCover' | 'remoteGallery'

export function useLauncherLibrary(settings: LauncherSettingsDraft) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher
  const [mods, setMods] = useState<LauncherLibraryModSummary[]>([])
  const [libraryState, setLibraryState] = useState<LauncherLibraryState>(createDefaultLibraryState())
  const [selectedModIds, setSelectedModIds] = useState<string[]>([])
  const [selectedModId, setSelectedModId] = useState<string | null>(null)
  const [activeStorageFolderId, setActiveStorageFolderId] = useState<string | null>(null)
  const [filterText, setFilterTextState] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const autoCoverFetchInFlightRef = useRef(false)
  const autoCoverTaskTokenRef = useRef(0)
  const refreshRequestTokenRef = useRef(0)
  const mountedRef = useRef(true)

  const persistLibraryState = useCallback(
    async (nextState: LauncherLibraryState) => {
      const persisted = await launcherPort.saveLibraryState(normalizeLibraryState(nextState))
      const normalized = normalizeLibraryState(persisted)
      setLibraryState(normalized)
      return normalized
    },
    [launcherPort],
  )

  const cancelAutoCoverFetch = useCallback(() => {
    if (!autoCoverFetchInFlightRef.current) {
      return
    }

    autoCoverTaskTokenRef.current += 1
    autoCoverFetchInFlightRef.current = false
    dismissNotification(LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID)
  }, [])

  const startAutoCoverFetch = useCallback(
    (eligibleMods: LauncherLibraryModSummary[]) => {
      if (!eligibleMods.length) {
        return
      }

      const taskToken = autoCoverTaskTokenRef.current + 1
      autoCoverTaskTokenRef.current = taskToken
      autoCoverFetchInFlightRef.current = true
      let completed = 0

      const isTaskActive = () => mountedRef.current && autoCoverTaskTokenRef.current === taskToken

      const publishAutoCoverNotification = (modName: string, stage: AutoCoverProgressStage, nextCompleted: number) => {
        if (!isTaskActive()) {
          return
        }

        publishNotification({
          id: LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID,
          level: 'info',
          title: copy.library.loadingMissingCoversCurrentMod(modName),
          description: copy.library.loadingMissingCoversStageProgress(
            copy.library.loadingMissingCoversStages[stage],
            nextCompleted,
            eligibleMods.length,
          ),
          autoDismissMs: null,
          progress: eligibleMods.length > 0 ? (nextCompleted / eligibleMods.length) * 100 : 0,
        })
      }

      void runWithConcurrency(eligibleMods, LAUNCHER_LIBRARY_AUTO_COVER_CONCURRENCY, async (item) => {
        if (!isTaskActive() || item.nexusModId == null) {
          return
        }

        let activeStage: AutoCoverProgressStage = 'local'

        try {
          publishAutoCoverNotification(item.name, activeStage, completed)
          activeStage = 'apiCover'
          publishAutoCoverNotification(item.name, activeStage, completed)

          const detail = await launcherPort.loadRemoteModDetail({ modId: item.nexusModId })
          if (!isTaskActive()) {
            return
          }

          let imageUrl = detail.imageUrl?.trim() || null
          if (imageUrl) {
            activeStage = 'remoteCover'
            publishAutoCoverNotification(item.name, activeStage, completed)
          } else {
            activeStage = 'apiGallery'
            publishAutoCoverNotification(item.name, activeStage, completed)
            imageUrl = detail.galleryImages.find((value) => value.trim())?.trim() || null
            if (imageUrl) {
              activeStage = 'remoteGallery'
              publishAutoCoverNotification(item.name, activeStage, completed)
            }
          }
          if (!imageUrl) {
            return
          }

          const coverKey = getLauncherCoverKey(item)
          const covers = await launcherPort.persistLibraryRemoteCover({
            labelKey: coverKey,
            imageUrl,
          })

          if (!isTaskActive()) {
            return
          }

          const persistedImagePath =
            covers.covers.find((cover) => normalizeLookupKey(cover.labelKey) === normalizeLookupKey(coverKey))?.imagePath ?? null
          if (persistedImagePath) {
            setMods((current) =>
              current.map((mod) =>
                normalizeLookupKey(getLauncherCoverKey(mod)) === normalizeLookupKey(coverKey)
                  ? { ...mod, imageUrl: persistedImagePath }
                  : mod,
              ),
            )
          }
        } catch {
          // Individual auto-cover failures should not fail the library page.
        } finally {
          if (isTaskActive()) {
            completed += 1
            publishAutoCoverNotification(item.name, activeStage, completed)
          }
        }
      }).finally(() => {
        if (!isTaskActive()) {
          return
        }

        autoCoverFetchInFlightRef.current = false
        dismissNotification(LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID)
      })
    },
    [copy.library, launcherPort],
  )

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      cancelAutoCoverFetch()
    }
  }, [cancelAutoCoverFetch])

  const refresh = useCallback(async () => {
    const requestToken = refreshRequestTokenRef.current + 1
    refreshRequestTokenRef.current = requestToken
    const isRefreshActive = () => mountedRef.current && refreshRequestTokenRef.current === requestToken

    cancelAutoCoverFetch()
    launcherPort.clearLibraryReadCaches(settings.modsPath)
    setState('loading')
    setError(null)

    try {
      const suppressedUpdateModIdsPromise = settings.modsPath
        ? launcherPort.loadSuppressedUpdateModIds({ modsPath: settings.modsPath }).catch(() => null)
        : Promise.resolve(null)

      const [diagnostics, loadedLibraryState, loadedCovers, scan, suppressedUpdateModIdsResult] = await Promise.all([
        launcherPort.loadNexusDiagnostics().catch(() => null),
        launcherPort.loadLibraryState(),
        launcherPort.loadLibraryCovers(),
        settings.modsPath
          ? launcherPort.scanLibrary({ modsPath: settings.modsPath })
          : Promise.resolve({
              modsPath: settings.modsPath ?? '',
              mods: [],
            }),
        suppressedUpdateModIdsPromise,
      ])

      const savedCoverLookup = new Set(loadedCovers.covers.map((cover) => normalizeLookupKey(cover.labelKey)))
      const suppressedUpdateModIds = normalizeSuppressedModIds(suppressedUpdateModIdsResult?.modIds)
      const eligibleMods = scan.mods.filter(
        (item) =>
          item.nexusModId != null &&
          !suppressedUpdateModIds.has(item.nexusModId) &&
          !item.imageUrl?.trim() &&
          !getLauncherCoverKeyCandidates(item).some((value) => savedCoverLookup.has(normalizeLookupKey(value))),
      )

      if (!isRefreshActive()) {
        return
      }

      setLibraryState(normalizeLibraryState(loadedLibraryState))
      setMods(scan.mods)
      setSelectedModId((current) => current ?? scan.mods[0]?.id ?? null)
      setSelectedModIds((current) => current.filter((id) => scan.mods.some((item) => item.id === id)))
      setState('ready')
      if (canAutoFetchLauncherRemoteCovers(diagnostics)) {
        startAutoCoverFetch(eligibleMods)
      }
      const updateModsPath = scan.modsPath || settings.modsPath || ''
      if (settings.autoCheckModUpdates && scan.mods.length > 0 && updateModsPath && canAutoCheckLauncherUpdates(diagnostics)) {
        void launcherPort
          .loadCachedUpdates({ modsPath: updateModsPath })
          .then((cached) => {
            if (!isRefreshActive()) {
              return
            }
            if (cached && cached.isComplete !== false) {
              return
            }

            return launcherPort
              .checkUpdates({
                modsPath: updateModsPath,
                forceRefresh: false,
              })
              .then(() => undefined)
          })
          .catch(() => {
            // Background update cache warming should not interrupt the library page.
          })
      }
    } catch (nextError) {
      if (!isRefreshActive()) {
        return
      }

      setError(nextError instanceof Error ? nextError.message : 'Failed to scan launcher library.')
      setState('error')
    }
  }, [cancelAutoCoverFetch, launcherPort, settings.autoCheckModUpdates, settings.modsPath, startAutoCoverFetch])

  const storageFolders = libraryState.storageFolders
  const hiddenModKeys = libraryState.hiddenModKeys
  const packPresets = libraryState.packPresets
  const scopeMode = libraryState.scopeMode
  const currentPackId = libraryState.currentPackId

  const currentPack = useMemo(
    () => (currentPackId ? (packPresets.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId)) ?? null) : null),
    [currentPackId, packPresets],
  )

  const activeStorageFolder = useMemo(
    () =>
      activeStorageFolderId
        ? (storageFolders.find((folder) => normalizeLookupKey(folder.id) === normalizeLookupKey(activeStorageFolderId)) ?? null)
        : null,
    [activeStorageFolderId, storageFolders],
  )

  const filteredMods = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase()
    const currentPackMemberKeys = new Set((currentPack?.modKeys ?? []).map((value) => normalizeLookupKey(value)))
    const activeStorageFolderKeys = new Set((activeStorageFolder?.modKeys ?? []).map((value) => normalizeLookupKey(value)))
    const hiddenLookup = new Set(hiddenModKeys.map((value) => normalizeLookupKey(value)))

    return mods.filter((item) => {
      const modKey = getModKey(item)

      if (hiddenLookup.has(normalizeLookupKey(modKey))) {
        return false
      }

      if (activeStorageFolder && !activeStorageFolderKeys.has(normalizeLookupKey(modKey))) {
        return false
      }

      if (scopeMode === 'current-pack') {
        if (!modKey || !currentPackMemberKeys.has(normalizeLookupKey(modKey))) {
          return false
        }
      }

      if (enabledOnly && !item.enabled) {
        return false
      }

      return includesFilter(item, normalizedFilter)
    })
  }, [activeStorageFolder, currentPack?.modKeys, enabledOnly, filterText, hiddenModKeys, mods, scopeMode])

  const selectedMod = useMemo(
    () => filteredMods.find((item) => item.id === selectedModId) ?? mods.find((item) => item.id === selectedModId) ?? null,
    [filteredMods, mods, selectedModId],
  )

  const selection = useMemo(() => mods.filter((item) => selectedModIds.includes(item.id)), [mods, selectedModIds])

  const toggleEnabled = useCallback(
    async (mod: LauncherLibraryModSummary) => {
      await launcherPort.setModEnabled({
        modPath: mod.absolutePath,
        enabled: !mod.enabled,
      })
      await refresh()
    },
    [launcherPort, refresh],
  )

  const installArchive = useCallback(
    async (archivePath: string) => {
      return launcherPort.installArchive({
        archivePath,
        modsPath: settings.modsPath,
      })
    },
    [launcherPort, settings.modsPath],
  )

  const toggleModSelection = useCallback((id: string) => {
    setSelectedModIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
    setSelectedModId(id)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedModIds([])
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedModIds(filteredMods.map((item) => item.id))
  }, [filteredMods])

  const assignSelectionToFolder = useCallback(
    async (folderId: string) => {
      const normalizedFolderId = folderId.trim()
      if (!normalizedFolderId || !selection.length) {
        return
      }
      if (!storageFolders.some((folder) => normalizeLookupKey(folder.id) === normalizeLookupKey(normalizedFolderId))) {
        return
      }

      const selectedModKeys = selection
        .map(getModKey)
        .map((value) => value.trim())
        .filter(Boolean)
      if (!selectedModKeys.length) {
        return
      }

      const selectedLookup = new Set(selectedModKeys.map((value) => normalizeLookupKey(value)))
      const orderedSelectedModKeys = Array.from(new Map(selectedModKeys.map((value) => [normalizeLookupKey(value), value])).values())

      const nextState: LauncherLibraryState = {
        ...libraryState,
        storageFolders: storageFolders.map((folder) => {
          const cleaned = folder.modKeys.filter((value) => !selectedLookup.has(normalizeLookupKey(value)))
          if (normalizeLookupKey(folder.id) !== normalizeLookupKey(normalizedFolderId)) {
            return {
              ...folder,
              modKeys: cleaned,
            }
          }

          const merged = [...cleaned]
          const seen = new Set(cleaned.map((value) => normalizeLookupKey(value)))
          for (const modKey of orderedSelectedModKeys) {
            const modLookup = normalizeLookupKey(modKey)
            if (seen.has(modLookup)) {
              continue
            }
            seen.add(modLookup)
            merged.push(modKey)
          }

          return {
            ...folder,
            modKeys: merged,
          }
        }),
      }

      await persistLibraryState(nextState)
    },
    [libraryState, persistLibraryState, selection, storageFolders],
  )

  const createStorageFolder = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }

      const id = nextUniqueId(
        storageFolders.map((folder) => folder.id),
        trimmed,
        'folder',
      )
      await persistLibraryState({
        ...libraryState,
        storageFolders: [...storageFolders, { id, name: trimmed, modKeys: [] }],
      })
    },
    [libraryState, persistLibraryState, storageFolders],
  )

  const renameStorageFolder = useCallback(
    async (folderId: string, name: string) => {
      const normalizedFolderId = folderId.trim()
      const trimmed = name.trim()
      if (!normalizedFolderId || !trimmed || normalizeLookupKey(normalizedFolderId) === UNSORTED_FOLDER_ID) {
        return
      }

      await persistLibraryState({
        ...libraryState,
        storageFolders: storageFolders.map((folder) =>
          normalizeLookupKey(folder.id) === normalizeLookupKey(normalizedFolderId)
            ? {
                ...folder,
                name: trimmed,
              }
            : folder,
        ),
      })
    },
    [libraryState, persistLibraryState, storageFolders],
  )

  const deleteStorageFolder = useCallback(
    async (folderId: string) => {
      const normalizedFolderId = folderId.trim()
      if (!normalizedFolderId || normalizeLookupKey(normalizedFolderId) === UNSORTED_FOLDER_ID) {
        return
      }

      const target = storageFolders.find((folder) => normalizeLookupKey(folder.id) === normalizeLookupKey(normalizedFolderId))
      if (!target) {
        return
      }
      const unsorted = storageFolders.find((folder) => normalizeLookupKey(folder.id) === UNSORTED_FOLDER_ID)
      const unsortedKeys = unsorted?.modKeys ?? []
      const mergedUnsortedKeys = Array.from(
        new Map([...unsortedKeys, ...target.modKeys].map((value) => [normalizeLookupKey(value), value])).values(),
      )

      await persistLibraryState({
        ...libraryState,
        storageFolders: storageFolders
          .filter((folder) => normalizeLookupKey(folder.id) !== normalizeLookupKey(normalizedFolderId))
          .map((folder) =>
            normalizeLookupKey(folder.id) === UNSORTED_FOLDER_ID
              ? {
                  ...folder,
                  modKeys: mergedUnsortedKeys,
                }
              : folder,
          ),
      })
    },
    [libraryState, persistLibraryState, storageFolders],
  )

  const addSelectionToPack = useCallback(
    async (packId: string) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId || !selection.length) {
        return
      }

      const selectedModKeys = Array.from(
        new Map(selection.map(getModKey).map((value) => [normalizeLookupKey(value), value])).values(),
      ).filter(Boolean)

      await persistLibraryState({
        ...libraryState,
        packPresets: packPresets.map((pack) => {
          if (normalizeLookupKey(pack.id) !== normalizeLookupKey(normalizedPackId)) {
            return pack
          }
          const existing = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
          const modKeys = [...pack.modKeys]
          for (const modKey of selectedModKeys) {
            const modLookup = normalizeLookupKey(modKey)
            if (existing.has(modLookup)) {
              continue
            }
            existing.add(modLookup)
            modKeys.push(modKey)
          }
          return {
            ...pack,
            modKeys,
          }
        }),
      })
    },
    [libraryState, packPresets, persistLibraryState, selection],
  )

  const addModsToPack = useCallback(
    async (packId: string, modIds: string[]) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId) {
        return
      }

      const selectedModKeys = Array.from(
        new Map(
          modIds
            .map((id) => mods.find((item) => item.id === id))
            .filter((item): item is LauncherLibraryModSummary => Boolean(item))
            .map(getModKey)
            .map((value) => [normalizeLookupKey(value), value]),
        ).values(),
      ).filter(Boolean)

      if (!selectedModKeys.length) {
        return
      }

      await persistLibraryState({
        ...libraryState,
        packPresets: packPresets.map((pack) => {
          if (normalizeLookupKey(pack.id) !== normalizeLookupKey(normalizedPackId)) {
            return pack
          }
          const existing = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
          const modKeys = [...pack.modKeys]
          for (const modKey of selectedModKeys) {
            const modLookup = normalizeLookupKey(modKey)
            if (existing.has(modLookup)) {
              continue
            }
            existing.add(modLookup)
            modKeys.push(modKey)
          }
          return {
            ...pack,
            modKeys,
          }
        }),
      })
    },
    [libraryState, mods, packPresets, persistLibraryState],
  )

  const hideMods = useCallback(
    async (modIds: string[]) => {
      const modKeys = Array.from(
        new Map(
          modIds
            .map((id) => mods.find((item) => item.id === id))
            .filter((item): item is LauncherLibraryModSummary => Boolean(item))
            .map(getModKey)
            .map((value) => [normalizeLookupKey(value), value]),
        ).values(),
      ).filter(Boolean)

      if (!modKeys.length) {
        return
      }

      const existing = new Set(hiddenModKeys.map((value) => normalizeLookupKey(value)))
      const nextHiddenModKeys = [...hiddenModKeys]
      for (const modKey of modKeys) {
        const lookup = normalizeLookupKey(modKey)
        if (existing.has(lookup)) {
          continue
        }
        existing.add(lookup)
        nextHiddenModKeys.push(modKey)
      }

      await persistLibraryState({
        ...libraryState,
        hiddenModKeys: nextHiddenModKeys,
      })
    },
    [hiddenModKeys, libraryState, mods, persistLibraryState],
  )

  const showMods = useCallback(
    async (modIds: string[]) => {
      const modLookup = new Set(
        modIds
          .map((id) => mods.find((item) => item.id === id))
          .filter((item): item is LauncherLibraryModSummary => Boolean(item))
          .map(getModKey)
          .map((value) => normalizeLookupKey(value)),
      )

      if (!modLookup.size) {
        return
      }

      await persistLibraryState({
        ...libraryState,
        hiddenModKeys: hiddenModKeys.filter((value) => !modLookup.has(normalizeLookupKey(value))),
      })
    },
    [hiddenModKeys, libraryState, mods, persistLibraryState],
  )

  const createPackPreset = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }
      const id = nextUniqueId(
        packPresets.map((pack) => pack.id),
        trimmed,
        'pack',
      )
      await persistLibraryState({
        ...libraryState,
        packPresets: [...packPresets, { id, name: trimmed, modKeys: [] }],
      })
    },
    [libraryState, packPresets, persistLibraryState],
  )

  const renamePackPreset = useCallback(
    async (packId: string, name: string) => {
      const normalizedPackId = packId.trim()
      const trimmed = name.trim()
      if (!normalizedPackId || !trimmed) {
        return
      }

      await persistLibraryState({
        ...libraryState,
        packPresets: packPresets.map((pack) =>
          normalizeLookupKey(pack.id) === normalizeLookupKey(normalizedPackId)
            ? {
                ...pack,
                name: trimmed,
              }
            : pack,
        ),
      })
    },
    [libraryState, packPresets, persistLibraryState],
  )

  const deletePackPreset = useCallback(
    async (packId: string) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId) {
        return
      }

      const nextCurrentPackId =
        currentPackId && normalizeLookupKey(currentPackId) === normalizeLookupKey(normalizedPackId) ? null : currentPackId

      await persistLibraryState({
        ...libraryState,
        currentPackId: nextCurrentPackId,
        packPresets: packPresets.filter((pack) => normalizeLookupKey(pack.id) !== normalizeLookupKey(normalizedPackId)),
      })
    },
    [currentPackId, libraryState, packPresets, persistLibraryState],
  )

  const setCurrentPackId = useCallback(
    async (nextPackId: string | null) => {
      const normalizedPackId = nextPackId?.trim() || null
      const validPackId = normalizedPackId
        ? (packPresets.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(normalizedPackId))?.id ?? null)
        : null
      await persistLibraryState({
        ...libraryState,
        currentPackId: validPackId,
      })
    },
    [libraryState, packPresets, persistLibraryState],
  )

  const replacePackMods = useCallback(
    async (packId: string, modIds: string[]) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId) {
        return
      }

      const uniqueModIds = Array.from(new Set(modIds.map((value) => value.trim()).filter(Boolean)))
      const replacementKeys = uniqueModIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)
        .map((value) => value.trim())
        .filter(Boolean)

      await persistLibraryState({
        ...libraryState,
        packPresets: packPresets.map((pack) =>
          normalizeLookupKey(pack.id) === normalizeLookupKey(normalizedPackId)
            ? {
                ...pack,
                modKeys: replacementKeys,
              }
            : pack,
        ),
      })
    },
    [libraryState, mods, packPresets, persistLibraryState],
  )

  const setScopeMode = useCallback(
    async (nextScopeMode: LauncherLibraryScopeMode) => {
      await persistLibraryState({
        ...libraryState,
        scopeMode: nextScopeMode,
      })
    },
    [libraryState, persistLibraryState],
  )

  const applyCurrentPack = useCallback(async () => {
    if (!currentPack) {
      return
    }

    const desiredKeys = new Set(currentPack.modKeys.map((value) => normalizeLookupKey(value)))
    await Promise.all(
      mods.map(async (item) => {
        const modKey = getModKey(item)
        const shouldEnable = desiredKeys.has(normalizeLookupKey(modKey))
        if (item.enabled === shouldEnable) {
          return
        }
        await launcherPort.setModEnabled({
          modPath: item.absolutePath,
          enabled: shouldEnable,
        })
      }),
    )
    setSelectedModIds([])
    await refresh()
  }, [currentPack, launcherPort, mods, refresh])

  const setSelectionEnabled = useCallback(
    async (enabled: boolean) => {
      await Promise.all(
        selection
          .filter((item) => item.enabled !== enabled)
          .map((item) =>
            launcherPort.setModEnabled({
              modPath: item.absolutePath,
              enabled,
            }),
          ),
      )
      setSelectedModIds([])
      await refresh()
    },
    [launcherPort, refresh, selection],
  )

  const setFilterText = useCallback((value: string) => {
    setFilterTextState(value)
  }, [])

  const selectNextSearchMatch = useCallback(() => {
    if (!filteredMods.length) {
      return
    }
    const currentIndex = filteredMods.findIndex((item) => item.id === selectedModId)
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % filteredMods.length
    setSelectedModId(filteredMods[nextIndex]?.id ?? null)
  }, [filteredMods, selectedModId])

  const selectPreviousSearchMatch = useCallback(() => {
    if (!filteredMods.length) {
      return
    }
    const currentIndex = filteredMods.findIndex((item) => item.id === selectedModId)
    const nextIndex = currentIndex < 0 ? filteredMods.length - 1 : (currentIndex - 1 + filteredMods.length) % filteredMods.length
    setSelectedModId(filteredMods[nextIndex]?.id ?? null)
  }, [filteredMods, selectedModId])

  return {
    mods,
    storageFolders,
    activeStorageFolder,
    activeStorageFolderId,
    hiddenModKeys,
    packPresets,
    scopeMode,
    currentPackId,
    currentPack,
    filteredMods,
    selectedMod,
    selectedModId,
    selectedModIds,
    filterText,
    enabledOnly,
    state,
    error,
    selectionCount: selectedModIds.length,
    setSelectedModId,
    setSelectedModIds,
    setFilterText,
    setEnabledOnly,
    setActiveStorageFolderId,
    refresh,
    toggleEnabled,
    installArchive,
    toggleModSelection,
    clearSelection,
    selectAllFiltered,
    assignSelectionToFolder,
    createStorageFolder,
    renameStorageFolder,
    deleteStorageFolder,
    addSelectionToPack,
    addModsToPack,
    hideMods,
    showMods,
    createPackPreset,
    renamePackPreset,
    deletePackPreset,
    replacePackMods,
    setCurrentPackId,
    setScopeMode,
    applyCurrentPack,
    setSelectionEnabled,
    selectNextSearchMatch,
    selectPreviousSearchMatch,
  }
}
