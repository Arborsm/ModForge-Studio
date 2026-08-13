/**
 * Single vanilla-asset load path for both building pages.
 *
 * Reads `Data/Buildings` once per (game root, locale), resolves the
 * `[LocalizedText …]` references its names and descriptions carry, hydrates the
 * build materials with the object display names, and caches the hydrated
 * result. The codex page and the authoring page share the cache, so switching
 * between them never re-reads the game directory.
 *
 * Texture sheets go through `loadBuildingImageState`, which owns the localized
 * `*.xx-XX.xnb` path fallbacks.
 */

import { loadTextAsset, resolveLocalizedText } from '@entities/game/api'
import type { LocaleCode } from '@locales'
import { getLocalizedImagePathCandidates, loadImageResourceFromPath } from '@shared/lib/assets'
import { OBJECT_DATA_ASSET_PATH } from '@shared/infra/stardew-assets/contentPaths'
import {
  BUILDINGS_DATA_ASSET_PATH,
  type BuildingMaterialEntry,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
  createBuildingEntryIndex,
  getBuildingTexturePath,
  parseQualifiedObjectId,
} from '../model/buildingIndex'

// ── Localized string tables ───────────────────────────────────────────────

const buildingEntriesCache = new Map<string, Promise<BuildingWorkspaceEntry[]>>()

function getRootLocaleCacheKey(rootPath: string, locale: LocaleCode) {
  return `${rootPath}::${locale}`
}

export { resolveLocalizedText }

/** Resolves every localized name, type name, description and skin label. */
export async function localizeBuildingEntries(
  entries: BuildingWorkspaceEntry[],
  rootPath: string,
  locale: LocaleCode,
): Promise<BuildingWorkspaceEntry[]> {
  const localizedEntries = await Promise.all(
    entries.map(async (entry) => {
      const displayName = (await resolveLocalizedText(rootPath, locale, entry.rawDisplayName)) ?? entry.rawDisplayName
      const generalTypeDisplayName = entry.rawGeneralTypeDisplayName
        ? ((await resolveLocalizedText(rootPath, locale, entry.rawGeneralTypeDisplayName)) ?? entry.rawGeneralTypeDisplayName)
        : null
      const description = entry.rawDescription
        ? ((await resolveLocalizedText(rootPath, locale, entry.rawDescription)) ?? entry.rawDescription)
        : null
      const localizedSkins = await Promise.all(
        entry.skins.map(async (skin) => ({
          ...skin,
          displayName: (await resolveLocalizedText(rootPath, locale, skin.displayName)) ?? skin.displayName,
          generalTypeDisplayName: skin.generalTypeDisplayName
            ? ((await resolveLocalizedText(rootPath, locale, skin.generalTypeDisplayName)) ?? skin.generalTypeDisplayName)
            : null,
          description: skin.description ? ((await resolveLocalizedText(rootPath, locale, skin.description)) ?? skin.description) : null,
        })),
      )

      return {
        ...entry,
        displayName,
        groupDisplayName:
          entry.sourceKind === 'constructible' && entry.rootKey === entry.key
            ? (generalTypeDisplayName ?? displayName)
            : entry.groupDisplayName,
        generalTypeDisplayName,
        description,
        skins: localizedSkins,
        searchText: [
          entry.searchText,
          displayName,
          generalTypeDisplayName,
          description,
          ...localizedSkins.map((skin) => `${skin.displayName} ${skin.description ?? ''}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      } satisfies BuildingWorkspaceEntry
    }),
  )

  return localizedEntries.sort((left, right) => left.displayName.localeCompare(right.displayName))
}

// ── Object display index ──────────────────────────────────────────────────

type ObjectDataEntry = {
  DisplayName?: string | null
  Name?: string | null
  SpriteIndex?: number | string | null
  Type?: string | null
  Texture?: string | null
}

/** Display name and sprite index of one `Data/Objects` row. */
export type BuildingObjectDisplay = {
  displayName: string
  objectIndex: number | null
}

function parseNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function objectLookupKey(itemId: string) {
  return (parseQualifiedObjectId(itemId) ?? itemId).trim().toLowerCase()
}

/**
 * Indexes `Data/Objects` by lowercased unqualified item id.
 *
 * Backs both the material chips in the codex and the item suggestions in the
 * authoring form, so the ids an author types resolve to the same names the
 * codex shows.
 */
export async function buildObjectDisplayIndex(
  rootPath: string,
  locale: LocaleCode,
  content: string,
): Promise<Map<string, BuildingObjectDisplay>> {
  const parsed = JSON.parse(content) as Record<string, ObjectDataEntry>
  const entries = await Promise.all(
    Object.entries(parsed).map(async ([rawItemId, entry]) => {
      const itemId = parseQualifiedObjectId(rawItemId) ?? rawItemId.trim()
      const rawDisplayName = entry.DisplayName?.trim() || entry.Name?.trim() || itemId
      const displayName = (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName
      const spriteIndex = parseNumber(entry.SpriteIndex, Number.NaN)
      return [
        itemId.toLowerCase(),
        {
          displayName,
          objectIndex: Number.isFinite(spriteIndex) ? spriteIndex : null,
        },
      ] as const
    }),
  )

  return new Map(entries)
}

function hydrateMaterial(material: BuildingMaterialEntry, objectDisplayIndex: Map<string, BuildingObjectDisplay>) {
  const resolved = objectDisplayIndex.get(objectLookupKey(material.itemId))
  if (!resolved) {
    return material
  }

  return {
    ...material,
    displayName: resolved.displayName,
    objectIndex: resolved.objectIndex,
  } satisfies BuildingMaterialEntry
}

/** Replaces raw material item ids with their localized object names. */
export function hydrateBuildingMaterials(
  entries: BuildingWorkspaceEntry[],
  objectDisplayIndex: Map<string, BuildingObjectDisplay>,
): BuildingWorkspaceEntry[] {
  return entries.map((entry) => ({
    ...entry,
    buildMaterials: entry.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    skins: entry.skins.map((skin) => ({
      ...skin,
      buildMaterials: skin.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    })),
  }))
}

// ── Texture sheets ────────────────────────────────────────────────────────

const EMPTY_TEXTURE_STATE: BuildingTextureAssetState = {
  path: null,
  url: null,
  width: null,
  height: null,
  loading: false,
}

/**
 * Loads one building texture sheet, trying every localized spelling.
 *
 * Rejects when no candidate answered, so callers can tell "no texture declared"
 * (a null path) apart from "the declared texture is missing".
 */
export async function loadBuildingImageState(path: string | null, locale: LocaleCode): Promise<BuildingTextureAssetState> {
  if (!path) {
    return EMPTY_TEXTURE_STATE
  }

  let lastError: unknown = null

  for (const candidatePath of getLocalizedImagePathCandidates(path, locale)) {
    try {
      const resource = await loadImageResourceFromPath(candidatePath, locale)
      if (!resource) {
        continue
      }
      return {
        path: candidatePath,
        url: resource.url,
        width: resource.width,
        height: resource.height,
        loading: false,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Loads the texture of every stage in an upgrade chain, keyed by building key.
 *
 * A stage whose sheet is missing resolves to an empty state instead of failing
 * the batch, so one broken stage never blanks the whole chain.
 */
export async function loadChainTextureStates(
  entries: readonly BuildingWorkspaceEntry[],
  rootPath: string | null,
  locale: LocaleCode,
): Promise<Record<string, BuildingTextureAssetState>> {
  const textureEntries = await Promise.all(
    entries.map(async (entry) => {
      const texturePath = getBuildingTexturePath(rootPath, entry)
      try {
        return [entry.key, await loadBuildingImageState(texturePath, locale)] as const
      } catch {
        return [entry.key, { ...EMPTY_TEXTURE_STATE, path: texturePath } satisfies BuildingTextureAssetState] as const
      }
    }),
  )

  return Object.fromEntries(textureEntries)
}

// ── Vanilla index ─────────────────────────────────────────────────────────

async function readCachedPromise<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>) {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const pending = loader().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, pending)
  return pending
}

/**
 * Loads and hydrates the vanilla constructible building index for one game root
 * and locale. Cached per (root, locale); a failed load drops its cache entry so
 * the next call retries instead of replaying the error forever.
 */
export async function loadBuildingWorkspaceEntries(rootPath: string, locale: LocaleCode): Promise<BuildingWorkspaceEntry[]> {
  const cacheKey = getRootLocaleCacheKey(rootPath, locale)
  return readCachedPromise(buildingEntriesCache, cacheKey, async () => {
    const [buildingsAsset, objectsAsset] = await Promise.all([
      loadTextAsset(rootPath, BUILDINGS_DATA_ASSET_PATH, locale),
      loadTextAsset(rootPath, OBJECT_DATA_ASSET_PATH, locale).catch(() => null),
    ])

    const localized = await localizeBuildingEntries(createBuildingEntryIndex(buildingsAsset.content), rootPath, locale)
    if (!objectsAsset) {
      return localized
    }

    return hydrateBuildingMaterials(localized, await buildObjectDisplayIndex(rootPath, locale, objectsAsset.content))
  })
}

/**
 * Reads the raw vanilla `Data/Buildings` records, keyed by building id.
 *
 * The authoring page seeds an override from the untouched record, so it needs
 * the game's JSON rather than the derived index `loadBuildingWorkspaceEntries`
 * returns.
 */
export async function loadVanillaBuildingRecords(rootPath: string, locale: LocaleCode): Promise<Record<string, unknown>> {
  const asset = await loadTextAsset(rootPath, BUILDINGS_DATA_ASSET_PATH, locale)
  const parsed = JSON.parse(asset.content) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'object' && value !== null && !Array.isArray(value)),
  )
}

/** One object `BuildMaterials` can reference, as the picker browses it. */
export type BuildingMaterialOption = {
  /** Unqualified object id, the spelling `BuildMaterials.ItemId` stores. */
  itemId: string
  /** Localized object name. */
  displayName: string
  /** `Data/Objects` `Type` bucket, used as the picker's category. */
  type: string | null
  /** Index into the object sheet, or null when the row declares none. */
  spriteIndex: number | null
  /** Sheet the sprite is cut from; null means the vanilla `Maps/springobjects`. */
  textureAssetName: string | null
}

/**
 * Objects `BuildMaterials` can reference, with everything the picker shows.
 *
 * Names are resolved through the same `[LocalizedText …]` path the codex uses, so
 * an author browsing materials reads "Wood" rather than `388` in both places.
 * Rejects when `Data/Objects` cannot be read, which turns the item reference
 * control back into a plain text input rather than blocking the form.
 */
export async function loadBuildingMaterialOptions(rootPath: string, locale: LocaleCode): Promise<BuildingMaterialOption[]> {
  const asset = await loadTextAsset(rootPath, OBJECT_DATA_ASSET_PATH, locale)
  const parsed = JSON.parse(asset.content) as Record<string, ObjectDataEntry>
  const options = await Promise.all(
    Object.entries(parsed).map(async ([rawItemId, entry]) => {
      const itemId = parseQualifiedObjectId(rawItemId) ?? rawItemId.trim()
      if (itemId === '') {
        return null
      }
      const rawDisplayName = entry?.DisplayName?.trim() || entry?.Name?.trim() || itemId
      const displayName = (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName
      const spriteIndex = parseNumber(entry?.SpriteIndex, Number.NaN)
      return {
        itemId,
        displayName,
        type: entry?.Type?.trim() || null,
        spriteIndex: Number.isFinite(spriteIndex) ? spriteIndex : null,
        textureAssetName: entry?.Texture?.trim() || null,
      } satisfies BuildingMaterialOption
    }),
  )

  return options
    .filter((option): option is BuildingMaterialOption => option !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}
