import { useEffect, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'

import type { LauncherDiscoverDetail, LauncherViewState } from './types'

type RemoteModDetailState = {
  requestKey: string | null
  detail: LauncherDiscoverDetail | null
  state: LauncherViewState
  error: string | null
}

type UseLauncherRemoteModDetailOptions = {
  includeFiles?: boolean
}

export function useLauncherRemoteModDetail(modId: number | null, options: UseLauncherRemoteModDetailOptions = {}) {
  const launcherPort = useLauncherPort()
  const includeFiles = options.includeFiles
  const requestKey = modId ? `${modId}:${includeFiles === false ? 'meta' : 'files'}` : null
  const [requestState, setRequestState] = useState<RemoteModDetailState>({
    requestKey: null,
    detail: null,
    state: 'idle',
    error: null,
  })

  useEffect(() => {
    if (!modId) {
      return
    }
    if (launcherPort.isRemoteModIdInvalid(modId)) {
      setRequestState({
        requestKey,
        detail: null,
        state: 'error',
        error: `Nexus mod ${modId} is unavailable.`,
      })
      return
    }

    let cancelled = false
    void launcherPort
      .loadRemoteModDetail({
        modId,
        ...(includeFiles === undefined ? {} : { includeFiles }),
      })
      .then((result) => {
        if (cancelled) {
          return
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
        setRequestState({
          requestKey,
          detail: null,
          state: 'error',
          error: nextError instanceof Error ? nextError.message : 'Failed to load launcher remote mod detail.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [includeFiles, modId, launcherPort, requestKey])

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
