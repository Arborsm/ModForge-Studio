/**
 * Reference data the object form and its validation resolve against.
 *
 * Everything here is a *suggestion* source, not a gate: the game directory may
 * not be connected while an author edits, and a project can legitimately point
 * at assets only its own patches provide. So each list degrades to empty, which
 * disables the matching datalist and the matching cross-reference rule rather
 * than flooding the rail with false "missing" issues.
 */

import { useEffect, useState } from 'react'
import { loadResourceRegistry, type GameDirectoryInfo } from '@entities/game/api'
import { loadItemWorkspaceEntries } from '@entities/item'
import type { DraftPatch } from '@features/cp-maker'
import type { LocaleCode } from '@locales'

export type ItemAuthoringResources = {
  /** Qualified item ids `GeodeDrops` may reference. */
  itemIds: string[]
  /** Location names `ArtifactSpotChances` may key on. */
  locationNames: string[]
  /** Sprite sheets vanilla items use, plus the ones this draft loads. */
  textureAssetNames: string[]
}

type GameSideResources = Omit<ItemAuthoringResources, 'textureAssetNames'> & { vanillaTextures: string[] }

const EMPTY_RESOURCES: GameSideResources = { itemIds: [], locationNames: [], vanillaTextures: [] }

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

/**
 * Resolves game-side reference lists once per root and locale, then folds in the
 * sheets this draft's own patches provide so a project-only texture is suggested
 * and accepted just like a vanilla one.
 */
export function useItemAuthoringResources({
  gameRootPath,
  directoryInfo,
  locale,
  patches,
}: {
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  patches: readonly DraftPatch[]
}): ItemAuthoringResources {
  const [gameResources, setGameResources] = useState<GameSideResources>(EMPTY_RESOURCES)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setGameResources(EMPTY_RESOURCES)
      return
    }

    let cancelled = false

    void Promise.all([loadItemWorkspaceEntries(gameRootPath, locale), loadResourceRegistry(gameRootPath, locale).catch(() => null)])
      .then(([entries, registry]) => {
        if (cancelled) {
          return
        }
        setGameResources({
          itemIds: sortedUnique(entries.map((entry) => entry.qualifiedItemId)),
          locationNames: sortedUnique((registry?.entries ?? []).filter((entry) => entry.kind === 'location').map((entry) => entry.value)),
          vanillaTextures: sortedUnique(
            entries.map((entry) => entry.textureAssetName).filter((name): name is string => typeof name === 'string' && name !== ''),
          ),
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
    // Item sheets live under `Maps/` (springobjects), `TileSheets/` and
    // `Characters/Farmer/`, so only data assets are filtered out here.
    if (!/^Data\//iu.test(target)) {
      projectTextures.push(target)
    }
  }

  return {
    itemIds: gameResources.itemIds,
    locationNames: gameResources.locationNames,
    textureAssetNames: sortedUnique([...gameResources.vanillaTextures, ...projectTextures]),
  }
}
