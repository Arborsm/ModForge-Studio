import { useEffect, useState } from 'react'
import { loadTextAsset, type GameDirectoryInfo } from '@entities/game/api'
import { buildObjectLightItemIndex, type ObjectLightItemIndex } from '@entities/map'
import type { LocaleCode } from '@locales/api'

const BIG_CRAFTABLES_DATA_ASSET_PATH = 'Content\\Data\\BigCraftables.xnb'
const FURNITURE_DATA_ASSET_PATH = 'Content\\Data\\Furniture.xnb'

/**
 * Loads Data/BigCraftables and Data/Furniture for the active game directory
 * and builds the placed-object light index the map lighting preview uses to
 * resolve object-layer lamp/torch markers. Returns null until data matching
 * the current root path and locale has arrived; failed loads yield an empty
 * index, which simply disables placed-object glows.
 */
export function useObjectLightItemIndex(
  directoryInfo: GameDirectoryInfo | null | undefined,
  locale: LocaleCode,
): ObjectLightItemIndex | null {
  const [state, setState] = useState<{ rootPath: string; locale: LocaleCode; index: ObjectLightItemIndex } | null>(null)

  useEffect(() => {
    const rootPath = directoryInfo?.rootPath
    if (!rootPath) {
      return
    }

    let cancelled = false
    void (async () => {
      const [bigCraftables, furniture] = await Promise.all([
        loadTextAsset(rootPath, BIG_CRAFTABLES_DATA_ASSET_PATH, locale).catch(() => null),
        loadTextAsset(rootPath, FURNITURE_DATA_ASSET_PATH, locale).catch(() => null),
      ])
      if (cancelled) {
        return
      }
      setState({
        rootPath,
        locale,
        index: buildObjectLightItemIndex(bigCraftables?.content ?? null, furniture?.content ?? null),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale])

  const rootPath = directoryInfo?.rootPath ?? ''
  return state && state.rootPath === rootPath && state.locale === locale ? state.index : null
}
