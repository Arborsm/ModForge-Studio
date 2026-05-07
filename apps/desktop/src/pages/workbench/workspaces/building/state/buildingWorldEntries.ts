import type { MapDocument, MapPropertyValue } from '@shared/contracts'
import { normalizeMapName, getWorldAtlasNameAliases, getPortalTargetMapFromProperties, isExteriorWarp, parseWarpEntries, getActionTargetMap } from '@entities/map'
import { BUILDING_LOCATION_SEED_GROUP_LABELS, BUILDING_LOCATION_SEED_GROUP_ORDER, BUILDING_LOCATION_SEEDS, type BuildingLocationSeedGroup } from './buildingLocationSeeds'
import {
  type BuildingWorkspaceEntry,
  type WorldBuildingEntrance,
  buildMapPathLabel,
} from '../entities/building'

// ── Types ─────────────────────────────────────────────────────────────────

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

type WorldEntranceAggregate = {
  targetDocument: MapDocument
  entrances: WorldBuildingEntrance[]
  primaryExteriorMapName: string | null
  primaryExteriorMapAssetName: string | null
  primaryExteriorMapPathLabel: string | null
  primaryExteriorEntryTile: { X: number; Y: number } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

function trimString(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
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

function normalizeMapAssetName(value: string | null | undefined) {
  const trimmed = trimString(value)?.replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^Content\//iu, '')
}

function parsePointLike(
  value: {
    X?: number | string | null
    Y?: number | string | null
  } | null | undefined,
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

function getMapAssetName(document: MapDocument) {
  const normalizedRelativePath = document.relativePath.replaceAll('/', '\\').replace(/^Content\\/iu, '')
  return normalizedRelativePath.replace(/\.xnb$/iu, '').replaceAll('\\', '/')
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
    rawDescription: sortedEntrances.length
      ? `${sortedEntrances.length} entrances`
      : (locationType ?? indoorMapAssetName ?? exteriorMapAssetName),
    description: sortedEntrances.length
      ? `${sortedEntrances.length} entrances`
      : (locationType ?? indoorMapAssetName ?? exteriorMapAssetName),
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

// ── Location data index ───────────────────────────────────────────────────

export function buildLocationDataIndex(locationsContent: string | null) {
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

// ── Location seeds ────────────────────────────────────────────────────────

export function buildLocationSeeds(locationsContent: string | null) {
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

// ── World building entries ────────────────────────────────────────────────

export function buildWorldBuildingEntries(
  loadedMapDocuments: MapDocument[],
  locationSeeds: WorldLocationSeed[],
): BuildingWorkspaceEntry[] {
  const outdoorDocuments: MapDocument[] = []
  const indoorDocuments: MapDocument[] = []

  for (const document of loadedMapDocuments) {
    if (isTruthyProperty(document.properties.Outdoors)) {
      outdoorDocuments.push(document)
    } else {
      indoorDocuments.push(document)
    }
  }

  const documentsByAlias = new Map<string, MapDocument>()
  for (const document of loadedMapDocuments) {
    documentsByAlias.set(normalizeMapName(document.name), document)

    const aliases = getWorldAtlasNameAliases(document.name)
    for (const alias of aliases) {
      if (!documentsByAlias.has(alias)) {
        documentsByAlias.set(alias, document)
      }
    }
  }

  const aggregates = new Map<string, WorldEntranceAggregate>()

  function ensureAggregate(targetDocument: MapDocument) {
    const targetKey = normalizeMapName(targetDocument.name)
    const existing = aggregates.get(targetKey)
    if (existing) {
      return existing
    }

    const aggregate: WorldEntranceAggregate = {
      targetDocument,
      entrances: [],
      primaryExteriorMapName: null,
      primaryExteriorMapAssetName: null,
      primaryExteriorMapPathLabel: null,
      primaryExteriorEntryTile: null,
    }

    aggregates.set(targetKey, aggregate)
    return aggregate
  }

  function addWorldEntrance(
    sourceDocument: MapDocument,
    targetMapName: string,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    trigger: string,
  ) {
    const targetDocument =
      documentsByAlias.get(normalizeMapName(targetMapName)) ?? null
    if (!targetDocument) {
      return
    }

    if (isTruthyProperty(targetDocument.properties.Outdoors)) {
      return
    }

    const aggregate = ensureAggregate(targetDocument)
    const sourceMapName = sourceDocument.name
    const sourceMapAssetName = getMapAssetName(sourceDocument)
    aggregate.entrances.push({
      sourceMapName,
      sourceMapAssetName,
      sourceMapPathLabel: sourceDocument.relativePath,
      sourceTile: { X: sourceX, Y: sourceY },
      targetTile: { X: targetX, Y: targetY },
      trigger,
    } satisfies WorldBuildingEntrance)

    if (!aggregate.primaryExteriorMapName) {
      aggregate.primaryExteriorMapName = sourceMapName
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
