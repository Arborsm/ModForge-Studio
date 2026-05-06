import { useEffect } from 'react'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { listenToLauncherUpdateProgress, type LauncherUpdateProgressPayload } from '@platform/desktop'
import { getLauncherCopy, type LocaleCode } from '@locales/editor-shell'

export const LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID = 'launcher-updates-progress'

type LauncherUpdatesCopy = ReturnType<typeof getLauncherCopy>['updates']

export function getLauncherUpdateNotificationProgress(payload: LauncherUpdateProgressPayload) {
  if (payload.total <= 0) {
    return 18
  }

  return Math.max(0, Math.min(100, (payload.checked / payload.total) * 100))
}

function isLauncherUpdateProgressComplete(payload: LauncherUpdateProgressPayload) {
  return payload.total > 0 && payload.checked >= payload.total
}

export function publishLauncherUpdateProgressNotification(
  copy: LauncherUpdatesCopy,
  payload: LauncherUpdateProgressPayload,
) {
  publishNotification({
    id: LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID,
    level: 'info',
    title: copy.checkingProgressTitle,
    description: copy.checkingProgressDetail(payload.checked, payload.total, payload.currentModName),
    autoDismissMs: null,
    progress: getLauncherUpdateNotificationProgress(payload),
  })
}

export function useLauncherUpdateProgressNotifications(locale: LocaleCode) {
  useEffect(() => {
    const copy = getLauncherCopy(locale).updates
    let active = true
    let unlisten: (() => void) | null = null

    void listenToLauncherUpdateProgress((payload) => {
      if (!active) {
        return
      }

      if (isLauncherUpdateProgressComplete(payload)) {
        dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
        return
      }

      publishLauncherUpdateProgressNotification(copy, payload)
    }).then((dispose) => {
      if (!active) {
        dispose()
        return
      }

      unlisten = dispose
    })

    return () => {
      active = false
      unlisten?.()
      dismissNotification(LAUNCHER_UPDATES_PROGRESS_NOTIFICATION_ID)
    }
  }, [locale])
}
