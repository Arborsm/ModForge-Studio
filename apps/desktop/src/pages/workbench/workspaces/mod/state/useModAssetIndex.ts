import { useEffect, useState } from 'react'
import { type GameDirectoryInfo } from '@entities/game/api'
import { scanModAssetIndex, type ModAssetIndex } from '@entities/mod/api'

export function useModAssetIndex(directoryInfo: GameDirectoryInfo | null) {
  const [modIndexState, setModIndexState] = useState<{
    rootPath: string | null
    index: ModAssetIndex
    error: string | null
  }>({ rootPath: null, index: { mods: [] }, error: null })
  const rootPath = directoryInfo?.rootPath ?? null

  useEffect(() => {
    let cancelled = false

    if (!rootPath) {
      return () => {
        cancelled = true
      }
    }

    void scanModAssetIndex(rootPath)
      .then((nextIndex) => {
        if (!cancelled) {
          setModIndexState({ rootPath, index: nextIndex, error: null })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModIndexState({
            rootPath,
            index: { mods: [] },
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [rootPath])

  const modIndex = rootPath && modIndexState.rootPath === rootPath ? modIndexState.index : { mods: [] }
  const modIndexError = rootPath && modIndexState.rootPath === rootPath ? modIndexState.error : null

  return {
    modIndex,
    modIndexError,
  }
}
