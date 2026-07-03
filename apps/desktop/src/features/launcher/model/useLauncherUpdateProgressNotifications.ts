import { useEffect } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from './launcherPortContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import type { LauncherUpdateProgressPayload } from './launcherContracts'

export const LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID = 'launcher-updates-progress'
const LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_THROTTLE_MS = 250

type LauncherUpdatesCopy = ReturnType<typeof useEditorCopy>['launcher']['updates']

export function getLauncherUpdateNotificationProgress(payload: LauncherUpdateProgressPayload) {
  if (payload.total <= 0) {
    return 18
  }

  return Math.max(0, Math.min(100, (payload.checked / payload.total) * 100))
}

function isLauncherUpdateProgressComplete(payload: LauncherUpdateProgressPayload) {
  return payload.total > 0 && payload.checked >= payload.total
}

export function publishLauncherUpdateProgressNotification(copy: LauncherUpdatesCopy, payload: LauncherUpdateProgressPayload) {
  publishNotification({
    id: LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID,
    level: 'info',
    title: copy.checkingProgressTitle,
    description: copy.checkingProgressDetail(payload.checked, payload.total, payload.currentModName),
    autoDismissMs: null,
    progress: getLauncherUpdateNotificationProgress(payload),
  })
}

export function useLauncherUpdateProgressNotifications() {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.updates

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | null = null
    let pendingPayload: LauncherUpdateProgressPayload | null = null
    let throttleHandle: number | null = null

    const clearPendingProgress = () => {
      pendingPayload = null
      if (throttleHandle !== null) {
        window.clearTimeout(throttleHandle)
        throttleHandle = null
      }
    }

    const flushPendingProgress = () => {
      throttleHandle = null
      const nextPayload = pendingPayload
      pendingPayload = null
      if (!active || !nextPayload) {
        return
      }
      publishLauncherUpdateProgressNotification(copy, nextPayload)
    }

    const publishThrottledProgress = (payload: LauncherUpdateProgressPayload) => {
      if (throttleHandle === null) {
        publishLauncherUpdateProgressNotification(copy, payload)
        throttleHandle = window.setTimeout(flushPendingProgress, LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_THROTTLE_MS)
        return
      }

      pendingPayload = payload
    }

    void launcherPort
      .listenToUpdateProgress((payload) => {
        if (!active) {
          return
        }

        if (isLauncherUpdateProgressComplete(payload)) {
          clearPendingProgress()
          dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
          return
        }

        publishThrottledProgress(payload)
      })
      .then((dispose) => {
        if (!active) {
          dispose()
          return
        }

        unlisten = dispose
      })

    return () => {
      active = false
      unlisten?.()
      clearPendingProgress()
      dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
    }
  }, [copy, launcherPort])
}
