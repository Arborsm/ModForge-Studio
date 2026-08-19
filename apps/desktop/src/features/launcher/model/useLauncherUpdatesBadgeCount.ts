/**
 * @file useLauncherUpdatesBadgeCount hook: subscribes to update snapshots and
 * exposes the pending-update count for the launcher nav badge.
 */
import { useEffect, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherSettings, LauncherUpdatesResult } from './launcherContracts'

function getUpdatesCount(result: LauncherUpdatesResult | null) {
  return result?.updates.length ?? 0
}

function isUpdatesResultForModsPath(result: LauncherUpdatesResult | null, modsPath: string) {
  return result?.modsPath.trim() === modsPath
}

/** Returns the pending-update count for one Mods folder, from live subscription or cached snapshot. */
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
      if (!isUpdatesResultForModsPath(result, modsPath)) {
        return
      }
      liveSnapshotSeen = true
      applyCount(getUpdatesCount(result))
    })

    void launcherPort
      .loadCachedUpdates({ modsPath })
      .then((result) => {
        if (liveSnapshotSeen || !isUpdatesResultForModsPath(result, modsPath)) {
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
