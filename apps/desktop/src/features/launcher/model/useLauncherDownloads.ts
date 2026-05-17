import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { publishNotification } from '@shared/ui/notifications'
import type { DownloadLauncherModResult, LauncherSettings } from './launcherContracts'
import { useLauncherPort } from './launcherPortContext'
import type {
  LauncherDownloadQueueItem,
  LauncherDownloadQueueStatus,
  QueueLauncherDownloadInput,
  QueueLauncherDownloadsInput,
} from './types'

const MAX_CONCURRENT_LAUNCHER_DOWNLOADS = 3
const SAVE_DOWNLOAD_QUEUE_DEBOUNCE_MS = 300
const DEBUG_SIMULATION_DURATION_SECONDS = 10
const DEBUG_SIMULATION_BYTES_PER_SECOND = 2 * 1024 * 1024
const DEBUG_SIMULATION_TOTAL_BYTES = DEBUG_SIMULATION_DURATION_SECONDS * DEBUG_SIMULATION_BYTES_PER_SECOND
const MANUAL_DOWNLOAD_PAGE_OPENED_MESSAGE = 'Nexus manual download page opened.'
const MANUAL_DOWNLOAD_NOTIFICATION_ID = 'launcher-manual-download-page-opened'
const MANUAL_DOWNLOAD_NOTIFICATION_AUTO_DISMISS_MS = 5_000

function getDownloadCredentialError(settings: Pick<LauncherSettings, 'nexusApiKey'>) {
  return settings.nexusApiKey?.trim() ? null : 'Nexus API key is required to download mods.'
}

function isQueueStatus(value: string): value is LauncherDownloadQueueStatus {
  return value === 'queued' || value === 'downloading' || value === 'completed' || value === 'failed' || value === 'installed'
}

function normalizeQueueItem(item: LauncherDownloadQueueItem): LauncherDownloadQueueItem {
  return {
    ...item,
    fileId: item.fileId ?? null,
    version: item.version ?? null,
    imageUrl: item.imageUrl ?? null,
    archivePath: item.archivePath ?? null,
    installedTargetPath: item.installedTargetPath ?? null,
    error: item.error ?? null,
    completedAt: item.completedAt ?? null,
    totalBytes: item.totalBytes ?? null,
    downloadedBytes: item.downloadedBytes ?? null,
    bytesPerSecond: item.bytesPerSecond ?? null,
  }
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

function isManualDownloadPageOpenedError(error: unknown) {
  return getErrorMessage(error, '').includes(MANUAL_DOWNLOAD_PAGE_OPENED_MESSAGE)
}

export function useLauncherDownloads(settings: LauncherSettings) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.downloads
  const [items, setItems] = useState<LauncherDownloadQueueItem[]>([])
  const processingIdsRef = useRef<Set<string>>(new Set())
  const manualDownloadNotificationVisibleRef = useRef(false)
  const manualDownloadNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDownloadQueueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debugSimulationIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const debugSimulationTicksRef = useRef<Map<string, number>>(new Map())
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
      clearAllDebugSimulations()
      if (manualDownloadNotificationTimeoutRef.current) {
        clearTimeout(manualDownloadNotificationTimeoutRef.current)
      }
      if (saveDownloadQueueTimeoutRef.current) {
        clearTimeout(saveDownloadQueueTimeoutRef.current)
      }
    }
  }, [clearAllDebugSimulations])

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

  useEffect(() => {
    if (!hydratedRef.current) {
      return
    }

    if (saveDownloadQueueTimeoutRef.current) {
      clearTimeout(saveDownloadQueueTimeoutRef.current)
    }

    saveDownloadQueueTimeoutRef.current = setTimeout(() => {
      saveDownloadQueueTimeoutRef.current = null
      void launcherPort.saveDownloadQueue({ items })
    }, SAVE_DOWNLOAD_QUEUE_DEBOUNCE_MS)
  }, [items, launcherPort])

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

      setItems((current) => {
        const nextItems = createQueueItems(normalizedInputs, current, credentialError)
        if (!nextItems.length) {
          return current
        }

        return [...current, ...nextItems]
      })
    },
    [settings],
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
              bytesPerSecond: null,
            }
          : item,
      ),
    )
  }, [settings])

  const removeItem = useCallback(
    (id: string) => {
      clearDebugSimulation(id)
      processingIdsRef.current.delete(id)
      setItems((current) => current.filter((item) => item.id !== id))
    },
    [clearDebugSimulation],
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
    clearAllDebugSimulations()
    processingIdsRef.current.clear()
    setItems([])
  }, [clearAllDebugSimulations])

  const installItem = useCallback(
    async (id: string) => {
      const target = items.find((item) => item.id === id)
      if (!target?.archivePath) {
        return
      }

      try {
        const result = await launcherPort.installArchive({
          archivePath: target.archivePath,
          modsPath: settings.modsPath,
        })

        setItems((current) =>
          updateQueueItem(current, id, (item) => ({
            ...item,
            status: 'installed',
            installedTargetPath: result.targetPath,
            error: null,
            completedAt: Date.now(),
          })),
        )
        refreshUpdatesAfterInstall()
      } catch (nextError) {
        setItems((current) =>
          updateQueueItem(current, id, (item) => ({
            ...item,
            status: 'failed',
            error: nextError instanceof Error ? nextError.message : 'Failed to install downloaded archive.',
            completedAt: Date.now(),
          })),
        )
      }
    },
    [items, launcherPort, refreshUpdatesAfterInstall, settings.modsPath],
  )

  const installAllReady = useCallback(async () => {
    const targets = items.filter((item) => item.status === 'completed' && Boolean(item.archivePath))
    await Promise.allSettled(targets.map((item) => installItem(item.id)))
  }, [installItem, items])

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
          bytesPerSecond: null,
        })),
      )

      void launcherPort
        .downloadMod({
          modId: queuedItem.modId,
          fileId: queuedItem.fileId,
          version: queuedItem.version,
          title: queuedItem.title,
        })
        .then(async (result) => {
          if (result.installed) {
            setItems((current) => updateQueueItem(current, queuedItem.id, (item) => mapDownloadResultToQueueState(item, result)))
            refreshUpdatesAfterInstall()
            return
          }

          if (settings.autoInstallDownloads && result.archivePath) {
            try {
              const installResult = await launcherPort.installArchive({
                archivePath: result.archivePath,
                modsPath: settings.modsPath,
              })
              setItems((current) =>
                updateQueueItem(current, queuedItem.id, (item) => ({
                  ...mapDownloadResultToQueueState(item, result),
                  status: 'installed',
                  installedTargetPath: installResult.targetPath,
                })),
              )
              refreshUpdatesAfterInstall()
              return
            } catch (nextError) {
              setItems((current) =>
                updateQueueItem(current, queuedItem.id, (item) => ({
                  ...mapDownloadResultToQueueState(item, result),
                  status: 'failed',
                  error: nextError instanceof Error ? nextError.message : 'Failed to install downloaded archive.',
                  bytesPerSecond: null,
                })),
              )
              return
            }
          }

          setItems((current) => updateQueueItem(current, queuedItem.id, (item) => mapDownloadResultToQueueState(item, result)))
        })
        .catch((nextError) => {
          if (isManualDownloadPageOpenedError(nextError)) {
            clearDebugSimulation(queuedItem.id)
            setItems((current) => current.filter((item) => item.id !== queuedItem.id))
            publishManualDownloadOpenedNotification()
            return
          }

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
          processingIdsRef.current.delete(queuedItem.id)
        })
    },
    [
      clearDebugSimulation,
      launcherPort,
      publishManualDownloadOpenedNotification,
      refreshUpdatesAfterInstall,
      settings.autoInstallDownloads,
      settings.modsPath,
    ],
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
    installItem,
    installAllReady,
    clearAll,
  }
}
