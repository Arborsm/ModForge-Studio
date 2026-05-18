import { useEffect, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import { useEditorCopy } from '@locales/localeContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'

import type { LauncherDiscoverDetail, LauncherViewState } from './types'

const LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID = 'launcher-remote-mod-detail'

type RemoteModDetailState = {
  requestKey: string | null
  detail: LauncherDiscoverDetail | null
  state: LauncherViewState
  error: string | null
}

type UseLauncherRemoteModDetailOptions = {
  includeFiles?: boolean
  notify?: boolean
}

export function useLauncherRemoteModDetail(modId: number | null, options: UseLauncherRemoteModDetailOptions = {}) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher
  const includeFiles = options.includeFiles
  const notify = options.notify ?? true
  const requestKey = modId ? `${modId}:${includeFiles === false ? 'meta' : 'files'}` : null
  const [requestState, setRequestState] = useState<RemoteModDetailState>({
    requestKey: null,
    detail: null,
    state: 'idle',
    error: null,
  })

  useEffect(() => {
    if (!modId) {
      if (notify) {
        dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
      }
      return
    }

    let cancelled = false
    if (notify) {
      publishNotification({
        id: LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID,
        level: 'info',
        title: copy.actions.viewDetails,
        description: `Nexus #${modId}`,
        autoDismissMs: null,
        progress: 18,
      })
    }

    void launcherPort
      .loadRemoteModDetail({
        modId,
        ...(includeFiles === undefined ? {} : { includeFiles }),
      })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (notify) {
          dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
        }
        setRequestState({
          requestKey,
          detail: result,
          state: 'ready',
          error: null,
        })
      })
      .catch((nextError) => {
        if (cancelled) {
          return
        }
        if (notify) {
          dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
        }
        setRequestState({
          requestKey,
          detail: null,
          state: 'error',
          error: nextError instanceof Error ? nextError.message : 'Failed to load launcher remote mod detail.',
        })
      })

    return () => {
      cancelled = true
      if (notify) {
        dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
      }
    }
  }, [copy.actions.viewDetails, includeFiles, modId, notify, launcherPort, requestKey])

  if (!modId) {
    return {
      detail: null,
      state: 'idle' as const,
      error: null,
    }
  }

  if (requestState.requestKey !== requestKey) {
    return {
      detail: null,
      state: 'loading' as const,
      error: null,
    }
  }

  return {
    detail: requestState.detail,
    state: requestState.state,
    error: requestState.error,
  }
}
