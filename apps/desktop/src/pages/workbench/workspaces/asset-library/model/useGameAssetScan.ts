import { useEffect, useState } from 'react'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'

export type GameAssetScanKind = 'image' | 'audio' | 'data'

export type GameAssetScanState<T> = {
  assets: readonly T[]
  loading: boolean
  error: string | null
}

/**
 * Scans a connected game directory for one asset family. Mirrors the map
 * authoring catalog contract: loading and error states feed the status rows and
 * the shared notification system, and the scan is skipped without a game root.
 */
export function useGameAssetScan<T>(gameRootPath: string | null, scan: (path: string) => Promise<T[]>): GameAssetScanState<T> {
  const [state, setState] = useState<GameAssetScanState<T>>({ assets: [], loading: false, error: null })
  const runScanTask = useLatestTask('game-asset-scan')

  useEffect(() => {
    void runScanTask(async (scope) => {
      if (!gameRootPath) {
        setState({ assets: [], loading: false, error: null })
        return
      }
      setState((current) => ({ ...current, loading: true, error: null }))
      try {
        const assets = await scan(gameRootPath)
        if (scope.isCurrent()) {
          setState({ assets, loading: false, error: null })
        }
      } catch (error) {
        if (error instanceof TaskCancelledError || !scope.isCurrent()) {
          return
        }
        setState({ assets: [], loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) throw error
    })
  }, [gameRootPath, runScanTask, scan])

  return state
}
