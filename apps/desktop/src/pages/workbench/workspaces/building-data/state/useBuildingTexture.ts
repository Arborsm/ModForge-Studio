import { useEffect, useState } from 'react'
import {
  getBuildingTexturePath,
  loadBuildingImageState,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
} from '@entities/building'
import type { LocaleCode } from '@locales'

const EMPTY_TEXTURE: BuildingTextureAssetState = { loading: false, path: null, url: null, width: null, height: null }

/** Loads the texture sheet referenced by one building preview. */
export function useBuildingTexture(
  building: BuildingWorkspaceEntry | null,
  gameRootPath: string | null,
  locale: LocaleCode,
): BuildingTextureAssetState {
  const [state, setState] = useState<BuildingTextureAssetState>(EMPTY_TEXTURE)
  const texturePath = getBuildingTexturePath(gameRootPath, building)

  useEffect(() => {
    if (!texturePath) {
      setState(EMPTY_TEXTURE)
      return
    }

    let cancelled = false
    setState({ ...EMPTY_TEXTURE, loading: true })
    void loadBuildingImageState(texturePath, locale)
      .then((image) => {
        if (!cancelled) setState(image)
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY_TEXTURE)
      })

    return () => {
      cancelled = true
    }
  }, [texturePath, locale])

  return state
}
