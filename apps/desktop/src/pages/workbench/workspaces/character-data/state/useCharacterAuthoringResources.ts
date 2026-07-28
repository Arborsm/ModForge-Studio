/**
 * Reference data the character form's pickers and validation resolve against.
 *
 * Everything here is a *suggestion* source, not a gate: the game directory may
 * not be connected while an author edits, and a project can legitimately point
 * at assets only its own patches provide. So each list degrades to empty, which
 * disables the matching picker's browse button rather than flooding the rail
 * with false "missing" issues.
 */

import { useEffect, useState } from 'react'
import { loadResourceRegistry, type GameDirectoryInfo } from '@entities/game/api'
import { loadItemWorkspaceEntries } from '@entities/item'
import type { DraftPatch } from '@features/cp-maker'
import type { LocaleCode } from '@locales'

export type CharacterAuthoringResources = {
  /** Qualified item ids the Winter Star gift override may reference. */
  itemIds: string[]
  /** Location names `Home[].Location` may reference. */
  locationNames: string[]
  /** Portrait and sprite sheets vanilla NPCs use, plus the ones this draft loads. */
  textureAssetNames: string[]
}

type GameSideResources = Omit<CharacterAuthoringResources, 'textureAssetNames'>

const EMPTY_RESOURCES: GameSideResources = { itemIds: [], locationNames: [] }

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

/**
 * Resolves game-side reference lists once per root and locale, then folds in the
 * sheets this draft's own patches provide so a project-only portrait is browsable
 * just like a vanilla one.
 */
export function useCharacterAuthoringResources({
  gameRootPath,
  directoryInfo,
  locale,
  patches,
  vanillaTextureNames,
}: {
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  patches: readonly DraftPatch[]
  /** Texture asset names read off the vanilla character index. */
  vanillaTextureNames: readonly string[]
}): CharacterAuthoringResources {
  const [gameResources, setGameResources] = useState<GameSideResources>(EMPTY_RESOURCES)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setGameResources(EMPTY_RESOURCES)
      return
    }

    let cancelled = false

    void Promise.all([
      loadItemWorkspaceEntries(gameRootPath, locale).catch(() => []),
      loadResourceRegistry(gameRootPath, locale).catch(() => null),
    ])
      .then(([items, registry]) => {
        if (cancelled) {
          return
        }
        setGameResources({
          itemIds: sortedUnique(items.map((entry) => entry.qualifiedItemId)),
          locationNames: sortedUnique((registry?.entries ?? []).filter((entry) => entry.kind === 'location').map((entry) => entry.value)),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setGameResources(EMPTY_RESOURCES)
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  const projectTextures: string[] = []
  for (const patch of patches) {
    const target = patch.target.trim().replaceAll('\\', '/')
    if (!target || !(patch.action === 'Load' || patch.action === 'EditImage')) {
      continue
    }
    // NPC sheets live under `Characters/` and `Portraits/`, so only data assets
    // are filtered out here.
    if (!/^Data\//iu.test(target)) {
      projectTextures.push(target)
    }
  }

  return {
    itemIds: gameResources.itemIds,
    locationNames: gameResources.locationNames,
    textureAssetNames: sortedUnique([...vanillaTextureNames, ...projectTextures]),
  }
}
