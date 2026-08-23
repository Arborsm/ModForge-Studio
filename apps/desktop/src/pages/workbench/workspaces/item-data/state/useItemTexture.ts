import { useEffect, useState } from 'react'
import { loadItemTextureAssetState, type ItemTextureAssetState } from '@entities/item'
import type { LocaleCode } from '@locales'
import { appEvent } from '@platform/observability'

export const EMPTY_ITEM_TEXTURE_STATE: ItemTextureAssetState = {
  loading: false,
  path: null,
  url: null,
  width: null,
  height: null,
}

/** Loads one item sheet through the shared game-asset cache. */
export function useItemTexture(assetName: string | null, gameRootPath: string | null, locale: LocaleCode): ItemTextureAssetState {
  const [state, setState] = useState<ItemTextureAssetState>(EMPTY_ITEM_TEXTURE_STATE)

  useEffect(() => {
    if (!assetName || !gameRootPath) {
      setState(EMPTY_ITEM_TEXTURE_STATE)
      return
    }
    let cancelled = false
    setState({ ...EMPTY_ITEM_TEXTURE_STATE, loading: true })
    void loadItemTextureAssetState(gameRootPath, assetName, locale)
      .then((texture) => {
        if (!cancelled) setState(texture)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          appEvent('warning', 'Item texture unavailable')
            .error(error)
            .context({ source: 'item-authoring', operation: 'load-texture' })
            .emit({ notify: false })
          setState(EMPTY_ITEM_TEXTURE_STATE)
        }
      })
    return () => {
      cancelled = true
    }
  }, [assetName, gameRootPath, locale])

  return state
}
