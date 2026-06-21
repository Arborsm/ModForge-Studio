import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import { useEditorCopy } from '@locales/provider'
import { TaskCancelledError, useQueuedMutationTask, useTaskScope, type TaskScope } from '@platform/task-runtime'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import type {
  LauncherLibraryModSummary,
  LauncherLibraryPackPreset,
  LauncherLibraryScopeMode,
  LauncherLibraryState,
  LauncherLibraryStorageFolder,
  LauncherUpdateSummary,
} from './launcherContracts'
import {
  assignChildModsToParent,
  expandModIdsWithChildren,
  expandModKeysWithChildren,
  normalizeChildModGroups,
  removeChildModsFromGroups,
  replaceChildModsForParent,
} from './childModRelations'
import { addModKeysToLibraryFolder, moveLibraryFolder, normalizeLibraryFolders, removeModKeysFromLibraryFolders } from './libraryFolders'
import { getLauncherCoverKey, getLauncherCoverKeyCandidates } from './coverKey'
import { getModKey, includesFilter, normalizeLookupKey, normalizeModKey } from './libraryHelpers'
import { canAutoCheckLauncherUpdates, canAutoFetchLauncherRemoteCovers } from './nexusDiagnostics'
import type { LauncherSettingsDraft, LauncherViewState } from './types'

const UNSORTED_FOLDER_ID = 'unsorted'
const UNSORTED_FOLDER_NAME = 'Unsorted'
const LAUNCHER_LIBRARY_AUTO_COVER_CONCURRENCY = 3
const LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID = 'launcher-library-auto-cover-progress'

type LauncherPackFolderClassificationMode = LauncherLibraryPackPreset['folderClassificationMode']

type CreatePackPresetOptions = {
  folderClassificationMode?: LauncherPackFolderClassificationMode
}

type UpdatePackPresetInput = {
  name: string
  folderClassificationMode: LauncherPackFolderClassificationMode
}

type CreateLibraryFolderOptions = {
  packId?: string | null
}

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
    childModGroups: [],
    libraryFolders: [],
    customOrders: {},
    currentPackId: null,
    scopeMode: 'all',
  }
}

function encodeLibraryFolderOrderKey(folderId: string) {
  return `f:${folderId.trim()}`
}

function encodeLibraryModOrderKey(modKey: string) {
  return `m:${normalizeModKey(modKey)}`
}

function decodeLibraryOrderKey(value: string) {
  const trimmed = value.trim()
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }
  const kind = trimmed.slice(0, separatorIndex)
  const id = trimmed.slice(separatorIndex + 1).trim()
  if (!id) {
    return null
  }
  if (kind === 'f') {
    return { kind: 'folder' as const, id }
  }
  if (kind === 'm') {
    const modKey = normalizeModKey(id)
    return modKey ? { kind: 'mod' as const, id: modKey } : null
  }
  return null
}

function normalizeCustomOrders(
  customOrders: Record<string, string[]> | null | undefined,
  packIdLookup: Map<string, string>,
  libraryFolders: LauncherLibraryState['libraryFolders'],
) {
  const folderIdLookup = new Map(libraryFolders.map((folder) => [normalizeLookupKey(folder.id), folder.id]))
  const rootFolderItemLookup = new Set(
    libraryFolders.filter((folder) => !folder.parentFolderId).map((folder) => normalizeLookupKey(encodeLibraryFolderOrderKey(folder.id))),
  )
  const folderItemLookup = new Map(
    libraryFolders.map((folder) => {
      const validItems = new Set(folder.modKeys.map((modKey) => normalizeLookupKey(encodeLibraryModOrderKey(modKey))))
      for (const childFolder of libraryFolders) {
        if (normalizeLookupKey(childFolder.parentFolderId ?? '') === normalizeLookupKey(folder.id)) {
          validItems.add(normalizeLookupKey(encodeLibraryFolderOrderKey(childFolder.id)))
        }
      }
      return [normalizeLookupKey(folder.id), validItems]
    }),
  )
  const normalized: Record<string, string[]> = {}

  for (const [rawContainerKey, rawOrder] of Object.entries(customOrders ?? {})) {
    const containerKey = rawContainerKey.trim()
    if (!containerKey || !Array.isArray(rawOrder)) {
      continue
    }

    let canonicalContainerKey: string | null = null
    if (containerKey === 'view:all' || containerKey === 'view:hidden') {
      canonicalContainerKey = containerKey
    } else if (containerKey.startsWith('view:pack:')) {
      const packId = containerKey.slice('view:pack:'.length).trim()
      const canonicalPackId = packIdLookup.get(normalizeLookupKey(packId))
      canonicalContainerKey = canonicalPackId ? `view:pack:${canonicalPackId}` : null
    } else if (containerKey.startsWith('folder:')) {
      const folderId = containerKey.slice('folder:'.length).trim()
      const canonicalFolderId = folderIdLookup.get(normalizeLookupKey(folderId))
      canonicalContainerKey = canonicalFolderId ? `folder:${canonicalFolderId}` : null
    }

    if (!canonicalContainerKey) {
      continue
    }

    const seenItems = new Set<string>()
    const order: string[] = []
    for (const rawItemKey of rawOrder) {
      const decoded = decodeLibraryOrderKey(rawItemKey)
      if (!decoded) {
        continue
      }
      const itemKey =
        decoded.kind === 'folder'
          ? folderIdLookup.get(normalizeLookupKey(decoded.id))
            ? encodeLibraryFolderOrderKey(folderIdLookup.get(normalizeLookupKey(decoded.id))!)
            : null
          : encodeLibraryModOrderKey(decoded.id)
      if (!itemKey) {
        continue
      }
      const itemLookup = normalizeLookupKey(itemKey)
      if (seenItems.has(itemLookup)) {
        continue
      }
      if (itemKey.startsWith('f:') && canonicalContainerKey.startsWith('view:') && !rootFolderItemLookup.has(itemLookup)) {
        continue
      }
      if (canonicalContainerKey.startsWith('folder:')) {
        const folderId = canonicalContainerKey.slice('folder:'.length)
        if (!folderItemLookup.get(normalizeLookupKey(folderId))?.has(itemLookup)) {
          continue
        }
      }
      seenItems.add(itemLookup)
      order.push(itemKey)
    }

    if (order.length) {
      normalized[canonicalContainerKey] = order
    }
  }

  return normalized
}

function reorderOrderKeys(order: string[], fromKey: string, toAfterKey: string) {
  const fromLookup = normalizeLookupKey(fromKey)
  const withoutSource = order.filter((key) => normalizeLookupKey(key) !== fromLookup)
  const normalizedSourceKey = order.find((key) => normalizeLookupKey(key) === fromLookup) ?? fromKey

  if (toAfterKey === '__start__') {
    return [normalizedSourceKey, ...withoutSource]
  }

  const afterIndex = withoutSource.findIndex((key) => normalizeLookupKey(key) === normalizeLookupKey(toAfterKey))
  if (afterIndex < 0) {
    return [...withoutSource, normalizedSourceKey]
  }

  return [...withoutSource.slice(0, afterIndex + 1), normalizedSourceKey, ...withoutSource.slice(afterIndex + 1)]
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
      folderClassificationMode: pack.folderClassificationMode === 'independent' ? 'independent' : 'global',
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
  const childModGroups = normalizeChildModGroups(state.childModGroups ?? [])
  const libraryFolders = normalizeLibraryFolders(state.libraryFolders ?? [], packPresets)
  const customOrders = normalizeCustomOrders(state.customOrders, packIdLookup, libraryFolders)

  return {
    storageFolders,
    hiddenModKeys,
    packPresets,
    childModGroups,
    libraryFolders,
    customOrders,
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

function isTaskCancelled(error: unknown) {
  return error instanceof TaskCancelledError || (error instanceof DOMException && error.name === 'AbortError')
}

export function useLauncherLibrary(settings: LauncherSettingsDraft) {
  const launcherPort = useLauncherPort()
  const runLibraryStateSaveTask = useQueuedMutationTask('LauncherLibraryState')
  const libraryRefreshTaskScope = useTaskScope('launcher-library-refresh')
  const autoCoverTaskScope = useTaskScope('launcher-library-auto-cover')
  const copy = useEditorCopy().launcher
  const [mods, setMods] = useState<LauncherLibraryModSummary[]>([])
  const [libraryState, setLibraryState] = useState<LauncherLibraryState>(createDefaultLibraryState())
  const libraryStateRef = useRef(libraryState)
  const [selectedModIds, setSelectedModIds] = useState<string[]>([])
  const [selectedModId, setSelectedModId] = useState<string | null>(null)
  const [activeStorageFolderId, setActiveStorageFolderId] = useState<string | null>(null)
  const [filterText, setFilterTextState] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [latestVersionByModId, setLatestVersionByModId] = useState<Record<number, string>>({})
  const autoCoverFetchInFlightRef = useRef(false)

  const persistLibraryState = useCallback(
    async (nextStateOrUpdater: LauncherLibraryState | ((currentState: LauncherLibraryState) => LauncherLibraryState)) => {
      libraryRefreshTaskScope.cancel(new TaskCancelledError('Launcher library state was mutated.'))
      return runLibraryStateSaveTask(async () => {
        const nextState = typeof nextStateOrUpdater === 'function' ? nextStateOrUpdater(libraryStateRef.current) : nextStateOrUpdater
        const persisted = await launcherPort.saveLibraryState(normalizeLibraryState(nextState))
        const normalized = normalizeLibraryState(persisted)
        libraryStateRef.current = normalized
        setLibraryState(normalized)
        return normalized
      })
    },
    [launcherPort, libraryRefreshTaskScope, runLibraryStateSaveTask],
  )

  const cancelAutoCoverFetch = useCallback(() => {
    if (!autoCoverFetchInFlightRef.current) {
      return
    }

    autoCoverTaskScope.cancel(new TaskCancelledError('Launcher library auto-cover task was cancelled.'))
    autoCoverFetchInFlightRef.current = false
    dismissNotification(LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID)
  }, [autoCoverTaskScope])

  const startAutoCoverFetch = useCallback(
    (eligibleMods: LauncherLibraryModSummary[]) => {
      if (!eligibleMods.length) {
        return
      }

      autoCoverFetchInFlightRef.current = true
      let completed = 0

      void autoCoverTaskScope.runtime
        .latest(autoCoverTaskScope.key, async (scope) => {
          const activeScope = autoCoverTaskScope.capture(scope)
          const isTaskActive = () => autoCoverTaskScope.isCurrent(activeScope)

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

          await runWithConcurrency(eligibleMods, LAUNCHER_LIBRARY_AUTO_COVER_CONCURRENCY, async (item) => {
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
          })

          if (isTaskActive()) {
            autoCoverFetchInFlightRef.current = false
            dismissNotification(LAUNCHER_LIBRARY_AUTO_COVER_NOTIFICATION_ID)
          }
        })
        .catch((nextError) => {
          if (!isTaskCancelled(nextError)) {
            throw nextError
          }
        })
    },
    [autoCoverTaskScope, copy.library, launcherPort],
  )

  useEffect(() => {
    return () => {
      cancelAutoCoverFetch()
    }
  }, [cancelAutoCoverFetch])

  const refresh = useCallback(async () => {
    await libraryRefreshTaskScope.runtime
      .latest(libraryRefreshTaskScope.key, async (scope: TaskScope) => {
        const activeScope = libraryRefreshTaskScope.capture(scope)
        const isRefreshActive = () => libraryRefreshTaskScope.isCurrent(activeScope)

        cancelAutoCoverFetch()
        launcherPort.clearLibraryReadCaches(settings.modsPath)
        setState('loading')
        setError(null)
        setLatestVersionByModId({})

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

          const normalizedLibraryState = normalizeLibraryState(loadedLibraryState)
          libraryStateRef.current = normalizedLibraryState
          setLibraryState(normalizedLibraryState)
          setMods(scan.mods)
          setSelectedModId((current) => current ?? scan.mods[0]?.id ?? null)
          setSelectedModIds((current) => current.filter((id) => scan.mods.some((item) => item.id === id)))
          setState('ready')
          if (canAutoFetchLauncherRemoteCovers(diagnostics)) {
            startAutoCoverFetch(eligibleMods)
          }
          const updateModsPath = scan.modsPath || settings.modsPath || ''
          if (settings.autoCheckModUpdates && scan.mods.length > 0 && updateModsPath && canAutoCheckLauncherUpdates(diagnostics)) {
            const applyUpdateHints = (updates: LauncherUpdateSummary[] | null | undefined) => {
              if (!updates?.length || !isRefreshActive()) {
                return
              }

              setLatestVersionByModId(
                Object.fromEntries(
                  updates.filter((update) => update.latestVersion.trim()).map((update) => [update.modId, update.latestVersion.trim()]),
                ),
              )
            }

            void launcherPort
              .loadCachedUpdates({ modsPath: updateModsPath })
              .then((cached) => {
                if (!isRefreshActive()) {
                  return
                }
                applyUpdateHints(cached?.updates)
                if (cached && cached.isComplete !== false) {
                  return
                }

                return launcherPort
                  .checkUpdates({
                    modsPath: updateModsPath,
                    forceRefresh: false,
                  })
                  .then((result) => {
                    applyUpdateHints(result.updates)
                  })
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
      })
      .catch((nextError) => {
        if (!isTaskCancelled(nextError)) {
          throw nextError
        }
      })
  }, [cancelAutoCoverFetch, launcherPort, libraryRefreshTaskScope, settings.autoCheckModUpdates, settings.modsPath, startAutoCoverFetch])

  const storageFolders = libraryState.storageFolders
  const hiddenModKeys = libraryState.hiddenModKeys
  const packPresets = libraryState.packPresets
  const childModGroups = libraryState.childModGroups
  const libraryFolders = libraryState.libraryFolders
  const customOrders = libraryState.customOrders
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
      const nextEnabled = !mod.enabled
      await Promise.all(
        expandModIdsWithChildren([mod.id], mods, childModGroups)
          .filter((item) => item.enabled !== nextEnabled)
          .map((item) =>
            launcherPort.setModEnabled({
              modPath: item.absolutePath,
              enabled: nextEnabled,
            }),
          ),
      )
      await refresh()
    },
    [childModGroups, launcherPort, mods, refresh],
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
      const expandedSelectedModKeys = expandModKeysWithChildren(selectedModKeys, childModGroups)

      await persistLibraryState({
        ...libraryState,
        packPresets: packPresets.map((pack) => {
          if (normalizeLookupKey(pack.id) !== normalizeLookupKey(normalizedPackId)) {
            return pack
          }
          const existing = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
          const modKeys = [...pack.modKeys]
          for (const modKey of expandedSelectedModKeys) {
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
    [childModGroups, libraryState, packPresets, persistLibraryState, selection],
  )

  const addModsToPack = useCallback(
    async (packId: string, modIds: string[]) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId) {
        return
      }

      const selectedModKeys = expandModIdsWithChildren(modIds, mods, childModGroups).map(getModKey)

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
    [childModGroups, libraryState, mods, packPresets, persistLibraryState],
  )

  const hideMods = useCallback(
    async (modIds: string[]) => {
      const modKeys = expandModIdsWithChildren(modIds, mods, childModGroups).map(getModKey)

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
    [childModGroups, hiddenModKeys, libraryState, mods, persistLibraryState],
  )

  const showMods = useCallback(
    async (modIds: string[]) => {
      const modLookup = new Set(
        expandModIdsWithChildren(modIds, mods, childModGroups)
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
    [childModGroups, hiddenModKeys, libraryState, mods, persistLibraryState],
  )

  const createPackPreset = useCallback(
    async (name: string, options: CreatePackPresetOptions = {}) => {
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
        packPresets: [
          ...packPresets,
          {
            id,
            name: trimmed,
            modKeys: [],
            folderClassificationMode: options.folderClassificationMode === 'independent' ? 'independent' : 'global',
          },
        ],
      })
    },
    [libraryState, packPresets, persistLibraryState],
  )

  const updatePackPreset = useCallback(
    async (packId: string, input: UpdatePackPresetInput) => {
      const normalizedPackId = packId.trim()
      const trimmed = input.name.trim()
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
                folderClassificationMode: input.folderClassificationMode === 'independent' ? 'independent' : 'global',
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

      await persistLibraryState((currentState) => {
        const isDeletingCurrentPack =
          currentState.currentPackId && normalizeLookupKey(currentState.currentPackId) === normalizeLookupKey(normalizedPackId)
        return {
          ...currentState,
          currentPackId: isDeletingCurrentPack ? null : currentState.currentPackId,
          // Deleting the current pack drops the user back to the whole library;
          // reset the scope so filteredMods does not wipe the list with an empty
          // pack member set while scopeMode is still "current-pack".
          scopeMode: isDeletingCurrentPack ? 'all' : currentState.scopeMode,
          packPresets: currentState.packPresets.filter((pack) => normalizeLookupKey(pack.id) !== normalizeLookupKey(normalizedPackId)),
          libraryFolders: currentState.libraryFolders.filter(
            (folder) => normalizeLookupKey(folder.packId ?? '') !== normalizeLookupKey(normalizedPackId),
          ),
        }
      })
    },
    [persistLibraryState],
  )

  const setCurrentPackId = useCallback(
    async (nextPackId: string | null) => {
      const normalizedPackId = nextPackId?.trim() || null
      await persistLibraryState((currentState) => {
        const validPackId = normalizedPackId
          ? (currentState.packPresets.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(normalizedPackId))?.id ?? null)
          : null
        return {
          ...currentState,
          currentPackId: validPackId,
        }
      })
    },
    [persistLibraryState],
  )

  const replacePackMods = useCallback(
    async (packId: string, modIds: string[]) => {
      const normalizedPackId = packId.trim()
      if (!normalizedPackId) {
        return
      }

      const uniqueModIds = Array.from(new Set(modIds.map((value) => value.trim()).filter(Boolean)))
      const replacementKeys = expandModIdsWithChildren(uniqueModIds, mods, childModGroups)
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
    [childModGroups, libraryState, mods, packPresets, persistLibraryState],
  )

  const setChildMods = useCallback(
    async (parentModId: string, childModIds: string[]) => {
      const parentMod = mods.find((item) => item.id === parentModId)
      if (!parentMod) {
        return
      }

      const childModKeys = childModIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)

      await persistLibraryState({
        ...libraryState,
        childModGroups: assignChildModsToParent(childModGroups, getModKey(parentMod), childModKeys),
      })
    },
    [childModGroups, libraryState, mods, persistLibraryState],
  )

  const removeChildMods = useCallback(
    async (childModIds: string[]) => {
      const childModKeys = childModIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)

      await persistLibraryState({
        ...libraryState,
        childModGroups: removeChildModsFromGroups(childModGroups, childModKeys),
      })
    },
    [childModGroups, libraryState, mods, persistLibraryState],
  )

  const replaceChildMods = useCallback(
    async (parentModId: string, childModIds: string[]) => {
      const parentMod = mods.find((item) => item.id === parentModId)
      if (!parentMod) {
        return
      }

      const childModKeys = childModIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)

      await persistLibraryState({
        ...libraryState,
        childModGroups: replaceChildModsForParent(childModGroups, getModKey(parentMod), childModKeys),
      })
    },
    [childModGroups, libraryState, mods, persistLibraryState],
  )

  const createLibraryFolder = useCallback(
    async (name?: string, options: CreateLibraryFolderOptions = {}) => {
      const trimmed = name?.trim() || copy.library.newLibraryFolderName
      const normalizedPackId = options.packId?.trim() || null
      const packId = normalizedPackId
        ? (packPresets.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(normalizedPackId))?.id ?? null)
        : null
      const id = nextUniqueId(
        libraryFolders.map((folder) => folder.id),
        trimmed,
        'library-folder',
      )
      await persistLibraryState({
        ...libraryState,
        libraryFolders: normalizeLibraryFolders(
          [
            ...libraryFolders,
            {
              id,
              name: trimmed,
              packId,
              hidden: false,
              parentFolderId: null,
              modKeys: [],
              coverModKeys: [],
            },
          ],
          packPresets,
        ),
      })
      return id
    },
    [copy.library.newLibraryFolderName, libraryFolders, libraryState, packPresets, persistLibraryState],
  )

  const renameLibraryFolder = useCallback(
    async (folderId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }
      await persistLibraryState({
        ...libraryState,
        libraryFolders: normalizeLibraryFolders(
          libraryFolders.map((folder) =>
            normalizeLookupKey(folder.id) === normalizeLookupKey(folderId) ? { ...folder, name: trimmed } : folder,
          ),
          packPresets,
        ),
      })
    },
    [libraryFolders, libraryState, packPresets, persistLibraryState],
  )

  const hideLibraryFolder = useCallback(
    async (folderId: string) => {
      const targetLookup = normalizeLookupKey(folderId)
      if (!targetLookup) {
        return
      }
      await persistLibraryState({
        ...libraryState,
        libraryFolders: normalizeLibraryFolders(
          libraryFolders.map((folder) =>
            normalizeLookupKey(folder.id) === targetLookup && !folder.packId ? { ...folder, hidden: true } : folder,
          ),
          packPresets,
        ),
      })
    },
    [libraryFolders, libraryState, packPresets, persistLibraryState],
  )

  const showLibraryFolder = useCallback(
    async (folderId: string) => {
      const targetLookup = normalizeLookupKey(folderId)
      if (!targetLookup) {
        return
      }
      await persistLibraryState({
        ...libraryState,
        libraryFolders: normalizeLibraryFolders(
          libraryFolders.map((folder) => (normalizeLookupKey(folder.id) === targetLookup ? { ...folder, hidden: false } : folder)),
          packPresets,
        ),
      })
    },
    [libraryFolders, libraryState, packPresets, persistLibraryState],
  )

  const addModsToLibraryFolder = useCallback(
    async (folderId: string, modIds: string[]) => {
      const modKeys = modIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)
      if (!modKeys.length) {
        return
      }
      await persistLibraryState({
        ...libraryState,
        libraryFolders: addModKeysToLibraryFolder(libraryFolders, folderId, modKeys, packPresets),
      })
    },
    [libraryFolders, libraryState, mods, packPresets, persistLibraryState],
  )

  const removeModsFromLibraryFolders = useCallback(
    async (modIds: string[]) => {
      const modKeys = modIds
        .map((id) => mods.find((item) => item.id === id))
        .filter((item): item is LauncherLibraryModSummary => Boolean(item))
        .map(getModKey)
      if (!modKeys.length) {
        return
      }
      await persistLibraryState({
        ...libraryState,
        libraryFolders: removeModKeysFromLibraryFolders(libraryFolders, modKeys, packPresets),
      })
    },
    [libraryFolders, libraryState, mods, packPresets, persistLibraryState],
  )

  const moveLibraryFolderToFolder = useCallback(
    async (folderId: string, parentFolderId: string | null) => {
      await persistLibraryState({
        ...libraryState,
        libraryFolders: moveLibraryFolder(libraryFolders, folderId, parentFolderId, packPresets),
      })
    },
    [libraryFolders, libraryState, packPresets, persistLibraryState],
  )

  const reorderCustomOrder = useCallback(
    async (containerKey: string, fromKey: string, toAfterKey: string, baseOrder: string[] = []) => {
      const normalizedContainerKey = containerKey.trim()
      const normalizedFromKey = fromKey.trim()
      const normalizedToAfterKey = toAfterKey.trim()
      if (!normalizedContainerKey || !normalizedFromKey || !normalizedToAfterKey) {
        return
      }

      await persistLibraryState((currentState) => {
        const existingOrder = currentState.customOrders[normalizedContainerKey] ?? []
        const mergedOrder = [...existingOrder]
        const seen = new Set(existingOrder.map((key) => normalizeLookupKey(key)))
        for (const key of baseOrder) {
          const trimmed = key.trim()
          const lookup = normalizeLookupKey(trimmed)
          if (!trimmed || seen.has(lookup)) {
            continue
          }
          seen.add(lookup)
          mergedOrder.push(trimmed)
        }
        if (!seen.has(normalizeLookupKey(normalizedFromKey))) {
          mergedOrder.push(normalizedFromKey)
        }

        return {
          ...currentState,
          customOrders: {
            ...currentState.customOrders,
            [normalizedContainerKey]: reorderOrderKeys(mergedOrder, normalizedFromKey, normalizedToAfterKey),
          },
        }
      })
    },
    [persistLibraryState],
  )

  const reorderChildMods = useCallback(
    async (parentModKey: string, fromKey: string, toAfterKey: string) => {
      const decodedFrom = decodeLibraryOrderKey(fromKey)
      const decodedAfter = toAfterKey === '__start__' ? null : decodeLibraryOrderKey(toAfterKey)
      if (decodedFrom?.kind !== 'mod' || (toAfterKey !== '__start__' && decodedAfter?.kind !== 'mod')) {
        return
      }

      await persistLibraryState((currentState) => {
        const parentLookup = normalizeLookupKey(parentModKey)
        const nextGroups = currentState.childModGroups.map((group) => {
          if (normalizeLookupKey(group.parentModKey) !== parentLookup) {
            return group
          }
          const encodedOrder = group.childModKeys.map(encodeLibraryModOrderKey)
          const reordered = reorderOrderKeys(encodedOrder, encodeLibraryModOrderKey(decodedFrom.id), toAfterKey)
          return {
            ...group,
            childModKeys: reordered
              .map(decodeLibraryOrderKey)
              .filter((item): item is { kind: 'mod'; id: string } => item?.kind === 'mod')
              .map((item) => item.id),
          }
        })

        return {
          ...currentState,
          childModGroups: nextGroups,
        }
      })
    },
    [persistLibraryState],
  )

  const setModsEnabled = useCallback(
    async (modIds: string[], enabled: boolean) => {
      const targetIds = new Set(modIds)
      await Promise.all(
        mods
          .filter((item) => targetIds.has(item.id) && item.enabled !== enabled)
          .map((item) =>
            launcherPort.setModEnabled({
              modPath: item.absolutePath,
              enabled,
            }),
          ),
      )
      await refresh()
    },
    [launcherPort, mods, refresh],
  )

  const setScopeMode = useCallback(
    async (nextScopeMode: LauncherLibraryScopeMode) => {
      await persistLibraryState((currentState) => ({
        ...currentState,
        scopeMode: nextScopeMode,
      }))
    },
    [persistLibraryState],
  )

  const applyCurrentPack = useCallback(async () => {
    if (!currentPack) {
      return
    }

    const desiredKeys = new Set(expandModKeysWithChildren(currentPack.modKeys, childModGroups).map((value) => normalizeLookupKey(value)))
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
  }, [childModGroups, currentPack, launcherPort, mods, refresh])

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
    childModGroups,
    libraryFolders,
    customOrders,
    scopeMode,
    currentPackId,
    currentPack,
    filteredMods,
    latestVersionByModId,
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
    updatePackPreset,
    deletePackPreset,
    replacePackMods,
    setChildMods,
    removeChildMods,
    replaceChildMods,
    createLibraryFolder,
    renameLibraryFolder,
    hideLibraryFolder,
    showLibraryFolder,
    addModsToLibraryFolder,
    removeModsFromLibraryFolders,
    moveLibraryFolderToFolder,
    reorderCustomOrder,
    reorderChildMods,
    setModsEnabled,
    setCurrentPackId,
    setScopeMode,
    applyCurrentPack,
    setSelectionEnabled,
    selectNextSearchMatch,
    selectPreviousSearchMatch,
  }
}
