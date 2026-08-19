/**
 * @file useLauncherImageFetchNotifications hook: listens to cover fetch
 * disconnect events and publishes a warning notification.
 */
import { useEffect } from 'react'
import { useEditorCopy } from '@locales/provider'
import { publishNotification } from '@shared/ui/notifications'
import { useLauncherPort } from './launcherPortContext'

/** Stable notification id for the launcher image fetch disconnected banner. */
export const LAUNCHER_IMAGE_FETCH_DISCONNECTED_NOTIFICATION_ID = 'launcher-image-fetch-disconnected'

type LauncherNotificationCopy = ReturnType<typeof useEditorCopy>['launcher']['notifications']

/** Publishes a warning notification for image fetch disconnects with the current disconnect count. */
export function publishLauncherImageFetchDisconnectedNotification(copy: LauncherNotificationCopy, count: number) {
  publishNotification({
    id: LAUNCHER_IMAGE_FETCH_DISCONNECTED_NOTIFICATION_ID,
    level: 'warning',
    title: copy.imageFetchDisconnectedTitle,
    description: copy.imageFetchDisconnectedDetail(count),
    note: copy.imageFetchDisconnectedNote,
  })
}

/** Subscribes to launcher image fetch disconnect events and publishes warning notifications. */
export function useLauncherImageFetchNotifications() {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.notifications

  useEffect(() => {
    let active = true
    let disconnectCount = 0
    let unlisten: (() => void) | null = null

    void launcherPort
      .listenToImageFetchDisconnected(() => {
        if (!active) {
          return
        }

        disconnectCount += 1
        publishLauncherImageFetchDisconnectedNotification(copy, disconnectCount)
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
    }
  }, [copy, launcherPort])
}
