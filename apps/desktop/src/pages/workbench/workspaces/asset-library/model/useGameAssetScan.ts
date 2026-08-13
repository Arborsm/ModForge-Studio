import { useEffect, useState } from 'react'

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

  useEffect(() => {
    if (!gameRootPath) {
      setState({ assets: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    void scan(gameRootPath).then(
      (assets) => {
        if (!cancelled) setState({ assets, loading: false, error: null })
      },
      (error) => {
        if (!cancelled) {
          setState({ assets: [], loading: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [gameRootPath, scan])

  return state
}
