import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { publishNotification } from '@shared/ui/notifications'
import type { DownloadLauncherModResult, LauncherDownloadProgressPayload, LauncherSettings } from './launcherContracts'
import { useLauncherPort } from './launcherPortContext'
import type {
  LauncherDownloadQueueItem,
  LauncherDownloadQueueStatus,
  QueueLauncherDownloadInput,
  QueueLauncherDownloadsInput,
} from './types'

const MAX_CONCURRENT_LAUNCHER_DOWNLOADS = 3
const SAVE_DOWNLOAD_QUEUE_DEBOUNCE_MS = 300
const DOWNLOAD_PROGRESS_FLUSH_MS = 150
const DEBUG_SIMULATION_DURATION_SECONDS = 10
const DEBUG_SIMULATION_BYTES_PER_SECOND = 2 * 1024 * 1024
const DEBUG_SIMULATION_TOTAL_BYTES = DEBUG_SIMULATION_DURATION_SECONDS * DEBUG_SIMULATION_BYTES_PER_SECOND
const MANUAL_DOWNLOAD_NOTIFICATION_ID = 'launcher-manual-download-page-opened'
const QUEUED_DOWNLOAD_NOTIFICATION_ID = 'launcher-download-background-queued'
const MANUAL_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS = 5_000
const QUEUED_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS = 4_000
const DOWNLOAD_CREDENTIAL_REQUIRED_ERROR = 'Nexus API key is required to download mods.'

function getDownloadCredentialError(settings: Pick<LauncherSettings, 'nexusApiKey'>) {
  return settings.nexusApiKey?.trim() ? null : DOWNLOAD_CREDENTIAL_REQUIRED_ERROR
}

function isDownloadCredentialError(error: string | null | undefined) {
  const normalized = error?.trim().toLowerCase() ?? ''
  return (
    normalized === DOWNLOAD_CREDENTIAL_REQUIRED_ERROR.toLowerCase() ||
    normalized.includes('api key') ||
    normalized.includes('not authenticated') ||
    normalized.includes('401')
  )
}

function isQueueStatus(value: string): value is LauncherDownloadQueueStatus {
  return value === 'queued' || value === 'downloading' || value === 'completed' || value === 'failed' || value === 'installed'
}

function normalizeQueueItem(item: LauncherDownloadQueueItem): LauncherDownloadQueueItem {
  const staleDownloading = item.status === 'downloading'
  return {
    ...item,
    status: staleDownloading ? 'queued' : item.status,
    fileId: item.fileId ?? null,
    version: item.version ?? null,
    imageUrl: item.imageUrl ?? null,
    archivePath: item.archivePath ?? null,
    installedTargetPath: item.installedTargetPath ?? null,
    error: staleDownloading ? null : (item.error ?? null),
    completedAt: staleDownloading ? null : (item.completedAt ?? null),
    totalBytes: item.totalBytes ?? null,
    downloadedBytes: staleDownloading ? null : (item.downloadedBytes ?? null),
    bytesPerSecond: staleDownloading ? null : (item.bytesPerSecond ?? null),
  }
}

function normalizeInFlightQueueForPersistence(items: LauncherDownloadQueueItem[]) {
  return items.map((item) =>
    item.status === 'downloading'
      ? {
          ...item,
          status: 'queued' as const,
          error: null,
          completedAt: null,
          downloadedBytes: null,
          bytesPerSecond: null,
        }
      : item,
  )
}

function normalizeLoadedQueue(items: LauncherDownloadQueueItem[]) {
  return items
    .filter((item) => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.modId === 'number' &&
        typeof item.title === 'string' &&
        isQueueStatus(item.status)
      )
    })
    .map(normalizeQueueItem)
}

function updateQueueItem(
  items: LauncherDownloadQueueItem[],
  id: string,
  updater: (item: LauncherDownloadQueueItem) => LauncherDownloadQueueItem,
) {
  return items.map((item) => (item.id === id ? updater(item) : item))
}

function applyDownloadProgressUpdates(
  items: LauncherDownloadQueueItem[],
  progressUpdates: LauncherDownloadProgressPayload[],
): LauncherDownloadQueueItem[] {
  if (!progressUpdates.length) {
    return items
  }

  const progressById = new Map(progressUpdates.map((payload) => [payload.downloadId, payload]))
  let changed = false
  const nextItems = items.map((item) => {
    const payload = progressById.get(item.id)
    if (!payload || (item.status !== 'queued' && item.status !== 'downloading')) {
      return item
    }

    changed = true
    return {
      ...item,
      status: item.status === 'queued' ? 'downloading' : item.status,
      totalBytes: typeof payload.totalBytes === 'number' ? payload.totalBytes : item.totalBytes,
      downloadedBytes: payload.downloadedBytes,
      bytesPerSecond: typeof payload.bytesPerSecond === 'number' ? payload.bytesPerSecond : item.bytesPerSecond,
    }
  })

  return changed ? nextItems : items
}

function mapDownloadResultToQueueState(item: LauncherDownloadQueueItem, result: DownloadLauncherModResult): LauncherDownloadQueueItem {
  if (result.installed) {
    return {
      ...item,
      status: 'installed',
      archivePath: result.archivePath,
      installedTargetPath: result.installedTargetPath,
      error: null,
      completedAt: Date.now(),
      version: result.version,
      downloadedBytes: item.totalBytes,
      bytesPerSecond: null,
    }
  }

  return {
    ...item,
    status: 'completed',
    archivePath: result.archivePath,
    installedTargetPath: result.installedTargetPath,
    error: null,
    completedAt: Date.now(),
    version: result.version,
    downloadedBytes: item.totalBytes,
    bytesPerSecond: null,
  }
}

function createQueueItems(inputs: QueueLauncherDownloadsInput, current: LauncherDownloadQueueItem[], credentialError: string | null) {
  const seenKeys = new Set(
    current
      .filter((item) => item.status !== 'failed')
      .map((item) => `${item.modId}:${item.fileId ?? 'default'}:${item.version ?? 'latest'}`),
  )
  const addedAt = Date.now()

  return inputs.flatMap((input, index): LauncherDownloadQueueItem[] => {
    const key = `${input.modId}:${input.fileId ?? 'default'}:${input.version ?? 'latest'}`
    if (seenKeys.has(key)) {
      return []
    }
    seenKeys.add(key)

    return [
      {
        id: `${key}:${addedAt}:${index}`,
        modId: input.modId,
        fileId: input.fileId ?? null,
        title: input.title,
        version: input.version ?? null,
        imageUrl: input.imageUrl ?? null,
        source: input.source,
        status: credentialError ? 'failed' : 'queued',
        archivePath: null,
        installedTargetPath: null,
        error: credentialError,
        addedAt,
        completedAt: credentialError ? addedAt : null,
        totalBytes: null,
        downloadedBytes: null,
        bytesPerSecond: null,
      },
    ]
  })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
}

export function useLauncherDownloads(settings: LauncherSettings) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.downloads
  const [items, setItems] = useState<LauncherDownloadQueueItem[]>([])
  const processingIdsRef = useRef<Set<string>>(new Set())
  const latestItemsRef = useRef<LauncherDownloadQueueItem[]>([])
  const manualDownloadNotificationVisibleRef = useRef(false)
  const manualDownloadNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDownloadQueueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debugSimulationIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const debugSimulationTicksRef = useRef<Map<string, number>>(new Map())
  const pendingProgressRef = useRef<Map<string, LauncherDownloadProgressPayload>>(new Map())
  const progressFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedRef = useRef(false)

  const clearDebugSimulation = useCallback((id: string) => {
    const intervalHandle = debugSimulationIntervalsRef.current.get(id)
    if (intervalHandle) {
      clearInterval(intervalHandle)
      debugSimulationIntervalsRef.current.delete(id)
    }
    debugSimulationTicksRef.current.delete(id)
  }, [])

  const clearAllDebugSimulations = useCallback(() => {
    debugSimulationIntervalsRef.current.forEach((intervalHandle) => clearInterval(intervalHandle))
    debugSimulationIntervalsRef.current.clear()
    debugSimulationTicksRef.current.clear()
  }, [])

  const flushDownloadProgress = useCallback(() => {
    if (progressFlushTimeoutRef.current) {
      clearTimeout(progressFlushTimeoutRef.current)
      progressFlushTimeoutRef.current = null
    }

    const progressUpdates = Array.from(pendingProgressRef.current.values())
    pendingProgressRef.current.clear()
    if (!progressUpdates.length) {
      return
    }

    setItems((current) => applyDownloadProgressUpdates(current, progressUpdates))
  }, [])

  const flushDownloadProgressToLatestItemsRef = useCallback(() => {
    if (progressFlushTimeoutRef.current) {
      clearTimeout(progressFlushTimeoutRef.current)
      progressFlushTimeoutRef.current = null
    }

    const progressUpdates = Array.from(pendingProgressRef.current.values())
    pendingProgressRef.current.clear()
    latestItemsRef.current = applyDownloadProgressUpdates(latestItemsRef.current, progressUpdates)
  }, [])

  const scheduleDownloadProgressFlush = useCallback(() => {
    if (progressFlushTimeoutRef.current) {
      return
    }

    progressFlushTimeoutRef.current = setTimeout(flushDownloadProgress, DOWNLOAD_PROGRESS_FLUSH_MS)
  }, [flushDownloadProgress])

  useEffect(() => {
    let active = true

    void launcherPort
      .loadDownloadQueue()
      .then((result) => {
        if (!active) {
          return
        }
        setItems(normalizeLoadedQueue(result.items as LauncherDownloadQueueItem[]))
        hydratedRef.current = true
      })
      .catch(() => {
        if (!active) {
          return
        }
        hydratedRef.current = true
      })

    return () => {
      active = false
    }
  }, [launcherPort])

  useEffect(() => {
    return () => {
      flushDownloadProgressToLatestItemsRef()
      const latestItems = latestItemsRef.current
      const downloadingItems = latestItems.filter((item) => item.status === 'downloading')
      downloadingItems.forEach((item) => {
        void launcherPort.cancelDownload(item.id).catch(() => {})
      })
      clearAllDebugSimulations()
      if (manualDownloadNotificationTimeoutRef.current) {
        clearTimeout(manualDownloadNotificationTimeoutRef.current)
      }
      const shouldPersistQueueOnUnmount = Boolean(saveDownloadQueueTimeoutRef.current) || downloadingItems.length > 0
      if (saveDownloadQueueTimeoutRef.current) {
        clearTimeout(saveDownloadQueueTimeoutRef.current)
        saveDownloadQueueTimeoutRef.current = null
      }
      if (hydratedRef.current && shouldPersistQueueOnUnmount) {
        void launcherPort.saveDownloadQueue({ items: normalizeInFlightQueueForPersistence(latestItemsRef.current) })
      }
    }
  }, [clearAllDebugSimulations, flushDownloadProgressToLatestItemsRef, launcherPort])

  const publishManualDownloadOpenedNotification = useCallback(() => {
    if (manualDownloadNotificationVisibleRef.current) {
      return
    }

    manualDownloadNotificationVisibleRef.current = true
    publishNotification({
      id: MANUAL_DOWNLOAD_NOTIFICATION_ID,
      level: 'info',
      title: copy.manualDownloadOpenedTitle,
      description: copy.manualDownloadOpenedDetail,
      autoDismissMs: MANUAL_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS,
    })

    if (manualDownloadNotificationTimeoutRef.current) {
      clearTimeout(manualDownloadNotificationTimeoutRef.current)
    }
    manualDownloadNotificationTimeoutRef.current = setTimeout(() => {
      manualDownloadNotificationVisibleRef.current = false
      manualDownloadNotificationTimeoutRef.current = null
    }, MANUAL_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS)
  }, [copy.manualDownloadOpenedDetail, copy.manualDownloadOpenedTitle])

  const publishQueuedDownloadNotification = useCallback(
    (queuedItems: LauncherDownloadQueueItem[]) => {
      if (!queuedItems.length) {
        return
      }

      publishNotification({
        id: QUEUED_DOWNLOAD_NOTIFICATION_ID,
        level: 'info',
        title: copy.backgroundQueuedTitle,
        summary:
          queuedItems.length === 1
            ? (queuedItems[0]?.title ?? copy.backgroundQueuedSummary(1))
            : copy.backgroundQueuedSummary(queuedItems.length),
        description: copy.backgroundQueuedDetail,
        autoDismissMs: QUEUED_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS,
      })
    },
    [copy],
  )

  useLayoutEffect(() => {
    latestItemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!hydratedRef.current) {
      return
    }

    if (saveDownloadQueueTimeoutRef.current) {
      clearTimeout(saveDownloadQueueTimeoutRef.current)
    }

    saveDownloadQueueTimeoutRef.current = setTimeout(() => {
      saveDownloadQueueTimeoutRef.current = null
      void launcherPort.saveDownloadQueue({ items: normalizeInFlightQueueForPersistence(items) })
    }, SAVE_DOWNLOAD_QUEUE_DEBOUNCE_MS)
  }, [items, launcherPort])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false

    void launcherPort
      .listenToDownloadProgress((payload) => {
        pendingProgressRef.current.set(payload.downloadId, payload)
        scheduleDownloadProgressFlush()
      })
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [launcherPort, scheduleDownloadProgressFlush])

  const refreshUpdatesAfterInstall = useCallback(() => {
    if (!settings.modsPath) {
      return
    }

    void launcherPort
      .checkUpdates({
        modsPath: settings.modsPath,
        forceRefresh: false,
      })
      .catch(() => {})
  }, [launcherPort, settings.modsPath])

  const queueDownloads = useCallback(
    (inputs: QueueLauncherDownloadsInput) => {
      const credentialError = getDownloadCredentialError(settings)
      const normalizedInputs = inputs.filter(Boolean)
      if (!normalizedInputs.length) {
        return
      }
      const optimisticQueuedItems = createQueueItems(normalizedInputs, latestItemsRef.current, credentialError)

      setItems((current) => {
        const nextItems = createQueueItems(normalizedInputs, current, credentialError)
        if (!nextItems.length) {
          return current
        }

        return [...current, ...nextItems]
      })

      if (!credentialError) {
        publishQueuedDownloadNotification(optimisticQueuedItems)
      }
    },
    [publishQueuedDownloadNotification, settings],
  )

  const queueDownload = useCallback((input: QueueLauncherDownloadInput) => queueDownloads([input]), [queueDownloads])

  const retryItem = useCallback(
    (id: string) => {
      const credentialError = getDownloadCredentialError(settings)

      setItems((current) =>
        updateQueueItem(current, id, (item) => ({
          ...item,
          status: credentialError ? 'failed' : 'queued',
          error: credentialError,
          completedAt: credentialError ? Date.now() : null,
          downloadedBytes: null,
          totalBytes: null,
          bytesPerSecond: null,
        })),
      )
    },
    [settings],
  )

  const retryFailed = useCallback(() => {
    const credentialError = getDownloadCredentialError(settings)

    setItems((current) =>
      current.map((item) =>
        item.status === 'failed'
          ? {
              ...item,
              status: credentialError ? 'failed' : 'queued',
              error: credentialError,
              completedAt: credentialError ? Date.now() : null,
              downloadedBytes: null,
              totalBytes: null,
              bytesPerSecond: null,
            }
          : item,
      ),
    )
  }, [settings])

  useEffect(() => {
    if (!settings.nexusApiKey?.trim()) {
      return
    }

    const handle = window.setTimeout(() => {
      setItems((current) => {
        let changed = false
        const nextItems = current.map((item) => {
          if (item.status !== 'failed' || !isDownloadCredentialError(item.error)) {
            return item
          }

          changed = true
          return {
            ...item,
            status: 'queued' as const,
            error: null,
            completedAt: null,
            downloadedBytes: null,
            bytesPerSecond: null,
          }
        })

        return changed ? nextItems : current
      })
    }, 0)

    return () => window.clearTimeout(handle)
  }, [settings.nexusApiKey])

  const removeItem = useCallback(
    (id: string) => {
      clearDebugSimulation(id)
      pendingProgressRef.current.delete(id)
      processingIdsRef.current.delete(id)
      void launcherPort.cancelDownload(id).catch(() => {})
      setItems((current) => current.filter((item) => item.id !== id))
    },
    [clearDebugSimulation, launcherPort],
  )

  const removeCompleted = useCallback(() => {
    setItems((current) => {
      const removableIds = current
        .filter((item) => item.status === 'completed' || item.status === 'installed' || item.status === 'failed')
        .map((item) => item.id)
      removableIds.forEach(clearDebugSimulation)
      return current.filter((item) => !removableIds.includes(item.id))
    })
  }, [clearDebugSimulation])

  const clearAll = useCallback(() => {
    latestItemsRef.current
      .filter((item) => item.status === 'downloading')
      .forEach((item) => {
        void launcherPort.cancelDownload(item.id).catch(() => {})
      })
    clearAllDebugSimulations()
    processingIdsRef.current.clear()
    setItems([])
  }, [clearAllDebugSimulations, launcherPort])

  const markArchivesInstalled = useCallback((archivePaths: string[]) => {
    const installedLookup = new Set(archivePaths.map((path) => path.trim()).filter(Boolean))
    if (!installedLookup.size) {
      return
    }

    setItems((current) =>
      current.map((item) =>
        item.archivePath && installedLookup.has(item.archivePath)
          ? {
              ...item,
              status: 'installed',
              installedTargetPath: item.installedTargetPath ?? item.archivePath,
              error: null,
              completedAt: Date.now(),
            }
          : item,
      ),
    )
  }, [])

  const beginDownload = useCallback(
    (queuedItem: LauncherDownloadQueueItem) => {
      if (processingIdsRef.current.has(queuedItem.id)) {
        return
      }

      processingIdsRef.current.add(queuedItem.id)
      setItems((current) =>
        updateQueueItem(current, queuedItem.id, (item) => ({
          ...item,
          status: 'downloading',
          error: null,
          downloadedBytes: null,
          totalBytes: null,
          bytesPerSecond: null,
        })),
      )

      void launcherPort
        .downloadMod({
          downloadId: queuedItem.id,
          modId: queuedItem.modId,
          fileId: queuedItem.fileId,
          version: queuedItem.version,
          title: queuedItem.title,
        })
        .then(async (result) => {
          flushDownloadProgress()
          if (result.manualDownloadPageOpened) {
            clearDebugSimulation(queuedItem.id)
            setItems((current) => current.filter((item) => item.id !== queuedItem.id))
            publishManualDownloadOpenedNotification()
            return
          }

          if (result.installed) {
            setItems((current) => updateQueueItem(current, queuedItem.id, (item) => mapDownloadResultToQueueState(item, result)))
            refreshUpdatesAfterInstall()
            return
          }

          setItems((current) => updateQueueItem(current, queuedItem.id, (item) => mapDownloadResultToQueueState(item, result)))
        })
        .catch((nextError) => {
          flushDownloadProgress()
          setItems((current) =>
            updateQueueItem(current, queuedItem.id, (item) => ({
              ...item,
              status: 'failed',
              error: getErrorMessage(nextError, 'Failed to download launcher mod.'),
              completedAt: Date.now(),
              bytesPerSecond: null,
            })),
          )
        })
        .finally(() => {
          pendingProgressRef.current.delete(queuedItem.id)
          processingIdsRef.current.delete(queuedItem.id)
        })
    },
    [clearDebugSimulation, flushDownloadProgress, launcherPort, publishManualDownloadOpenedNotification, refreshUpdatesAfterInstall],
  )

  const startDebugSimulation = useCallback(
    (title = 'Launcher Debug Download') => {
      const nextId = `debug-download:${Date.now()}`
      const addedAt = Date.now()

      setItems((current) => {
        if (current.some((item) => item.source === 'debug' && item.status === 'downloading')) {
          return current
        }

        return [
          ...current,
          {
            id: nextId,
            modId: -1,
            fileId: null,
            title,
            version: 'debug-sim',
            imageUrl: null,
            source: 'debug',
            status: 'downloading',
            archivePath: null,
            installedTargetPath: null,
            error: null,
            addedAt,
            completedAt: null,
            totalBytes: DEBUG_SIMULATION_TOTAL_BYTES,
            downloadedBytes: 0,
            bytesPerSecond: DEBUG_SIMULATION_BYTES_PER_SECOND,
          },
        ]
      })

      if (debugSimulationIntervalsRef.current.has(nextId)) {
        clearDebugSimulation(nextId)
      }

      debugSimulationTicksRef.current.set(nextId, 0)
      const intervalHandle = setInterval(() => {
        const nextTick = (debugSimulationTicksRef.current.get(nextId) ?? 0) + 1
        const downloadedBytes = Math.min(DEBUG_SIMULATION_TOTAL_BYTES, nextTick * DEBUG_SIMULATION_BYTES_PER_SECOND)
        const isComplete = nextTick >= DEBUG_SIMULATION_DURATION_SECONDS

        debugSimulationTicksRef.current.set(nextId, nextTick)
        setItems((current) => {
          const target = current.find((item) => item.id === nextId)
          if (!target) {
            clearDebugSimulation(nextId)
            return current
          }

          return updateQueueItem(current, nextId, (item) => ({
            ...item,
            status: isComplete ? 'completed' : 'downloading',
            archivePath: isComplete ? `debug-download-${item.addedAt}.zip` : null,
            error: null,
            completedAt: isComplete ? Date.now() : null,
            totalBytes: DEBUG_SIMULATION_TOTAL_BYTES,
            downloadedBytes,
            bytesPerSecond: isComplete ? null : DEBUG_SIMULATION_BYTES_PER_SECOND,
          }))
        })

        if (isComplete) {
          clearDebugSimulation(nextId)
        }
      }, 1000)

      debugSimulationIntervalsRef.current.set(nextId, intervalHandle)
    },
    [clearDebugSimulation],
  )

  useEffect(() => {
    if (!settings.nexusApiKey?.trim()) {
      return
    }

    const availableSlots = MAX_CONCURRENT_LAUNCHER_DOWNLOADS - processingIdsRef.current.size
    if (availableSlots <= 0) {
      return
    }

    items
      .filter((item) => item.status === 'queued' && !processingIdsRef.current.has(item.id))
      .slice(0, availableSlots)
      .forEach((item) => beginDownload(item))
  }, [beginDownload, items, settings.nexusApiKey])

  const queuedItems = useMemo(() => items.filter((item) => item.status === 'queued'), [items])
  const activeItems = useMemo(() => items.filter((item) => item.status === 'downloading'), [items])
  const readyToInstall = useMemo(() => items.filter((item) => item.status === 'completed' && Boolean(item.archivePath)), [items])
  const installedItems = useMemo(() => items.filter((item) => item.status === 'installed'), [items])
  const failedItems = useMemo(() => items.filter((item) => item.status === 'failed'), [items])
  const removableItems = useMemo(
    () => items.filter((item) => item.status === 'completed' || item.status === 'installed' || item.status === 'failed'),
    [items],
  )

  const counts = useMemo(() => {
    return {
      queued: queuedItems.length,
      downloading: activeItems.length,
      completed: readyToInstall.length + installedItems.length,
      failed: failedItems.length,
      readyToInstall: readyToInstall.length,
    }
  }, [activeItems.length, failedItems.length, installedItems.length, queuedItems.length, readyToInstall.length])

  const downloadProgressPercent = useMemo(() => {
    const progressItems = activeItems.filter(
      (item) => typeof item.totalBytes === 'number' && item.totalBytes > 0 && typeof item.downloadedBytes === 'number',
    )
    if (!progressItems.length) {
      return null
    }

    const downloadedBytes = progressItems.reduce((total, item) => total + (item.downloadedBytes ?? 0), 0)
    const totalBytes = progressItems.reduce((total, item) => total + (item.totalBytes ?? 0), 0)
    if (totalBytes <= 0) {
      return null
    }

    return Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
  }, [activeItems])

  return {
    items,
    queuedItems,
    activeItems,
    readyToInstall,
    installedItems,
    failedItems,
    removableItems,
    counts,
    downloadProgressPercent,
    queueDownload,
    queueDownloads,
    startDebugSimulation,
    retryItem,
    retryFailed,
    removeItem,
    removeCompleted,
    clearAll,
    markArchivesInstalled,
  }
}
