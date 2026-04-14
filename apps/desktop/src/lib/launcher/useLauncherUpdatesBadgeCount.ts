import { useEffect, useState } from 'react'
import {
  loadCachedLauncherUpdates,
  subscribeLauncherUpdates,
  type LauncherSettings,
  type LauncherUpdatesResult,
} from '../desktop'

function getUpdatesCount(result: LauncherUpdatesResult | null) {
  return result?.updates.length ?? 0
}

export function useLauncherUpdatesBadgeCount(settings: LauncherSettings) {
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

    const unsubscribe = subscribeLauncherUpdates(modsPath, (result) => {
      liveSnapshotSeen = true
      applyCount(getUpdatesCount(result))
    })

    void loadCachedLauncherUpdates({ modsPath })
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
  }, [modsPath])

  return modsPath ? count : 0
}
