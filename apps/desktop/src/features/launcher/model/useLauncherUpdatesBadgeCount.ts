import { useEffect, useState } from 'react'
import { useLauncherPort } from '@features/launcher'
import type { LauncherSettings, LauncherUpdatesResult } from './launcherContracts'

function getUpdatesCount(result: LauncherUpdatesResult | null) {
  return result?.updates.length ?? 0
}

export function useLauncherUpdatesBadgeCount(settings: LauncherSettings) {
  const launcherPort = useLauncherPort()
  const modsPath = settings.modsPath?.trim() || null
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!modsPath) {
      return
    }

    let isMounted = true
    let liveSnapshotSeen = false

    const applyCount = (nextCount: number) => {
      if (!isMounted) {
        return
      }
      setCount(nextCount)
    }

    const unsubscribe = launcherPort.subscribeUpdates(modsPath, (result) => {
      liveSnapshotSeen = true
      applyCount(getUpdatesCount(result))
    })

    void launcherPort
      .loadCachedUpdates({ modsPath })
      .then((result) => {
        if (liveSnapshotSeen) {
          return
        }
        applyCount(getUpdatesCount(result))
      })
      .catch(() => {
        if (liveSnapshotSeen) {
          return
        }
        applyCount(0)
      })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [launcherPort, modsPath])

  return modsPath ? count : 0
}
