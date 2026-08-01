/**
 * Reference data the building form and its validation resolve against.
 *
 * Everything here is a *suggestion* source, not a gate: the game directory may
 * not be connected while an author edits, and a project can legitimately point
 * at assets only its own patches provide. So each list degrades to empty, which
 * disables the matching datalist and the matching cross-reference rule rather
 * than flooding the rail with false "missing" issues.
 */

import { useEffect, useState } from 'react'
import { loadBuildingImageState, normalizeIndoorMapAssetName } from '@entities/building'
import { loadResourceRegistry, scanMaps, type GameDirectoryInfo, type MapAssetSummary } from '@entities/game/api'
import { loadItemTextureAssetState, loadItemWorkspaceEntries, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import type { DraftPatch, VirtualPreviewAsset } from '@features/cp-maker'
import type { LocaleCode } from '@locales'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
import { mapAssetNameFromSummary } from './buildingPickerOptions'

export type BuildingAuthoringResources = {
  /** Object ids `BuildMaterials` may reference. */
  itemIds: string[]
  /** Complete item catalog, including qualified ids and every vanilla item kind. */
  materials: ItemWorkspaceEntry[]
  /** Item atlas states keyed by normalized logical asset name. */
  itemTextureStates: Record<string, ItemTextureAssetState>
  /** Location names `NonInstancedIndoorLocation` may reference. */
  locationNames: string[]
  /** `Maps/...` asset names the game ships or the project loads. */
  mapAssetNames: string[]
  /** Scanned map files, kept so the interior picker can show each one's path. */
  mapAssets: MapAssetSummary[]
  /** Texture asset names vanilla buildings use, plus the ones this draft loads. */
  textureAssetNames: string[]
  /** Texture assets supplied by this project, used by browser source filters. */
  projectTextureAssetNames: string[]
  /** Loaded vanilla texture sheets keyed by normalized asset name. */
  texturePreviews: Record<string, string>
}

type GameSideResources = Omit<BuildingAuthoringResources, 'textureAssetNames' | 'projectTextureAssetNames'>

const EMPTY_RESOURCES: GameSideResources = {
  itemIds: [],
  materials: [],
  itemTextureStates: {},
  locationNames: [],
  mapAssetNames: [],
  mapAssets: [],
  texturePreviews: {},
}

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

/**
 * Resolves game-side reference lists once per root and locale, then folds in the
 * assets this draft's own patches provide so a project-only map or texture is
 * suggested and accepted just like a vanilla one.
 */
export function useBuildingAuthoringResources({
  gameRootPath,
  directoryInfo,
  locale,
  patches,
  virtualAssets,
  vanillaTextureNames,
}: {
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  patches: readonly DraftPatch[]
  virtualAssets: readonly VirtualPreviewAsset[]
  /** Texture asset names read off the vanilla building index. */
  vanillaTextureNames: readonly string[]
}): BuildingAuthoringResources {
  const [gameResources, setGameResources] = useState<GameSideResources>(EMPTY_RESOURCES)
  const vanillaTextureKey = sortedUnique(vanillaTextureNames).join('\u0000')

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setGameResources(EMPTY_RESOURCES)
      return
    }

    let cancelled = false

    void Promise.all([
      loadItemWorkspaceEntries(gameRootPath, locale).catch(() => [] as ItemWorkspaceEntry[]),
      loadResourceRegistry(gameRootPath, locale).catch(() => null),
      scanMaps(gameRootPath, locale).catch(() => [] as MapAssetSummary[]),
      Promise.all(
        sortedUnique(vanillaTextureNames).map(async (assetName) => {
          try {
            const state = await loadBuildingImageState(buildGameContentPath(gameRootPath, assetName), locale)
            return state.url === null ? null : ([assetName.replaceAll('\\', '/').toLowerCase(), state.url] as const)
          } catch {
            return null
          }
        }),
      ),
    ])
      .then(async ([materials, registry, mapAssets, texturePreviews]) => {
        if (cancelled) {
          return
        }
        const textureNames = sortedUnique(materials.flatMap((material) => (material.textureAssetName ? [material.textureAssetName] : [])))
        const itemTextures = await Promise.all(
          textureNames.map(
            async (assetName) =>
              [assetName.replaceAll('\\', '/').toLowerCase(), await loadItemTextureAssetState(gameRootPath, assetName, locale)] as const,
          ),
        )
        if (cancelled) {
          return
        }
        setGameResources({
          itemIds: sortedUnique(materials.map((material) => material.qualifiedItemId)),
          materials,
          itemTextureStates: Object.fromEntries(itemTextures),
          locationNames: sortedUnique((registry?.entries ?? []).filter((entry) => entry.kind === 'location').map((entry) => entry.value)),
          mapAssetNames: sortedUnique(
            mapAssets.flatMap((asset) => {
              const name = mapAssetNameFromSummary(asset)
              const normalized = name === null ? null : normalizeIndoorMapAssetName(name)
              return normalized === null ? [] : [normalized]
            }),
          ),
          mapAssets,
          texturePreviews: Object.fromEntries(texturePreviews.filter((entry): entry is readonly [string, string] => entry !== null)),
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
  }, [gameRootPath, directoryInfo, locale, vanillaTextureKey])

  const projectMaps: string[] = []
  const projectTextures: string[] = []
  const projectTexturePreviews: Record<string, string> = {}
  const virtualAssetsByPath = new Map(virtualAssets.map((asset) => [asset.relativePath.replaceAll('\\', '/').toLowerCase(), asset]))
  for (const patch of patches) {
    const target = patch.target.trim().replaceAll('\\', '/')
    if (!target) {
      continue
    }
    if (patch.action === 'Load' && /^Maps\//iu.test(target)) {
      projectMaps.push(target)
    }
    if ((patch.action === 'Load' || patch.action === 'EditImage') && !/^Maps\//iu.test(target) && !/^Data\//iu.test(target)) {
      projectTextures.push(target)
      const fromFile = patch.fromFile?.trim().replaceAll('\\', '/').toLowerCase() ?? ''
      const asset = virtualAssetsByPath.get(fromFile)
      if (asset?.mediaType.startsWith('image/')) {
        projectTexturePreviews[target.toLowerCase()] = `data:${asset.mediaType};base64,${asset.bytesBase64}`
      }
    }
  }

  return {
    itemIds: gameResources.itemIds,
    materials: gameResources.materials,
    itemTextureStates: gameResources.itemTextureStates,
    locationNames: gameResources.locationNames,
    mapAssetNames: sortedUnique([...gameResources.mapAssetNames, ...projectMaps]),
    mapAssets: gameResources.mapAssets,
    textureAssetNames: sortedUnique([...vanillaTextureNames, ...projectTextures]),
    projectTextureAssetNames: sortedUnique(projectTextures),
    texturePreviews: { ...gameResources.texturePreviews, ...projectTexturePreviews },
  }
}
