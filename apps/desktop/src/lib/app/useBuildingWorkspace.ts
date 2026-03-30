import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { deferToTimeout } from '../react/deferred'
import { loadTextAsset, loadMapAsset, scanMaps, type GameDirectoryInfo } from '../desktop'
import type { LocaleCode, BuildingsPanelCopy } from '../editor-shell'
import { loadImageResourceFromPath } from '../imageMetrics'
import type { ViewportWorldPoint } from '../../components/MapViewport'
import type { MapDocument, MapPropertyValue, MapTileset } from '../maps/types'
import { OBJECT_DATA_ASSET_PATH, SPRING_OBJECTS_ASSET_PATH } from './characterWorkspace'
import {
  BUILDINGS_DATA_ASSET_PATH,
  buildGameContentPath,
  buildMapPathLabel,
  createBuildingEntryIndex,
  createConstructibleBuildingGroups,
  getBuildingTexturePath,
  type BuildingMaterialEntry,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
  type ConstructibleBuildingGroup,
  type WorldBuildingEntrance,
} from './buildingWorkspace'
import {
  BUILDING_LOCATION_SEEDS,
  BUILDING_LOCATION_SEED_GROUP_ORDER,
  BUILDING_LOCATION_SEED_GROUP_LABELS,
  type BuildingLocationSeedGroup,
} from './buildingLocationSeeds'
import { getWorldAtlasNameAliases } from '../maps/world'
import { buildModBrowserGroups, buildModEntryLookup, findModSources, useModAssetIndex, type BrowserSourceMode } from './modAssetIndex'

type UseBuildingWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: BuildingsPanelCopy
}

type LocationCreateOnLoadEntry = {
  MapPath?: string | null
  Type?: string | null
  AlwaysActive?: boolean | null
}

type LocationDataEntry = {
  DisplayName?: string | null
  DefaultArrivalTile?: {
    X?: number | string | null
    Y?: number | string | null
  } | null
  CreateOnLoad?: LocationCreateOnLoadEntry | null
  FormerLocationNames?: string[] | null
}

type ObjectDataEntry = {
  DisplayName?: string | null
  Name?: string | null
  SpriteIndex?: number | string | null
}

type WarpEntry = {
  sourceX: number
  sourceY: number
  targetMap: string
  targetX: number
  targetY: number
}

type WorldLocationSeedSource = 'predefined' | 'merged'

type WorldLocationSeed = {
  name: string
  label: string | null
  group: BuildingLocationSeedGroup | null
  groupLabel: string | null
  locationName: string | null
  mapAssetName: string | null
  typeName: string | null
  formerNames: string[]
  defaultArrivalTile: { X: number; Y: number } | null
  allowOutdoor: boolean
  source: WorldLocationSeedSource
}

type LocationDataSeed = {
  locationName: string
  mapAssetName: string | null
  typeName: string | null
  formerNames: string[]
  defaultArrivalTile: { X: number; Y: number } | null
}

const stringTableCache = new Map<string, Promise<Record<string, string>>>()
const LOCATIONS_DATA_ASSET_PATH = 'Content\\Data\\Locations.xnb'
const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
const FLIPPED_VERTICALLY_FLAG = 0x40000000
const FLIPPED_DIAGONALLY_FLAG = 0x20000000
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000
const TILE_ID_MASK =
  (~(
    FLIPPED_HORIZONTALLY_FLAG |
    FLIPPED_VERTICALLY_FLAG |
    FLIPPED_DIAGONALLY_FLAG |
    ROTATED_HEXAGONAL_120_FLAG
  )) >>> 0

function normalizeMapName(name: string) {
  return name.trim().toLowerCase()
}

function isTruthyProperty(value: MapPropertyValue | undefined) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized !== '' && normalized !== '0' && normalized !== 'false'
  }

  return false
}

function asPropertyString(value: MapPropertyValue | undefined) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function getLocalizedImagePathCandidates(path: string, locale: LocaleCode) {
  if (locale === 'en-US') {
    return [path]
  }

  return [path.replace(/\.xnb$/iu, `.${locale}.xnb`), path]
}

async function loadImageState(path: string | null, locale: LocaleCode): Promise<BuildingTextureAssetState> {
  if (!path) {
    return {
      path: null,
      url: null,
      width: null,
      height: null,
    }
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
        }
      } catch (error) {
        lastError = error
      }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function getStringTableCacheKey(rootPath: string, assetPath: string, locale: LocaleCode) {
  return `${rootPath}::${assetPath.replaceAll('/', '\\')}::${locale}`
}

function tryParseStringAssetReference(value: string | null | undefined) {
  const rawValue = value?.trim() ?? ''
  if (!rawValue) {
    return null
  }

  const localizedTextMatch = /^\[LocalizedText\s+(.+)\]$/u.exec(rawValue)
  const trimmed = localizedTextMatch?.[1]?.trim() ?? rawValue
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null
  }

  const assetName = trimmed.slice(0, separatorIndex).replaceAll('/', '\\')
  const key = trimmed.slice(separatorIndex + 1)
  if (!/[\\/]/u.test(assetName)) {
    return null
  }

  return {
    assetPath: `Content\\${assetName}.xnb`,
    key,
  }
}

async function loadStringTable(rootPath: string, assetPath: string, locale: LocaleCode) {
  const cacheKey = getStringTableCacheKey(rootPath, assetPath, locale)
  const cached = stringTableCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending: Promise<Record<string, string>> = loadTextAsset(rootPath, assetPath, locale)
    .then((asset) => {
      const parsed = JSON.parse(asset.content) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).flatMap(([key, value]) =>
          typeof value === 'string' ? ([[key, value]] as const) : [],
        ),
      )
    })
    .catch(() => ({} as Record<string, string>))

  stringTableCache.set(cacheKey, pending)
  return pending
}

async function resolveLocalizedText(rootPath: string, locale: LocaleCode, value: string | null | undefined, depth = 0): Promise<string | null> {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (depth > 3) {
    return trimmed
  }

  const reference = tryParseStringAssetReference(trimmed)
  if (!reference) {
    return trimmed
  }

  const table = await loadStringTable(rootPath, reference.assetPath, locale)
  const resolved = table[reference.key]
  if (!resolved) {
    return trimmed
  }

  return resolveLocalizedText(rootPath, locale, resolved, depth + 1)
}

async function localizeBuildingEntries(entries: BuildingWorkspaceEntry[], rootPath: string, locale: LocaleCode) {
  const localizedEntries = await Promise.all(
    entries.map(async (entry) => {
      const displayName = (await resolveLocalizedText(rootPath, locale, entry.rawDisplayName)) ?? entry.rawDisplayName
      const generalTypeDisplayName = entry.rawGeneralTypeDisplayName
        ? (await resolveLocalizedText(rootPath, locale, entry.rawGeneralTypeDisplayName)) ?? entry.rawGeneralTypeDisplayName
        : null
      const description = entry.rawDescription
        ? (await resolveLocalizedText(rootPath, locale, entry.rawDescription)) ?? entry.rawDescription
        : null
      const localizedSkins = await Promise.all(
        entry.skins.map(async (skin) => ({
          ...skin,
          displayName: (await resolveLocalizedText(rootPath, locale, skin.displayName)) ?? skin.displayName,
          generalTypeDisplayName: skin.generalTypeDisplayName
            ? (await resolveLocalizedText(rootPath, locale, skin.generalTypeDisplayName)) ?? skin.generalTypeDisplayName
            : null,
          description: skin.description ? (await resolveLocalizedText(rootPath, locale, skin.description)) ?? skin.description : null,
        })),
      )

      return {
        ...entry,
        displayName,
        groupDisplayName:
          entry.sourceKind === 'constructible' && entry.rootKey === entry.key ? (generalTypeDisplayName ?? displayName) : entry.groupDisplayName,
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

function parseQualifiedObjectId(itemId: string) {
  const match = /^\(O\)(.+)$/iu.exec(itemId.trim())
  return match?.[1]?.trim() || itemId.trim()
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

function trimString(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function normalizeMapAssetName(value: string | null | undefined) {
  const trimmed = trimString(value)?.replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^Content\//iu, '')
}

function parsePointLike(
  value:
    | {
        X?: number | string | null
        Y?: number | string | null
      }
    | null
    | undefined,
) {
  if (!value) {
    return null
  }

  return {
    X: parseNumber(value.X, 0),
    Y: parseNumber(value.Y, 0),
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

function buildLocationDataIndex(locationsContent: string | null) {
  const locationDataIndex = new Map<string, LocationDataSeed>()

  if (!locationsContent) {
    return locationDataIndex
  }

  const parsed = JSON.parse(locationsContent) as Record<string, LocationDataEntry>
  for (const [name, entry] of Object.entries(parsed)) {
    if (name === 'Default') {
      continue
    }

    const createOnLoad = entry.CreateOnLoad
    if (!createOnLoad?.MapPath) {
      continue
    }

    locationDataIndex.set(normalizeMapName(name), {
      locationName: name,
      mapAssetName: normalizeMapAssetName(createOnLoad.MapPath),
      typeName: trimString(createOnLoad.Type),
      formerNames: (entry.FormerLocationNames ?? []).filter((value): value is string => Boolean(value?.trim())),
      defaultArrivalTile: parsePointLike(entry.DefaultArrivalTile),
    })
  }

  return locationDataIndex
}

function buildLocationSeeds(locationsContent: string | null) {
  const locationDataIndex = buildLocationDataIndex(locationsContent)

  return BUILDING_LOCATION_SEEDS.map((seed) => {
    const lookupCandidates = uniqueStrings([seed.locationName, ...(seed.formerNames ?? [])])
    const locationData =
      lookupCandidates
        .map((candidate) => locationDataIndex.get(normalizeMapName(candidate)) ?? null)
        .find((entry): entry is LocationDataSeed => entry != null) ?? null

    return {
      name: seed.name,
      label: trimString(seed.label),
      group: seed.group,
      groupLabel: BUILDING_LOCATION_SEED_GROUP_LABELS[seed.group],
      locationName: trimString(seed.locationName) ?? locationData?.locationName ?? null,
      mapAssetName: locationData?.mapAssetName ?? normalizeMapAssetName(seed.mapAssetName),
      typeName: locationData?.typeName ?? trimString(seed.typeName),
      formerNames: uniqueStrings([...(locationData?.formerNames ?? []), ...(seed.formerNames ?? [])]),
      defaultArrivalTile: locationData?.defaultArrivalTile ?? null,
      allowOutdoor: Boolean(seed.allowOutdoor),
      source: locationData ? 'merged' : 'predefined',
    } satisfies WorldLocationSeed
  })
}

async function buildObjectDisplayIndex(rootPath: string, locale: LocaleCode, content: string) {
  const parsed = JSON.parse(content) as Record<string, ObjectDataEntry>
  const entries = await Promise.all(
    Object.entries(parsed).map(async ([rawItemId, entry]) => {
      const itemId = parseQualifiedObjectId(rawItemId)
      const rawDisplayName = entry.DisplayName?.trim() || entry.Name?.trim() || itemId
      const displayName = (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName
      return [
        itemId.toLowerCase(),
        {
          displayName,
          objectIndex: Number.isFinite(parseNumber(entry.SpriteIndex, Number.NaN)) ? parseNumber(entry.SpriteIndex, Number.NaN) : null,
        },
      ] as const
    }),
  )

  return new Map(entries)
}

function hydrateMaterial(material: BuildingMaterialEntry, objectDisplayIndex: Map<string, { displayName: string; objectIndex: number | null }>) {
  const lookupKey = parseQualifiedObjectId(material.itemId).toLowerCase()
  const resolved = objectDisplayIndex.get(lookupKey)
  if (!resolved) {
    return material
  }

  return {
    ...material,
    displayName: resolved.displayName,
    objectIndex: resolved.objectIndex,
  } satisfies BuildingMaterialEntry
}

function hydrateBuildingMaterials(entries: BuildingWorkspaceEntry[], objectDisplayIndex: Map<string, { displayName: string; objectIndex: number | null }>) {
  return entries.map((entry) => ({
    ...entry,
    buildMaterials: entry.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    skins: entry.skins.map((skin) => ({
      ...skin,
      buildMaterials: skin.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    })),
  }))
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function consumeNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => consumeNext()))
  return results
}

function getMapAssetName(document: MapDocument) {
  const normalizedRelativePath = document.relativePath.replaceAll('/', '\\').replace(/^Content\\/iu, '')
  return normalizedRelativePath.replace(/\.xnb$/iu, '').replaceAll('\\', '/')
}

function parseWarpProperty(rawValue: string) {
  const tokens = rawValue.trim().split(/\s+/u).filter(Boolean)
  const entries: WarpEntry[] = []

  for (let index = 0; index + 4 < tokens.length; index += 5) {
    const sourceX = Number.parseInt(tokens[index] ?? '', 10)
    const sourceY = Number.parseInt(tokens[index + 1] ?? '', 10)
    const targetMap = tokens[index + 2] ?? ''
    const targetX = Number.parseInt(tokens[index + 3] ?? '', 10)
    const targetY = Number.parseInt(tokens[index + 4] ?? '', 10)

    if (
      !Number.isFinite(sourceX) ||
      !Number.isFinite(sourceY) ||
      !Number.isFinite(targetX) ||
      !Number.isFinite(targetY) ||
      !targetMap
    ) {
      continue
    }

    entries.push({
      sourceX,
      sourceY,
      targetMap,
      targetX,
      targetY,
    })
  }

  return entries
}

function parseWarpEntries(mapDocument: MapDocument) {
  const entries: WarpEntry[] = []

  for (const propertyName of ['Warp', 'NPCWarp']) {
    const rawValue = asPropertyString(mapDocument.properties[propertyName]).trim()
    if (!rawValue) {
      continue
    }

    entries.push(...parseWarpProperty(rawValue))
  }

  return entries
}

function isExteriorWarp(mapDocument: MapDocument, entry: WarpEntry) {
  return (
    entry.sourceX < 0 ||
    entry.sourceY < 0 ||
    entry.sourceX >= mapDocument.width ||
    entry.sourceY >= mapDocument.height
  )
}

function parsePortalTargetMapFromAction(rawAction: string) {
  const tokens = rawAction.trim().split(/\s+/u)
  if (!tokens.length) {
    return null
  }

  const actionName = tokens[0]
  if (actionName === 'LockedDoorWarp' && tokens.length >= 4) {
    return tokens[3]
  }

  if (actionName === 'MagicWarp' && tokens.length >= 2) {
    return tokens[1]
  }

  if (actionName === 'Warp') {
    if (tokens.length >= 4 && Number.isFinite(Number(tokens[1])) && Number.isFinite(Number(tokens[2]))) {
      return tokens[3]
    }

    if (tokens.length >= 2) {
      return tokens[1]
    }
  }

  return null
}

function findTileset(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}

function getActionTargetMap(rawGid: number, sourceDocument: MapDocument) {
  const gid = rawGid >>> 0
  const baseGid = gid & TILE_ID_MASK
  if (baseGid === 0) {
    return null
  }

  const tileset = findTileset(sourceDocument.tilesets, baseGid)
  if (!tileset) {
    return null
  }

  const tileId = baseGid - tileset.firstGid
  const tileProperties = tileset.tileProperties[tileId]
  if (!tileProperties) {
    return null
  }

  for (const propertyName of ['Action', 'TouchAction']) {
    const rawAction = asPropertyString(tileProperties[propertyName]).trim()
    if (!rawAction) {
      continue
    }

    const targetMap = parsePortalTargetMapFromAction(rawAction)
    if (targetMap) {
      return targetMap
    }
  }

  return null
}

function getPortalTargetMapFromProperties(properties: Record<string, MapPropertyValue>) {
  for (const propertyName of ['Action', 'TouchAction']) {
    const rawAction = asPropertyString(properties[propertyName]).trim()
    if (!rawAction) {
      continue
    }

    const targetMap = parsePortalTargetMapFromAction(rawAction)
    if (targetMap) {
      return targetMap
    }
  }

  return null
}

type WorldEntranceAggregate = {
  targetDocument: MapDocument
  entrances: WorldBuildingEntrance[]
  primaryExteriorMapName: string | null
  primaryExteriorMapAssetName: string | null
  primaryExteriorMapPathLabel: string | null
  primaryExteriorEntryTile: { X: number; Y: number } | null
}

function sortWorldEntrances(entrances: WorldBuildingEntrance[]) {
  return [...entrances].sort((left, right) =>
    `${left.sourceMapName}:${left.sourceTile.X}:${left.sourceTile.Y}`.localeCompare(
      `${right.sourceMapName}:${right.sourceTile.X}:${right.sourceTile.Y}`,
    ),
  )
}

function createWorldBuildingEntry({
  key,
  displayName,
  internalName,
  locationSeed,
  targetDocument,
  entrances,
  primaryExteriorMapName,
  indoorMapAssetName,
  indoorMapPathLabel,
  exteriorMapAssetName,
  exteriorMapPathLabel,
  exteriorMapName,
  exteriorEntryTile,
}: {
  key: string
  displayName: string
  internalName: string
  locationSeed: WorldLocationSeed | null
  targetDocument: MapDocument | null
  entrances: WorldBuildingEntrance[]
  primaryExteriorMapName: string | null
  indoorMapAssetName: string | null
  indoorMapPathLabel: string
  exteriorMapAssetName: string | null
  exteriorMapPathLabel: string | null
  exteriorMapName: string | null
  exteriorEntryTile: { X: number; Y: number } | null
}) {
  const locationType = locationSeed?.typeName ?? null
  const formerNames = locationSeed?.formerNames ?? []
  const sortedEntrances = sortWorldEntrances(entrances)
  const groupLabel = locationSeed?.groupLabel ?? displayName
  const metadata: Record<string, string> = {}

  if (locationSeed?.group) {
    metadata.worldSeedGroupKey = locationSeed.group
    metadata.worldSeedGroupLabel = groupLabel
    metadata.worldSeedGroupOrder = String(BUILDING_LOCATION_SEED_GROUP_ORDER[locationSeed.group])
  }
  if (locationSeed?.label) {
    metadata.locationSeedLabel = locationSeed.label
  }
  if (locationSeed?.locationName) {
    metadata.locationName = locationSeed.locationName
  }
  if (locationType) {
    metadata.locationType = locationType
  }
  if (locationSeed) {
    metadata.locationSeedSource = locationSeed.source
    metadata.locationSeedName = locationSeed.name
    metadata.allowOutdoor = locationSeed.allowOutdoor ? 'true' : 'false'
  }
  if (formerNames.length) {
    metadata.formerLocationNames = formerNames.join(', ')
  }

  return {
    sourceKind: 'world',
    key,
    groupKey: key,
    groupDisplayName: groupLabel,
    rawDisplayName: displayName,
    displayName,
    rawGeneralTypeDisplayName: locationType ?? (primaryExteriorMapName ? `Exterior ${primaryExteriorMapName}` : null),
    generalTypeDisplayName: locationType ?? (primaryExteriorMapName ? `Exterior ${primaryExteriorMapName}` : null),
    rawDescription: sortedEntrances.length ? `${sortedEntrances.length} entrances` : (locationType ?? indoorMapAssetName ?? exteriorMapAssetName),
    description: sortedEntrances.length ? `${sortedEntrances.length} entrances` : (locationType ?? indoorMapAssetName ?? exteriorMapAssetName),
    internalName,
    searchText: [
      displayName,
      internalName,
      groupLabel,
      locationSeed?.label,
      locationSeed?.locationName,
      targetDocument?.name,
      indoorMapAssetName,
      exteriorMapAssetName,
      exteriorMapName,
      primaryExteriorMapName,
      locationType,
      ...formerNames,
      ...sortedEntrances.flatMap((entry) => [entry.sourceMapName, entry.sourceMapAssetName, entry.trigger]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    textureAssetName: null,
    texturePathLabel: 'Buildings\\Unknown',
    sourceRect: null,
    drawShadow: false,
    upgradeSignTile: null,
    upgradeSignHeight: 0,
    size: null,
    fadeWhenBehind: false,
    seasonOffset: null,
    drawOffset: null,
    sortTileOffset: 0,
    collisionMap: null,
    additionalPlacementTiles: [],
    buildingClassName: locationType,
    builder: null,
    buildCondition: null,
    buildDays: 0,
    buildCost: 0,
    buildMaterials: [],
    upgradeFromKey: null,
    upgradeToKeys: [],
    magicalConstruction: false,
    buildMenuDrawOffset: null,
    humanDoor: locationSeed?.defaultArrivalTile ?? null,
    animalDoor: null,
    animalDoorOpenDuration: 0,
    animalDoorOpenSound: null,
    animalDoorCloseDuration: 0,
    animalDoorCloseSound: null,
    nonInstancedIndoorLocation: null,
    indoorMapAssetName,
    indoorMapPathLabel,
    indoorMapType: null,
    exteriorMapAssetName,
    exteriorMapPathLabel,
    exteriorMapName,
    exteriorEntryTile,
    worldEntrances: sortedEntrances,
    maxOccupants: 0,
    validOccupantTypes: [],
    allowAnimalPregnancy: false,
    indoorItemMoves: [],
    indoorItems: [],
    addMailOnBuild: [],
    metadata,
    modData: {},
    hayCapacity: 0,
    chests: [],
    defaultAction: null,
    additionalTilePropertyRadius: 0,
    allowsFlooringUnderneath: false,
    actionTiles: [],
    tileProperties: [],
    itemConversions: [],
    drawLayers: [],
    customFields: {},
    skins: [],
    upgradeChainKeys: [key],
    stageIndex: 0,
    stageCount: 1,
    rootKey: key,
    leafKey: key,
  } satisfies BuildingWorkspaceEntry
}

function buildWorldBuildingEntries(mapDocuments: MapDocument[], locationSeeds: WorldLocationSeed[]) {
  const documentsByAlias = new Map<string, MapDocument>()
  for (const document of mapDocuments) {
    for (const alias of getWorldAtlasNameAliases(document.name)) {
      if (!documentsByAlias.has(alias)) {
        documentsByAlias.set(alias, document)
      }
    }

    const assetAlias = normalizeMapName(getMapAssetName(document))
    if (!documentsByAlias.has(assetAlias)) {
      documentsByAlias.set(assetAlias, document)
    }
  }

  const outdoorDocuments = mapDocuments.filter((document) => isTruthyProperty(document.properties.Outdoors))
  const aggregates = new Map<string, WorldEntranceAggregate>()

  function ensureAggregate(targetDocument: MapDocument) {
    const key = normalizeMapName(targetDocument.name)
    const existing = aggregates.get(key)
    if (existing) {
      return existing
    }

    const nextAggregate: WorldEntranceAggregate = {
      targetDocument,
      entrances: [],
      primaryExteriorMapName: null,
      primaryExteriorMapAssetName: null,
      primaryExteriorMapPathLabel: null,
      primaryExteriorEntryTile: null,
    }
    aggregates.set(key, nextAggregate)
    return nextAggregate
  }

  function addWorldEntrance(
    sourceDocument: MapDocument,
    targetMap: string,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    trigger: string,
  ) {
    const targetDocument = documentsByAlias.get(normalizeMapName(targetMap))
    if (!targetDocument || isTruthyProperty(targetDocument.properties.Outdoors)) {
      return
    }

    const sourceMapAssetName = getMapAssetName(sourceDocument)
    const entrance = {
      sourceMapName: sourceDocument.name,
      sourceMapAssetName,
      sourceMapPathLabel: sourceDocument.relativePath,
      sourceTile: { X: sourceX, Y: sourceY },
      targetTile: { X: targetX, Y: targetY },
      trigger,
    } satisfies WorldBuildingEntrance
    const aggregate = ensureAggregate(targetDocument)
    aggregate.entrances.push(entrance)
    if (!aggregate.primaryExteriorMapName) {
      aggregate.primaryExteriorMapName = sourceDocument.name
      aggregate.primaryExteriorMapAssetName = sourceMapAssetName
      aggregate.primaryExteriorMapPathLabel = sourceDocument.relativePath
      aggregate.primaryExteriorEntryTile = { X: sourceX, Y: sourceY }
    }
  }

  for (const sourceDocument of outdoorDocuments) {
    for (const group of sourceDocument.objectGroups) {
      for (const object of group.objects) {
        const targetMap = getPortalTargetMapFromProperties(object.properties)
        if (!targetMap) {
          continue
        }

        addWorldEntrance(
          sourceDocument,
          targetMap,
          Math.floor(object.x / sourceDocument.tileWidth),
          Math.floor(object.y / sourceDocument.tileHeight),
          0,
          0,
          'object-action',
        )
      }
    }

    for (const entry of parseWarpEntries(sourceDocument)) {
      if (isExteriorWarp(sourceDocument, entry)) {
        continue
      }

      addWorldEntrance(sourceDocument, entry.targetMap, entry.sourceX, entry.sourceY, entry.targetX, entry.targetY, 'warp')
    }

    for (const layer of sourceDocument.layers) {
      for (let index = 0; index < layer.gids.length; index += 1) {
        const rawGid = layer.gids[index] ?? 0
        const targetMap = getActionTargetMap(rawGid, sourceDocument)
        if (!targetMap) {
          continue
        }

        const tileX = index % layer.width
        const tileY = Math.floor(index / layer.width)
        addWorldEntrance(sourceDocument, targetMap, tileX, tileY, 0, 0, 'tile-action')
      }
    }
  }

  const entries: BuildingWorkspaceEntry[] = []
  const seededIndoorTargets = new Set<string>()

  for (const seed of locationSeeds) {
    const candidateNames = uniqueStrings([seed.locationName, ...seed.formerNames])
    const targetDocument =
      candidateNames
        .map((name) => documentsByAlias.get(normalizeMapName(name)) ?? null)
        .find((document): document is MapDocument => document != null) ??
      (seed.mapAssetName ? (documentsByAlias.get(normalizeMapName(seed.mapAssetName)) ?? null) : null)

    if (!targetDocument) {
      continue
    }

    const targetIsOutdoor = isTruthyProperty(targetDocument.properties.Outdoors)
    if (targetIsOutdoor && !seed.allowOutdoor) {
      continue
    }

    const aggregate = targetIsOutdoor ? null : ensureAggregate(targetDocument)
    if (aggregate) {
      seededIndoorTargets.add(normalizeMapName(targetDocument.name))
    }

    const indoorMapAssetName = targetIsOutdoor ? null : getMapAssetName(targetDocument)
    const exteriorMapAssetName = targetIsOutdoor ? getMapAssetName(targetDocument) : (aggregate?.primaryExteriorMapAssetName ?? null)
    const exteriorMapPathLabel = targetIsOutdoor ? targetDocument.relativePath : (aggregate?.primaryExteriorMapPathLabel ?? null)
    const exteriorMapName = targetIsOutdoor ? targetDocument.name : (aggregate?.primaryExteriorMapName ?? null)
    const exteriorEntryTile = targetIsOutdoor ? null : (aggregate?.primaryExteriorEntryTile ?? null)
    const displayName = seed.label ?? seed.locationName ?? targetDocument.name
    const internalName = seed.locationName ?? targetDocument.name

    entries.push(
      createWorldBuildingEntry({
        key: `world:${seed.name}`,
        displayName,
        internalName,
        locationSeed: seed,
        targetDocument,
        entrances: aggregate?.entrances ?? [],
        primaryExteriorMapName: aggregate?.primaryExteriorMapName ?? null,
        indoorMapAssetName,
        indoorMapPathLabel: buildMapPathLabel(indoorMapAssetName) ?? (indoorMapAssetName ? targetDocument.relativePath : 'Maps\\Unknown'),
        exteriorMapAssetName,
        exteriorMapPathLabel,
        exteriorMapName,
        exteriorEntryTile,
      }),
    )
  }

  for (const aggregate of aggregates.values()) {
    const targetKey = normalizeMapName(aggregate.targetDocument.name)
    if (seededIndoorTargets.has(targetKey)) {
      continue
    }

    const indoorMapAssetName = getMapAssetName(aggregate.targetDocument)
    entries.push(
      createWorldBuildingEntry({
        key: `world:${targetKey}`,
        displayName: aggregate.targetDocument.name,
        internalName: aggregate.targetDocument.name,
        locationSeed: null,
        targetDocument: aggregate.targetDocument,
        entrances: aggregate.entrances,
        primaryExteriorMapName: aggregate.primaryExteriorMapName,
        indoorMapAssetName,
        indoorMapPathLabel: buildMapPathLabel(indoorMapAssetName) ?? aggregate.targetDocument.relativePath,
        exteriorMapAssetName: aggregate.primaryExteriorMapAssetName,
        exteriorMapPathLabel: aggregate.primaryExteriorMapPathLabel,
        exteriorMapName: aggregate.primaryExteriorMapName,
        exteriorEntryTile: aggregate.primaryExteriorEntryTile,
      }),
    )
  }

  return entries.sort((left, right) => {
    const leftRank = Number.parseInt(left.metadata.worldSeedGroupOrder ?? '999', 10)
    const rightRank = Number.parseInt(right.metadata.worldSeedGroupOrder ?? '999', 10)
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return left.displayName.localeCompare(right.displayName)
  })
}

export function useBuildingWorkspace({ directoryInfo, locale, copy }: UseBuildingWorkspaceOptions) {
  const [buildingEntries, setBuildingEntries] = useState<BuildingWorkspaceEntry[]>([])
  const [constructibleGroups, setConstructibleGroups] = useState<ConstructibleBuildingGroup[]>([])
  const [worldBuildings, setWorldBuildings] = useState<BuildingWorkspaceEntry[]>([])
  const [mapDocuments, setMapDocuments] = useState<MapDocument[]>([])
  const [buildingFilter, setBuildingFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [buildingStatusMessage, setBuildingStatusMessage] = useState('')
  const [activeChainTextureStates, setActiveChainTextureStates] = useState<Record<string, BuildingTextureAssetState>>({})
  const [springObjectsState, setSpringObjectsState] = useState<BuildingTextureAssetState>({
    path: null,
    url: null,
    width: null,
    height: null,
  })
  const { modIndex } = useModAssetIndex(directoryInfo)

  const deferredFilter = useDeferredValue(buildingFilter.trim().toLowerCase())
  const filteredConstructibleGroups = useMemo(
    () => constructibleGroups.filter((group) => !deferredFilter || group.searchText.includes(deferredFilter)),
    [constructibleGroups, deferredFilter],
  )
  const filteredWorldBuildings = useMemo(
    () => worldBuildings.filter((building) => !deferredFilter || building.searchText.includes(deferredFilter)),
    [deferredFilter, worldBuildings],
  )
  const buildingLookup = useMemo(() => buildModEntryLookup(buildingEntries, (building) => building.key), [buildingEntries])
  const modBuildingGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group) => group.buildings,
        entryLookup: buildingLookup,
        filterText: buildingFilter,
        getSearchText: (building) => building.searchText,
        getFallbackLabel: (building) => building.displayName,
      }),
    [buildingFilter, buildingLookup, modIndex.mods],
  )
  const activeBuildingModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group) => group.buildings,
        key: activeBuildingId,
      }),
    [activeBuildingId, modIndex.mods],
  )
  const activeBuilding =
    buildingEntries.find((building) => building.key === activeBuildingId) ??
    filteredConstructibleGroups[0]?.rootEntry ??
    filteredWorldBuildings[0] ??
    constructibleGroups[0]?.rootEntry ??
    worldBuildings[0] ??
    null
  const activeUpgradeChain = useMemo(
    () =>
      activeBuilding?.sourceKind === 'constructible'
        ? activeBuilding.upgradeChainKeys
            .map((key) => buildingEntries.find((building) => building.key === key) ?? null)
            .filter((entry): entry is BuildingWorkspaceEntry => entry != null)
        : activeBuilding
          ? [activeBuilding]
          : [],
    [activeBuilding, buildingEntries],
  )
  const activeTextureState =
    activeBuilding?.sourceKind === 'constructible' ? (activeChainTextureStates[activeBuilding.key] ?? null) : null
  const mapDocumentsByAssetName = useMemo(
    () => new Map(mapDocuments.map((document) => [getMapAssetName(document), document] as const)),
    [mapDocuments],
  )
  const activeIndoorMapDocument =
    activeBuilding?.indoorMapAssetName ? (mapDocumentsByAssetName.get(activeBuilding.indoorMapAssetName) ?? null) : null
  const activeExteriorMapDocument =
    activeBuilding?.sourceKind === 'world' && activeBuilding.exteriorMapAssetName
      ? (mapDocumentsByAssetName.get(activeBuilding.exteriorMapAssetName) ?? null)
      : null
  const activeIndoorMapPath = activeIndoorMapDocument?.relativePath ?? activeBuilding?.indoorMapPathLabel ?? null
  const activeIndoorMapMessage = activeIndoorMapDocument
    ? activeIndoorMapDocument.relativePath
    : activeBuilding?.sourceKind === 'world'
      ? (activeBuilding?.indoorMapPathLabel ?? copy.noIndoorMap)
      : (activeBuilding?.indoorMapAssetName ? activeBuilding.indoorMapPathLabel : activeBuilding?.nonInstancedIndoorLocation ?? copy.noIndoorMap)
  const activeExteriorMapPath = activeExteriorMapDocument?.relativePath ?? activeBuilding?.exteriorMapPathLabel ?? null
  const activeExteriorMapMessage = activeExteriorMapDocument?.relativePath ?? activeBuilding?.exteriorMapPathLabel ?? copy.noExteriorMap
  const activeExteriorFocusPoint = useMemo<ViewportWorldPoint | null>(() => {
    if (!activeExteriorMapDocument || !activeBuilding?.exteriorEntryTile) {
      return null
    }

    return {
      worldX: (activeBuilding.exteriorEntryTile.X + 0.5) * activeExteriorMapDocument.tileWidth,
      worldY: (activeBuilding.exteriorEntryTile.Y + 0.5) * activeExteriorMapDocument.tileHeight,
    }
  }, [activeBuilding?.exteriorEntryTile, activeExteriorMapDocument])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      const cancel = deferToTimeout(() => {
        setBuildingEntries([])
        setConstructibleGroups([])
        setWorldBuildings([])
        setMapDocuments([])
        setActiveBuildingId(null)
        setBuildingStatusMessage('')
        setActiveChainTextureStates({})
        setSpringObjectsState({
          path: null,
          url: null,
          width: null,
          height: null,
        })
      })

      return cancel
    }

    let cancelled = false

    void (async () => {
      try {
        const [buildingsAsset, objectsAsset, locationsAsset, mapAssets] = await Promise.all([
          loadTextAsset(directoryInfo.rootPath, BUILDINGS_DATA_ASSET_PATH, locale),
          loadTextAsset(directoryInfo.rootPath, OBJECT_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, LOCATIONS_DATA_ASSET_PATH, locale).catch(() => null),
          scanMaps(directoryInfo.rootPath, locale).catch(() => []),
        ])
        if (cancelled) {
          return
        }

        const localizedConstructibleEntries = await localizeBuildingEntries(
          createBuildingEntryIndex(buildingsAsset.content),
          directoryInfo.rootPath,
          locale,
        )
        const hydratedConstructibleEntries = objectsAsset
          ? hydrateBuildingMaterials(localizedConstructibleEntries, await buildObjectDisplayIndex(directoryInfo.rootPath, locale, objectsAsset.content))
          : localizedConstructibleEntries
        const loadedMapDocuments = (
          await runWithConcurrency(
            mapAssets.filter((asset) => asset.format === 'xnb'),
            8,
            async (asset) => {
              try {
                const loadedAsset = await loadMapAsset(directoryInfo.rootPath, asset.absolutePath, locale)
                if (loadedAsset.format !== 'xnb') {
                  return null
                }

                return JSON.parse(loadedAsset.content) as MapDocument
              } catch {
                return null
              }
            },
          )
        ).filter((document): document is MapDocument => document != null)
        const locationSeeds = buildLocationSeeds(locationsAsset?.content ?? null)
        const nextWorldBuildings = buildWorldBuildingEntries(loadedMapDocuments, locationSeeds)
        const nextConstructibleGroups = createConstructibleBuildingGroups(hydratedConstructibleEntries)
        const nextEntries = [...hydratedConstructibleEntries, ...nextWorldBuildings]
        if (cancelled) {
          return
        }

        setMapDocuments(loadedMapDocuments)
        setWorldBuildings(nextWorldBuildings)
        setConstructibleGroups(nextConstructibleGroups)
        setBuildingEntries(nextEntries)
        setActiveBuildingId((current) =>
          current && nextEntries.some((entry) => entry.key === current)
            ? current
            : nextConstructibleGroups[0]?.rootEntry.key ?? nextWorldBuildings[0]?.key ?? null,
        )
        setBuildingStatusMessage(
          nextConstructibleGroups.length || nextWorldBuildings.length
            ? copy.indexedStatusTemplate.replace('{count}', String(nextConstructibleGroups.length + nextWorldBuildings.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setBuildingEntries([])
          setConstructibleGroups([])
          setWorldBuildings([])
          setMapDocuments([])
          setActiveBuildingId(null)
          setBuildingStatusMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      const cancel = deferToTimeout(() => {
        setSpringObjectsState({
          path: null,
          url: null,
          width: null,
          height: null,
        })
      })

      return cancel
    }

    let cancelled = false
    const springObjectsPath = buildGameContentPath(directoryInfo.rootPath, SPRING_OBJECTS_ASSET_PATH.replace(/^Content\\/iu, '').replace(/\.xnb$/iu, ''))

    void loadImageState(springObjectsPath, locale)
      .then((state) => {
        if (!cancelled) {
          setSpringObjectsState(state)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpringObjectsState({
            path: springObjectsPath,
            url: null,
            width: null,
            height: null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath || activeUpgradeChain.length === 0 || activeBuilding?.sourceKind !== 'constructible') {
      const cancel = deferToTimeout(() => {
        setActiveChainTextureStates({})
      })

      return cancel
    }

    let cancelled = false

    void (async () => {
      const entries = await Promise.all(
        activeUpgradeChain.map(async (entry) => {
          const texturePath = getBuildingTexturePath(directoryInfo.rootPath, entry)
          try {
            return [entry.key, await loadImageState(texturePath, locale)] as const
          } catch {
            return [
              entry.key,
              {
                path: texturePath,
                url: null,
                width: null,
                height: null,
              } satisfies BuildingTextureAssetState,
            ] as const
          }
        }),
      )

      if (!cancelled) {
        setActiveChainTextureStates(Object.fromEntries(entries))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeBuilding?.sourceKind, activeUpgradeChain, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    const nextBuilding =
      modBuildingGroups
        .flatMap((group) => group.items)
        .find((item) => item.value.key === activeBuildingId)?.value ??
      modBuildingGroups[0]?.items[0]?.value ??
      null

    if (nextBuilding && nextBuilding.key !== activeBuildingId) {
      const cancel = deferToTimeout(() => {
        setActiveBuildingId(nextBuilding.key)
      })
      return cancel
    }
  }, [activeBuildingId, browserSourceMode, modBuildingGroups])

  function handleSelectBuilding(buildingKey: string) {
    setActiveBuildingId(buildingKey)
  }

  return {
    buildingEntries,
    constructibleGroups,
    filteredConstructibleGroups,
    worldBuildings,
    filteredWorldBuildings,
    browserSourceMode,
    setBrowserSourceMode,
    modBuildingGroups,
    activeBuildingModSources,
    buildingFilter,
    setBuildingFilter,
    activeBuildingId: activeBuilding?.key ?? null,
    activeBuilding,
    activeUpgradeChain,
    buildingStatusMessage,
    activeTextureState,
    activeChainTextureStates,
    activeIndoorMapDocument,
    activeIndoorMapPath,
    activeIndoorMapMessage,
    activeExteriorMapDocument,
    activeExteriorMapPath,
    activeExteriorMapMessage,
    activeExteriorFocusPoint,
    springObjectsState,
    handleSelectBuilding,
  }
}
