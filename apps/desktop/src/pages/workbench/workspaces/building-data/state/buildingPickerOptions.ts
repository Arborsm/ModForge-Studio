/**
 * Turns the building editor's reference data into browsable picker catalogs.
 *
 * The flat id lists behind `AssetResources` are enough to validate against, but
 * not enough to *choose* from: `388` says nothing, and the vanilla upgrade chain
 * is invisible in an alphabetical list of keys. So each catalog here adds the
 * three things the picker dialog renders — a localized label, a category to
 * filter by, and a detail line — plus a sprite for materials.
 *
 * Every builder degrades to an empty catalog when its source is missing, which
 * makes `resourceOptionsFor` fall back to the flat list rather than showing an
 * empty dialog.
 */

import type { ResourceOption, ResourceSprite } from '@entities/asset-schema'
import type { BuildingMaterialOption, BuildingTextureAssetState, BuildingWorkspaceEntry } from '@entities/building'
import type { MapAssetSummary } from '@entities/game/api'

/** Vanilla object sheet geometry: 16px cells across a 384px-wide sheet. */
const OBJECT_SPRITE_PIXELS = 16
const OBJECT_SHEET_WIDTH = 384

/** Magnification that makes a 16px object icon legible as a list thumbnail. */
const OBJECT_SPRITE_SCALE = 1.75

/**
 * Where one object index sits on the shared object sheet.
 *
 * Indices run left-to-right then wrap, which is the same walk the game does when
 * it resolves a `SpriteIndex` against `Maps/springobjects`.
 */
function objectSpriteRect(spriteIndex: number) {
  const pixelOffset = spriteIndex * OBJECT_SPRITE_PIXELS
  return {
    x: pixelOffset % OBJECT_SHEET_WIDTH,
    y: Math.floor(pixelOffset / OBJECT_SHEET_WIDTH) * OBJECT_SPRITE_PIXELS,
    width: OBJECT_SPRITE_PIXELS,
    height: OBJECT_SPRITE_PIXELS,
  }
}

/**
 * Build-material options, sprite-previewed off the shared object sheet.
 *
 * Only objects drawn from the vanilla sheet get a sprite: a modded object with
 * its own `Texture` would need that sheet loaded too, and a wrong cut-out is
 * worse than none, so those fall back to a label-only row.
 */
export function buildMaterialOptions(
  materials: readonly BuildingMaterialOption[],
  objectSheet: BuildingTextureAssetState,
): ResourceOption[] {
  const sheetReady = objectSheet.url !== null && objectSheet.width !== null && objectSheet.height !== null

  return materials.map((material) => {
    const sprite: ResourceSprite | undefined =
      sheetReady && material.spriteIndex !== null && material.textureAssetName === null
        ? {
            url: objectSheet.url as string,
            sheetWidth: objectSheet.width as number,
            sheetHeight: objectSheet.height as number,
            ...objectSpriteRect(material.spriteIndex),
            scale: OBJECT_SPRITE_SCALE,
          }
        : undefined

    return {
      value: material.itemId,
      label: material.displayName,
      category: material.type ?? undefined,
      sprite,
    }
  })
}

/**
 * Building options grouped by upgrade chain.
 *
 * `BuildingToUpgrade` names the *previous* stage of a chain, so the chain a key
 * belongs to is the one thing an author needs while picking it. Vanilla keys are
 * categorized by their chain's display name; keys this patch defines are
 * categorized as project keys so a new building is never buried among vanilla
 * ones.
 */
export function buildBuildingRefOptions({
  vanillaEntries,
  projectKeys,
  projectCategory,
  stageDetail,
}: {
  vanillaEntries: readonly BuildingWorkspaceEntry[]
  projectKeys: readonly string[]
  /** Category label for keys this patch defines. */
  projectCategory: string
  /** Detail line for a vanilla stage, given its chain and position. */
  stageDetail: (chain: string, stage: number, total: number) => string
}): ResourceOption[] {
  const stagesByGroup = new Map<string, BuildingWorkspaceEntry[]>()
  for (const entry of vanillaEntries) {
    const bucket = stagesByGroup.get(entry.groupKey)
    if (bucket) {
      bucket.push(entry)
    } else {
      stagesByGroup.set(entry.groupKey, [entry])
    }
  }

  const seen = new Set<string>()
  const options: ResourceOption[] = []

  for (const key of projectKeys) {
    const normalized = key.trim()
    if (normalized === '' || seen.has(normalized.toLowerCase())) {
      continue
    }
    seen.add(normalized.toLowerCase())
    options.push({ value: normalized, category: projectCategory })
  }

  for (const entry of vanillaEntries) {
    if (seen.has(entry.key.toLowerCase())) {
      continue
    }
    seen.add(entry.key.toLowerCase())
    const stages = stagesByGroup.get(entry.groupKey) ?? [entry]
    const position = stages.findIndex((stage) => stage.key === entry.key) + 1
    options.push({
      value: entry.key,
      label: entry.displayName,
      category: entry.groupDisplayName,
      detail: stages.length > 1 ? stageDetail(entry.groupDisplayName, position, stages.length) : undefined,
    })
  }

  return options
}

/**
 * Interior map options, categorized by the folder the map lives in.
 *
 * `IndoorMap` takes a `Maps/…` asset name, and the folder is what distinguishes
 * an interior worth reusing from a farm map — so it becomes the category, while
 * the file's own relative path stays visible as the detail line.
 */
export function buildIndoorMapOptions({
  assetNames,
  mapAssets,
  projectCategory,
  vanillaCategory,
}: {
  /** `Maps/…` names the form accepts, vanilla and project-provided alike. */
  assetNames: readonly string[]
  /** Scan results, used to attach the on-disk path to vanilla names. */
  mapAssets: readonly MapAssetSummary[]
  projectCategory: string
  vanillaCategory: string
}): ResourceOption[] {
  const pathByName = new Map<string, string>()
  for (const asset of mapAssets) {
    const normalized = asset.relativePath.replaceAll('\\', '/').replace(/^Content\//iu, '')
    const withoutExtension = normalized.replace(/\.(xnb|tmx|tbin)$/iu, '')
    if (withoutExtension !== '') {
      pathByName.set(withoutExtension.toLowerCase(), asset.relativePath)
    }
  }

  return assetNames.map((name) => {
    const diskPath = pathByName.get(name.replaceAll('\\', '/').toLowerCase()) ?? null
    const segments = name.replaceAll('\\', '/').split('/')
    const leaf = segments.at(-1) ?? name
    const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : null

    return {
      value: name,
      label: leaf,
      category: diskPath === null ? projectCategory : (folder ?? vanillaCategory),
      detail: diskPath ?? undefined,
    }
  })
}

/**
 * Texture options, categorized by folder.
 *
 * Building sheets live under `Buildings/…` while a project's own sheet can be
 * anywhere, so the folder is the only grouping that stays meaningful once a pack
 * adds its own art.
 */
export function buildTextureRefOptions(assetNames: readonly string[], rootCategory: string): ResourceOption[] {
  return assetNames.map((name) => {
    const segments = name.replaceAll('\\', '/').split('/')
    const leaf = segments.at(-1) ?? name
    return {
      value: name,
      label: leaf,
      category: segments.length > 1 ? segments.slice(0, -1).join('/') : rootCategory,
      detail: segments.length > 1 ? name : undefined,
    }
  })
}
