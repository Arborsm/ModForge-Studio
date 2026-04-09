import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadLauncherMod,
  installLauncherArchive,
  loadLauncherDownloadQueue,
  saveLauncherDownloadQueue,
  type DownloadLauncherModResult,
  type LauncherSettings,
} from '../desktop'
import type { LauncherDownloadQueueItem, LauncherDownloadQueueStatus, QueueLauncherDownloadInput } from './types'

const MAX_CONCURRENT_LAUNCHER_DOWNLOADS = 3

function isQueueStatus(value: string): value is LauncherDownloadQueueStatus {
  return (
    value === 'queued' ||
    value === 'downloading' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'installed'
  )
}

function normalizeQueueItem(item: LauncherDownloadQueueItem): LauncherDownloadQueueItem {
  return {
    ...item,
    version: item.version ?? null,
    imageUrl: item.imageUrl ?? null,
    archivePath: item.archivePath ?? null,
    installedTargetPath: item.installedTargetPath ?? null,
    error: item.error ?? null,
    completedAt: item.completedAt ?? null,
  }
}

function normalizeLoadedQueue(items: LauncherDownloadQueueItem[]) {
  return items.filter((item) => {
    return (
      item &&
      typeof item.id === 'string' &&
      typeof item.modId === 'number' &&
      typeof item.title === 'string' &&
      isQueueStatus(item.status)
    )
  }).map(normalizeQueueItem)
}

function updateQueueItem(
  items: LauncherDownloadQueueItem[],
  id: string,
  updater: (item: LauncherDownloadQueueItem) => LauncherDownloadQueueItem,
) {
  return items.map((item) => (item.id === id ? updater(item) : item))
}

function mapDownloadResultToQueueState(
  item: LauncherDownloadQueueItem,
  result: DownloadLauncherModResult,
): LauncherDownloadQueueItem {
  if (result.installed) {
    return {
      ...item,
      status: 'installed',
      archivePath: result.archivePath,
      installedTargetPath: result.installedTargetPath,
      error: null,
      completedAt: Date.now(),
      version: result.version,
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
  }
}

export function useLauncherDownloads(settings: LauncherSettings) {
  const [items, setItems] = useState<LauncherDownloadQueueItem[]>([])
  const processingIdsRef = useRef<Set<string>>(new Set())
  const hydratedRef = useRef(false)

  useEffect(() => {
    let active = true

    void loadLauncherDownloadQueue()
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
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) {
      return
    }

    void saveLauncherDownloadQueue({ items })
  }, [items])

  const queueDownload = useCallback((input: QueueLauncherDownloadInput) => {
    setItems((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.modId === input.modId &&
          (item.version ?? null) === (input.version ?? null) &&
          item.status !== 'failed',
      )
      if (existingIndex >= 0) {
        return current
      }

      return [
        ...current,
        {
          id: `${input.modId}:${input.version ?? 'latest'}:${Date.now()}`,
          modId: input.modId,
          title: input.title,
          version: input.version ?? null,
          imageUrl: input.imageUrl ?? null,
          source: input.source,
          status: 'queued',
          archivePath: null,
          installedTargetPath: null,
          error: null,
          addedAt: Date.now(),
          completedAt: null,
        },
      ]
    })
  }, [])

  const retryItem = useCallback((id: string) => {
    setItems((current) =>
      updateQueueItem(current, id, (item) => ({
        ...item,
        status: 'queued',
        error: null,
        completedAt: null,
      })),
    )
  }, [])

  const retryFailed = useCallback(() => {
    setItems((current) =>
      current.map((item) =>
        item.status === 'failed'
          ? {
              ...item,
              status: 'queued',
              error: null,
              completedAt: null,
            }
          : item,
      ),
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    processingIdsRef.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const removeCompleted = useCallback(() => {
    setItems((current) =>
      current.filter((item) => item.status !== 'completed' && item.status !== 'installed' && item.status !== 'failed'),
    )
  }, [])

  const clearAll = useCallback(() => {
    processingIdsRef.current.clear()
    setItems([])
  }, [])

  const installItem = useCallback(
    async (id: string) => {
      const target = items.find((item) => item.id === id)
      if (!target?.archivePath) {
        return
      }

      const result = await installLauncherArchive({
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
    },
    [items, settings.modsPath],
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
        })),
      )

      void downloadLauncherMod({
        modId: queuedItem.modId,
        version: queuedItem.version,
        title: queuedItem.title,
      })
        .then(async (result) => {
          if (settings.autoInstallDownloads && result.archivePath) {
            try {
              const installResult = await installLauncherArchive({
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
              return
            } catch (nextError) {
              setItems((current) =>
                updateQueueItem(current, queuedItem.id, (item) => ({
                  ...mapDownloadResultToQueueState(item, result),
                  status: 'failed',
                  error: nextError instanceof Error ? nextError.message : 'Failed to install downloaded archive.',
                })),
              )
              return
            }
          }

          setItems((current) =>
            updateQueueItem(current, queuedItem.id, (item) => mapDownloadResultToQueueState(item, result)),
          )
        })
        .catch((nextError) => {
          setItems((current) =>
            updateQueueItem(current, queuedItem.id, (item) => ({
              ...item,
              status: 'failed',
              error: nextError instanceof Error ? nextError.message : 'Failed to download launcher mod.',
              completedAt: Date.now(),
            })),
          )
        })
        .finally(() => {
          processingIdsRef.current.delete(queuedItem.id)
        })
    },
    [settings.autoInstallDownloads, settings.modsPath],
  )

  useEffect(() => {
    if (!settings.nexusApiKey?.trim() && !settings.nexusCookie?.trim()) {
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
  }, [beginDownload, items, settings.nexusApiKey, settings.nexusCookie])

  const queuedItems = useMemo(() => items.filter((item) => item.status === 'queued'), [items])
  const activeItems = useMemo(() => items.filter((item) => item.status === 'downloading'), [items])
  const readyToInstall = useMemo(
    () => items.filter((item) => item.status === 'completed' && Boolean(item.archivePath)),
    [items],
  )
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

  return {
    items,
    queuedItems,
    activeItems,
    readyToInstall,
    installedItems,
    failedItems,
    removableItems,
    counts,
    queueDownload,
    retryItem,
    retryFailed,
    removeItem,
    removeCompleted,
    installItem,
    installAllReady,
    clearAll,
  }
}
