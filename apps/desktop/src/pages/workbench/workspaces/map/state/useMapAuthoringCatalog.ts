import { useEffect, useState } from 'react'
import { scanMaps, type GameDirectoryInfo, type MapAssetSummary } from '@entities/game/api'
import type { LocaleCode } from '@locales/api'

export type MapAuthoringCatalogState = {
  assets: MapAssetSummary[]
  loading: boolean
  error: string | null
}

/** Scans the connected game directory for maps used by the authoring library. */
export function useMapAuthoringCatalog(
  gameRootPath: string | null,
  directoryInfo: GameDirectoryInfo | null,
  locale: LocaleCode,
): MapAuthoringCatalogState {
  const [state, setState] = useState<MapAuthoringCatalogState>({ assets: [], loading: false, error: null })

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setState({ assets: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    void scanMaps(gameRootPath, locale).then(
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
  }, [directoryInfo, gameRootPath, locale])

  return state
}
