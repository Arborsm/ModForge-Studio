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
import {
  loadBuildingImageState,
  loadBuildingMaterialOptions,
  normalizeIndoorMapAssetName,
  type BuildingMaterialOption,
  type BuildingTextureAssetState,
} from '@entities/building'
import { loadResourceRegistry, scanMaps, type GameDirectoryInfo, type MapAssetSummary } from '@entities/game/api'
import type { DraftPatch } from '@features/cp-maker'
import type { LocaleCode } from '@locales'
import { buildGameContentPath, SPRING_OBJECTS_ASSET_PATH } from '@shared/infra/stardew-assets/contentPaths'

export type BuildingAuthoringResources = {
  /** Object ids `BuildMaterials` may reference. */
  itemIds: string[]
  /** The same objects with the label, category and sprite index the picker shows. */
  materials: BuildingMaterialOption[]
  /** Shared object sheet backing the material sprites. */
  objectSheet: BuildingTextureAssetState
  /** Location names `NonInstancedIndoorLocation` may reference. */
  locationNames: string[]
  /** `Maps/...` asset names the game ships or the project loads. */
  mapAssetNames: string[]
  /** Scanned map files, kept so the interior picker can show each one's path. */
  mapAssets: MapAssetSummary[]
  /** Texture asset names vanilla buildings use, plus the ones this draft loads. */
  textureAssetNames: string[]
}

type GameSideResources = Omit<BuildingAuthoringResources, 'textureAssetNames'>

const EMPTY_OBJECT_SHEET: BuildingTextureAssetState = { loading: false, path: null, url: null, width: null, height: null }

const EMPTY_RESOURCES: GameSideResources = {
  itemIds: [],
  materials: [],
  objectSheet: EMPTY_OBJECT_SHEET,
  locationNames: [],
  mapAssetNames: [],
  mapAssets: [],
}

/** `Content/Maps/Barn.xnb` → `Maps/Barn`, the name a patch target uses. */
function mapAssetName(asset: MapAssetSummary): string | null {
  const normalized = asset.relativePath.replaceAll('\\', '/').replace(/^Content\//iu, '')
  const withoutExtension = normalized.replace(/\.(xnb|tmx|tbin)$/iu, '')
  return withoutExtension ? normalizeIndoorMapAssetName(withoutExtension) : null
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
  vanillaTextureNames,
}: {
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  patches: readonly DraftPatch[]
  /** Texture asset names read off the vanilla building index. */
  vanillaTextureNames: readonly string[]
}): BuildingAuthoringResources {
  const [gameResources, setGameResources] = useState<GameSideResources>(EMPTY_RESOURCES)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setGameResources(EMPTY_RESOURCES)
      return
    }

    let cancelled = false

    void Promise.all([
      loadBuildingMaterialOptions(gameRootPath, locale).catch(() => [] as BuildingMaterialOption[]),
      loadResourceRegistry(gameRootPath, locale).catch(() => null),
      scanMaps(gameRootPath, locale).catch(() => [] as MapAssetSummary[]),
      // The object sheet only feeds material thumbnails, so a missing sheet
      // degrades to label-only rows instead of failing the whole batch.
      loadBuildingImageState(buildGameContentPath(gameRootPath, SPRING_OBJECTS_ASSET_PATH), locale).catch(() => EMPTY_OBJECT_SHEET),
    ])
      .then(([materials, registry, mapAssets, objectSheet]) => {
        if (cancelled) {
          return
        }
        setGameResources({
          itemIds: sortedUnique(materials.map((material) => material.itemId)),
          materials,
          objectSheet,
          locationNames: sortedUnique((registry?.entries ?? []).filter((entry) => entry.kind === 'location').map((entry) => entry.value)),
          mapAssetNames: sortedUnique(mapAssets.map(mapAssetName).filter((name): name is string => name !== null)),
          mapAssets,
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

  const projectMaps: string[] = []
  const projectTextures: string[] = []
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
    }
  }

  return {
    itemIds: gameResources.itemIds,
    materials: gameResources.materials,
    objectSheet: gameResources.objectSheet,
    locationNames: gameResources.locationNames,
    mapAssetNames: sortedUnique([...gameResources.mapAssetNames, ...projectMaps]),
    mapAssets: gameResources.mapAssets,
    textureAssetNames: sortedUnique([...vanillaTextureNames, ...projectTextures]),
  }
}
