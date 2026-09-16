import { useEffect, useState } from 'react'
import { loadTextAsset, type GameDirectoryInfo } from '@entities/game/api'
import { buildObjectLightItemIndex, type ObjectLightItemIndex } from '@entities/map'
import type { LocaleCode } from '@locales/api'
import { appEvent } from '@platform/observability'

const BIG_CRAFTABLES_DATA_ASSET_PATH = 'Content\\Data\\BigCraftables.xnb'
const FURNITURE_DATA_ASSET_PATH = 'Content\\Data\\Furniture.xnb'
const BIG_CRAFTABLES_STRINGS_ASSET_PATH = 'Content\\Strings\\BigCraftables.xnb'
const FURNITURE_STRINGS_ASSET_PATH = 'Content\\Strings\\Furniture.xnb'

/**
 * Loads Data/BigCraftables and Data/Furniture plus their Strings assets for
 * the active game directory and builds the placed-object light index the map
 * lighting preview uses to resolve object-layer lamp/torch markers. The
 * Strings assets resolve `[LocalizedText ...]` display-name tokens. Returns
 * null until data matching the current root path and locale has arrived;
 * failed loads yield an empty index, which simply disables placed-object glows.
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
      const loadOptionalAsset = async (path: string) => {
        try {
          return await loadTextAsset(rootPath, path, locale)
        } catch (error) {
          appEvent('warning', 'Failed to load map object light data')
            .error(error)
            .context({ source: 'map-object-light-index', operation: 'load-optional-asset', path })
            .dedupe(`map-object-light:${path}`)
            .emit({ notify: false })
          return null
        }
      }
      const [bigCraftables, furniture, bigCraftableStrings, furnitureStrings] = await Promise.all([
        loadOptionalAsset(BIG_CRAFTABLES_DATA_ASSET_PATH),
        loadOptionalAsset(FURNITURE_DATA_ASSET_PATH),
        loadOptionalAsset(BIG_CRAFTABLES_STRINGS_ASSET_PATH),
        loadOptionalAsset(FURNITURE_STRINGS_ASSET_PATH),
      ])
      if (cancelled) {
        return
      }
      setState({
        rootPath,
        locale,
        index: buildObjectLightItemIndex(bigCraftables?.content ?? null, furniture?.content ?? null, {
          bigCraftables: bigCraftableStrings?.content ?? null,
          furniture: furnitureStrings?.content ?? null,
        }),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale])

  const rootPath = directoryInfo?.rootPath ?? ''
  return state && state.rootPath === rootPath && state.locale === locale ? state.index : null
}
