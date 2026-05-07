import { useEffect, useState } from 'react'
import { useLauncherPort } from '@features/launcher'
import { useEditorCopy } from '@locales/localeContext'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'

import type { LauncherDiscoverDetail, LauncherViewState } from './types'

const LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID = 'launcher-remote-mod-detail'

type RemoteModDetailState = {
  modId: number | null
  detail: LauncherDiscoverDetail | null
  state: LauncherViewState
  error: string | null
}

export function useLauncherRemoteModDetail(modId: number | null) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher
  const [requestState, setRequestState] = useState<RemoteModDetailState>({
    modId: null,
    detail: null,
    state: 'idle',
    error: null,
  })

  useEffect(() => {
    if (!modId) {
      dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
      return
    }

    let cancelled = false
    publishNotification({
      id: LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID,
      level: 'info',
      title: copy.actions.viewDetails,
      description: `Nexus #${modId}`,
      autoDismissMs: null,
      progress: 18,
    })

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setRequestState((current) => ({
        modId,
        detail: current.modId === modId ? current.detail : null,
        state: 'loading',
        error: null,
      }))
    })

    void launcherPort.loadRemoteModDetail({ modId })
      .then((result) => {
        if (cancelled) {
          return
        }
        dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
        setRequestState({
          modId,
          detail: result,
          state: 'ready',
          error: null,
        })
      })
      .catch((nextError) => {
        if (cancelled) {
          return
        }
        dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
        setRequestState({
          modId,
          detail: null,
          state: 'error',
          error: nextError instanceof Error ? nextError.message : 'Failed to load launcher remote mod detail.',
        })
      })

    return () => {
      cancelled = true
      dismissNotification(LAUNCHER_REMOTE_MOD_DETAIL_NOTIFICATION_ID)
    }
  }, [copy.actions.viewDetails, modId, launcherPort])

  if (!modId) {
    return {
      detail: null,
      state: 'idle' as const,
      error: null,
    }
  }

  if (requestState.modId !== modId) {
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
