import { useEffect, useState } from 'react'
import {
  EMPTY_CHARACTER_VISUAL_ASSET_STATE,
  loadCharacterImageState,
  resolveCharacterVariantPaths,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import type { LocaleCode } from '@locales'

/** Loads the first walking sheet used by a character catalog card. */
export function useCharacterThumbnail(
  entry: CharacterWorkspaceEntry | null,
  gameRootPath: string | null,
  locale: LocaleCode,
): CharacterVisualAssetState {
  const [state, setState] = useState<CharacterVisualAssetState>(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
  const variant = entry?.variants[0] ?? null
  const { spritePath } = resolveCharacterVariantPaths(gameRootPath, variant)

  useEffect(() => {
    if (!spritePath) {
      setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
      return
    }

    let cancelled = false
    void loadCharacterImageState(spritePath, locale)
      .then((image) => {
        if (!cancelled) {
          setState({
            ...EMPTY_CHARACTER_VISUAL_ASSET_STATE,
            spritePath: image.path,
            spriteUrl: image.url,
            spriteSheetWidth: image.width,
            spriteSheetHeight: image.height,
            spriteImage: image.image ?? null,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
        }
      })

    return () => {
      cancelled = true
    }
  }, [spritePath, locale])

  return state
}
