import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import {
  checkLauncherUpdates,
  loadCachedLauncherUpdates,
  loadLauncherNexusDiagnostics,
  subscribeLauncherUpdates,
  type LauncherSettings,
} from '@platform/desktop'
import type { LauncherUpdateItem, LauncherViewState } from './types'
import {
  LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID,
  getLauncherUpdateNotificationProgress,
} from './useLauncherUpdateProgressNotifications'
import { canAutoCheckLauncherUpdates, getLauncherUpdateUnavailableReason } from './nexusDiagnostics'

const LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID = 'launcher-updates-check-error'

function getSelectionKey(item: LauncherUpdateItem) {
  return `${item.modId}:${item.absolutePath}`
}

export function useLauncherUpdates(settings: LauncherSettings) {
  const copy = useEditorCopy().launcher
  const [items, setItems] = useState<LauncherUpdateItem[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const itemsRef = useRef<LauncherUpdateItem[]>([])
  const mountedRef = useRef(true)
  const requestTokenRef = useRef(0)

  const applyUpdateResult = useCallback((result: { updates: LauncherUpdateItem[] }) => {
    const previousKeys = itemsRef.current.map(getSelectionKey)
    const nextKeys = result.updates.map(getSelectionKey)
    itemsRef.current = result.updates
    setItems(result.updates)
    setSelectedKeys((current) => {
      if (!current.length) {
        return nextKeys
      }

      const currentSelection = new Set(current)
      const hadAllSelected =
        previousKeys.length > 0 && previousKeys.every((key) => currentSelection.has(key))
      if (hadAllSelected) {
        return nextKeys
      }

      const preserved = nextKeys.filter((key) => currentSelection.has(key))
      return preserved.length ? preserved : nextKeys
    })
    setState('ready')
    setError(null)
    setBlockedReason(null)
    dismissNotification(LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID)
  }, [])

  const loadUpdates = useCallback(async (forceRefresh: boolean) => {
    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    const isRequestActive = () => mountedRef.current && requestTokenRef.current === requestToken

    if (!settings.modsPath) {
      itemsRef.current = []
      if (isRequestActive()) {
        setItems([])
        setSelectedKeys([])
        setState('idle')
        setError(null)
        setBlockedReason(null)
      }
      dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
      dismissNotification(LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID)
      return
    }

    if (!forceRefresh && settings.autoCheckModUpdates === false) {
      if (isRequestActive()) {
        setState('ready')
        setError(null)
        setBlockedReason(null)
      }
      dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
      dismissNotification(LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID)
      return
    }

    try {
      let canRunAutomaticCheck = forceRefresh
      let unavailableReason: string | null = null
      if (!forceRefresh) {
        const diagnostics = await loadLauncherNexusDiagnostics().catch(() => null)
        unavailableReason =
          diagnostics && !canAutoCheckLauncherUpdates(diagnostics)
            ? getLauncherUpdateUnavailableReason(diagnostics)
            : null
        canRunAutomaticCheck = unavailableReason ? false : true
      }

      if (!forceRefresh) {
        const cached = await loadCachedLauncherUpdates({
          modsPath: settings.modsPath,
        })
        if (cached) {
          if (isRequestActive()) {
            applyUpdateResult(cached)
          }
          if (cached.isComplete !== false) {
            return
          }
        }

        if (!canRunAutomaticCheck) {
          if (isRequestActive()) {
            setState('ready')
            setError(null)
            setBlockedReason(unavailableReason)
            dismissNotification(LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID)
          }
          return
        }
      }

      setState('loading')
      setError(null)
      setBlockedReason(null)
      dismissNotification(LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID)
      publishNotification({
        id: LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID,
        level: 'info',
        title: copy.updates.checkingProgressTitle,
        description: copy.updates.checkingProgressDetail(0, 0, null),
        autoDismissMs: null,
        progress: getLauncherUpdateNotificationProgress({
          modsPath: settings.modsPath ?? '',
          checked: 0,
          total: 0,
          currentModName: null,
        }),
      })

      const result = await checkLauncherUpdates({
        modsPath: settings.modsPath,
        forceRefresh,
      })
      if (!isRequestActive()) {
        return
      }
      applyUpdateResult(result)
    } catch (nextError) {
      if (!isRequestActive()) {
        return
      }
      const errorMessage = nextError instanceof Error ? nextError.message : 'Failed to load launcher updates.'
      publishNotification({
        id: LAUNCHER_UPDATES_ERROR_NOTIFICATION_ID,
        level: 'error',
        title: copy.updates.checkFailedTitle,
        description: errorMessage,
        autoDismissMs: null,
      })
      setError(errorMessage)
      setBlockedReason(null)
      setState('error')
    } finally {
      if (isRequestActive()) {
        dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
      }
    }
  }, [applyUpdateResult, copy.updates, settings.autoCheckModUpdates, settings.modsPath])

  const refresh = useCallback(async () => {
    await loadUpdates(true)
  }, [loadUpdates])

  const revalidate = useCallback(async () => {
    await loadUpdates(false)
  }, [loadUpdates])

  const selectedItems = useMemo(() => {
    const selectedKeySet = new Set(selectedKeys)
    return items.filter((item) => selectedKeySet.has(getSelectionKey(item)))
  }, [items, selectedKeys])

  const toggleSelected = useCallback((item: LauncherUpdateItem) => {
    const key = getSelectionKey(item)
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((currentKey) => currentKey !== key) : [...current, key],
    )
  }, [])

  const selectAll = useCallback(() => {
    setSelectedKeys(items.map(getSelectionKey))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedKeys([])
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe =
      settings.modsPath
        ? subscribeLauncherUpdates(settings.modsPath, (result) => {
            if (!mountedRef.current) {
              return
            }
            applyUpdateResult(result)
          })
        : () => {}
    const handle = window.setTimeout(() => {
      void loadUpdates(false)
    }, 0)

    return () => {
      mountedRef.current = false
      requestTokenRef.current += 1
      window.clearTimeout(handle)
      unsubscribe()
    }
  }, [applyUpdateResult, loadUpdates, settings.modsPath])

  return {
    items,
    selectedItems,
    selectedCount: selectedItems.length,
    hasSelection: selectedItems.length > 0,
    allSelected: items.length > 0 && selectedItems.length === items.length,
    state,
    error,
    blockedReason,
    revalidate,
    refresh,
    isSelected: (item: LauncherUpdateItem) => selectedKeys.includes(getSelectionKey(item)),
    toggleSelected,
    selectAll,
    clearSelection,
  }
}
