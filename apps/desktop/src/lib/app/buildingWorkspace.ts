import { buildGameContentPath } from './contentPaths'

export { buildGameContentPath } from './contentPaths'

export const BUILDINGS_DATA_ASSET_PATH = 'Content\\Data\\Buildings.xnb'

type BuildingPoint = {
  X: number
  Y: number
}

type BuildingRectangle = BuildingPoint & {
  Width: number
  Height: number
}

type RawPointLike = BuildingPoint | string | null | undefined
type RawRectangleLike = BuildingRectangle | string | null | undefined

type BuildingMaterialDataEntry = {
  ItemId?: string | null
  Amount?: number | null
}

type BuildingSkinDataEntry = {
  Id?: string | null
  Name?: string | null
  NameForGeneralType?: string | null
  Description?: string | null
  Texture?: string | null
  Condition?: string | null
  BuildDays?: number | null
  BuildCost?: number | null
  BuildMaterials?: BuildingMaterialDataEntry[] | null
  ShowAsSeparateConstructionEntry?: boolean | null
  Metadata?: Record<string, string> | null
}

type BuildingPlacementTileDataEntry = {
  TileArea?: RawRectangleLike
  OnlyNeedsToBePassable?: boolean | null
}

type BuildingDataEntry = {
  Name?: string | null
  NameForGeneralType?: string | null
  Description?: string | null
  Texture?: string | null
  Skins?: BuildingSkinDataEntry[] | null
  DrawShadow?: boolean | null
  UpgradeSignTile?: RawPointLike
  UpgradeSignHeight?: number | null
  Size?: RawPointLike
  FadeWhenBehind?: boolean | null
  SourceRect?: RawRectangleLike
  SeasonOffset?: RawPointLike
  DrawOffset?: RawPointLike
  SortTileOffset?: number | null
  CollisionMap?: string | null
  AdditionalPlacementTiles?: BuildingPlacementTileDataEntry[] | null
  BuildingType?: string | null
  Builder?: string | null
  BuildCondition?: string | null
  BuildDays?: number | null
  BuildCost?: number | null
  BuildMaterials?: BuildingMaterialDataEntry[] | null
  BuildingToUpgrade?: string | null
  MagicalConstruction?: boolean | null
  BuildMenuDrawOffset?: RawPointLike
  HumanDoor?: RawPointLike
  AnimalDoor?: RawRectangleLike
  AnimalDoorOpenDuration?: number | null
  AnimalDoorOpenSound?: string | null
  AnimalDoorCloseDuration?: number | null
  AnimalDoorCloseSound?: string | null
  NonInstancedIndoorLocation?: string | null
  IndoorMap?: string | null
  IndoorMapType?: string | null
  MaxOccupants?: number | null
  ValidOccupantTypes?: string[] | null
  AllowAnimalPregnancy?: boolean | null
  IndoorItemMoves?: unknown[] | null
  IndoorItems?: unknown[] | null
  AddMailOnBuild?: string[] | null
  Metadata?: Record<string, string> | null
  ModData?: Record<string, string> | null
  HayCapacity?: number | null
  Chests?: unknown[] | null
  DefaultAction?: string | null
  AdditionalTilePropertyRadius?: number | null
  AllowsFlooringUnderneath?: boolean | null
  ActionTiles?: unknown[] | null
  TileProperties?: unknown[] | null
  ItemConversions?: unknown[] | null
  DrawLayers?: unknown[] | null
  CustomFields?: Record<string, string> | null
}

export type BuildingMaterialEntry = {
  itemId: string
  displayName: string
  amount: number
  objectIndex: number | null
}

export type BuildingSkinEntry = {
  id: string
  displayName: string
  generalTypeDisplayName: string | null
  description: string | null
  textureAssetName: string | null
  texturePathLabel: string
  condition: string | null
  buildDays: number | null
  buildCost: number | null
  buildMaterials: BuildingMaterialEntry[]
  showAsSeparateConstructionEntry: boolean
  metadata: Record<string, string>
}

export type BuildingPlacementTileEntry = {
  tileArea: BuildingRectangle | null
  onlyNeedsToBePassable: boolean
}

export type BuildingSourceKind = 'constructible' | 'world'

export type WorldBuildingEntrance = {
  sourceMapName: string
  sourceMapAssetName: string
  sourceMapPathLabel: string
  sourceTile: BuildingPoint
  targetTile: BuildingPoint
  trigger: string
}

export type BuildingWorkspaceEntry = {
  sourceKind: BuildingSourceKind
  key: string
  groupKey: string
  groupDisplayName: string
  rawDisplayName: string
  displayName: string
  rawGeneralTypeDisplayName: string | null
  generalTypeDisplayName: string | null
  rawDescription: string | null
  description: string | null
  internalName: string
  searchText: string
  textureAssetName: string | null
  texturePathLabel: string
  sourceRect: BuildingRectangle | null
  drawShadow: boolean
  upgradeSignTile: BuildingPoint | null
  upgradeSignHeight: number
  size: BuildingPoint | null
  fadeWhenBehind: boolean
  seasonOffset: BuildingPoint | null
  drawOffset: BuildingPoint | null
  sortTileOffset: number
  collisionMap: string | null
  additionalPlacementTiles: BuildingPlacementTileEntry[]
  buildingClassName: string | null
  builder: string | null
  buildCondition: string | null
  buildDays: number
  buildCost: number
  buildMaterials: BuildingMaterialEntry[]
  upgradeFromKey: string | null
  upgradeToKeys: string[]
  magicalConstruction: boolean
  buildMenuDrawOffset: BuildingPoint | null
  humanDoor: BuildingPoint | null
  animalDoor: BuildingRectangle | null
  animalDoorOpenDuration: number
  animalDoorOpenSound: string | null
  animalDoorCloseDuration: number
  animalDoorCloseSound: string | null
  nonInstancedIndoorLocation: string | null
  indoorMapAssetName: string | null
  indoorMapPathLabel: string
  indoorMapType: string | null
  exteriorMapAssetName: string | null
  exteriorMapPathLabel: string | null
  exteriorMapName: string | null
  exteriorEntryTile: BuildingPoint | null
  worldEntrances: WorldBuildingEntrance[]
  maxOccupants: number
  validOccupantTypes: string[]
  allowAnimalPregnancy: boolean
  indoorItemMoves: unknown[]
  indoorItems: unknown[]
  addMailOnBuild: string[]
  metadata: Record<string, string>
  modData: Record<string, string>
  hayCapacity: number
  chests: unknown[]
  defaultAction: string | null
  additionalTilePropertyRadius: number
  allowsFlooringUnderneath: boolean
  actionTiles: unknown[]
  tileProperties: unknown[]
  itemConversions: unknown[]
  drawLayers: unknown[]
  customFields: Record<string, string>
  skins: BuildingSkinEntry[]
  upgradeChainKeys: string[]
  stageIndex: number
  stageCount: number
  rootKey: string
  leafKey: string
}

export type ConstructibleBuildingGroup = {
  key: string
  displayName: string
  searchText: string
  rootEntry: BuildingWorkspaceEntry
  entries: BuildingWorkspaceEntry[]
  stageCount: number
  hasIndoorMap: boolean
  builderLabel: string | null
}

export type BuildingTextureAssetState = {
  path: string | null
  url: string | null
  width: number | null
  height: number | null
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
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function parsePointLike(value: RawPointLike) {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(value)
    if (!match) {
      return null
    }

    return {
      X: Number.parseFloat(match[1] ?? '0'),
      Y: Number.parseFloat(match[2] ?? '0'),
    } satisfies BuildingPoint
  }

  return {
    X: parseNumber(value.X),
    Y: parseNumber(value.Y),
  } satisfies BuildingPoint
}

function parseRectangleLike(value: RawRectangleLike) {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(
      value,
    )
    if (!match) {
      return null
    }

    return {
      X: Number.parseFloat(match[1] ?? '0'),
      Y: Number.parseFloat(match[2] ?? '0'),
      Width: Number.parseFloat(match[3] ?? '0'),
      Height: Number.parseFloat(match[4] ?? '0'),
    } satisfies BuildingRectangle
  }

  return {
    X: parseNumber(value.X),
    Y: parseNumber(value.Y),
    Width: parseNumber(value.Width),
    Height: parseNumber(value.Height),
  } satisfies BuildingRectangle
}

function isZeroRectangle(value: BuildingRectangle | null) {
  return !value || (value.X === 0 && value.Y === 0 && value.Width === 0 && value.Height === 0)
}

function normalizeAssetName(assetName: string | null | undefined) {
  const trimmed = trimString(assetName)?.replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^Content\//iu, '')
}

function normalizeIndoorMapAssetName(assetName: string | null | undefined) {
  const trimmed = trimString(assetName)?.replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  if (/^Maps\//iu.test(trimmed)) {
    return trimmed
  }

  return `Maps/${trimmed}`
}

function buildTexturePathLabel(assetName: string | null) {
  return assetName ? assetName.replaceAll('/', '\\') : 'Buildings\\Unknown'
}

function buildIndoorMapPathLabel(assetName: string | null, nonInstancedIndoorLocation: string | null) {
  if (assetName) {
    return assetName.replaceAll('/', '\\')
  }

  return nonInstancedIndoorLocation ?? 'Maps\\Unknown'
}

export function buildMapPathLabel(assetName: string | null) {
  return assetName ? assetName.replaceAll('/', '\\') : null
}

function parseQualifiedObjectId(itemId: string | null | undefined) {
  const trimmed = trimString(itemId)
  if (!trimmed) {
    return null
  }

  const match = /^\(O\)(.+)$/iu.exec(trimmed)
  if (match) {
    return match[1]?.trim() || null
  }

  return trimmed
}

function createMaterialEntries(materials: BuildingMaterialDataEntry[] | null | undefined) {
  return (materials ?? [])
    .map((material) => {
      const itemId = trimString(material.ItemId) ?? 'Unknown'
      return {
        itemId,
        displayName: parseQualifiedObjectId(itemId) ?? itemId,
        amount: Math.max(0, parseNumber(material.Amount, 0)),
        objectIndex: null,
      } satisfies BuildingMaterialEntry
    })
    .filter((material) => material.amount > 0 || material.itemId !== 'Unknown')
}

function createSkinEntries(key: string, skins: BuildingSkinDataEntry[] | null | undefined) {
  return (skins ?? []).map((skin, index) => {
    const textureAssetName = normalizeAssetName(skin.Texture)
    const displayName = trimString(skin.Name) ?? trimString(skin.Id) ?? `${key} Skin ${index + 1}`
    return {
      id: trimString(skin.Id) ?? `skin-${index + 1}`,
      displayName,
      generalTypeDisplayName: trimString(skin.NameForGeneralType),
      description: trimString(skin.Description),
      textureAssetName,
      texturePathLabel: buildTexturePathLabel(textureAssetName),
      condition: trimString(skin.Condition),
      buildDays: skin.BuildDays ?? null,
      buildCost: skin.BuildCost ?? null,
      buildMaterials: createMaterialEntries(skin.BuildMaterials),
      showAsSeparateConstructionEntry: Boolean(skin.ShowAsSeparateConstructionEntry),
      metadata: skin.Metadata ?? {},
    } satisfies BuildingSkinEntry
  })
}

function createPlacementTileEntries(entries: BuildingPlacementTileDataEntry[] | null | undefined) {
  return (entries ?? []).map((entry) => ({
    tileArea: parseRectangleLike(entry.TileArea),
    onlyNeedsToBePassable: Boolean(entry.OnlyNeedsToBePassable),
  }))
}

function getRootKey(entryKey: string, entryByKey: Map<string, BuildingWorkspaceEntry>) {
  const seen = new Set<string>()
  let currentKey = entryKey

  while (!seen.has(currentKey)) {
    seen.add(currentKey)
    const current = entryByKey.get(currentKey)
    if (!current?.upgradeFromKey || !entryByKey.has(current.upgradeFromKey)) {
      return currentKey
    }

    currentKey = current.upgradeFromKey
  }

  return entryKey
}

function buildUpgradeChainKeys(rootKey: string, childKeysByParent: Map<string, string[]>) {
  const ordered: string[] = []
  const stack = [rootKey]

  while (stack.length > 0) {
    const current = stack.shift()
    if (!current) {
      continue
    }

    ordered.push(current)
    const children = childKeysByParent.get(current) ?? []
    stack.unshift(...children)
  }

  return ordered
}

export function createBuildingEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, BuildingDataEntry>

  const baseEntries = Object.entries(parsed).map(([key, entry]) => {
    const rawDisplayName = trimString(entry.Name) ?? key
    const rawGeneralTypeDisplayName = trimString(entry.NameForGeneralType)
    const rawDescription = trimString(entry.Description)
    const textureAssetName = normalizeAssetName(entry.Texture)
    const nonInstancedIndoorLocation = trimString(entry.NonInstancedIndoorLocation)
    const indoorMapAssetName = normalizeIndoorMapAssetName(entry.IndoorMap)
    const upgradeFromKey = trimString(entry.BuildingToUpgrade)

    return {
      sourceKind: 'constructible',
      key,
      groupKey: key,
      groupDisplayName: rawDisplayName,
      rawDisplayName,
      displayName: rawDisplayName,
      rawGeneralTypeDisplayName,
      generalTypeDisplayName: rawGeneralTypeDisplayName,
      rawDescription,
      description: rawDescription,
      internalName: key,
      searchText: [
        key,
        rawDisplayName,
        rawGeneralTypeDisplayName,
        rawDescription,
        textureAssetName,
        indoorMapAssetName,
        nonInstancedIndoorLocation,
        entry.Builder,
        entry.BuildingType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      textureAssetName,
      texturePathLabel: buildTexturePathLabel(textureAssetName),
      sourceRect: isZeroRectangle(parseRectangleLike(entry.SourceRect)) ? null : parseRectangleLike(entry.SourceRect),
      drawShadow: entry.DrawShadow ?? true,
      upgradeSignTile: parsePointLike(entry.UpgradeSignTile),
      upgradeSignHeight: parseNumber(entry.UpgradeSignHeight, 0),
      size: parsePointLike(entry.Size),
      fadeWhenBehind: entry.FadeWhenBehind ?? true,
      seasonOffset: parsePointLike(entry.SeasonOffset),
      drawOffset: parsePointLike(entry.DrawOffset),
      sortTileOffset: parseNumber(entry.SortTileOffset, 0),
      collisionMap: trimString(entry.CollisionMap),
      additionalPlacementTiles: createPlacementTileEntries(entry.AdditionalPlacementTiles),
      buildingClassName: trimString(entry.BuildingType),
      builder: trimString(entry.Builder),
      buildCondition: trimString(entry.BuildCondition),
      buildDays: Math.max(0, parseNumber(entry.BuildDays, 0)),
      buildCost: Math.max(0, parseNumber(entry.BuildCost, 0)),
      buildMaterials: createMaterialEntries(entry.BuildMaterials),
      upgradeFromKey,
      upgradeToKeys: [],
      magicalConstruction: Boolean(entry.MagicalConstruction),
      buildMenuDrawOffset: parsePointLike(entry.BuildMenuDrawOffset),
      humanDoor: parsePointLike(entry.HumanDoor),
      animalDoor: parseRectangleLike(entry.AnimalDoor),
      animalDoorOpenDuration: parseNumber(entry.AnimalDoorOpenDuration, 0),
      animalDoorOpenSound: trimString(entry.AnimalDoorOpenSound),
      animalDoorCloseDuration: parseNumber(entry.AnimalDoorCloseDuration, 0),
      animalDoorCloseSound: trimString(entry.AnimalDoorCloseSound),
      nonInstancedIndoorLocation,
      indoorMapAssetName,
      indoorMapPathLabel: buildIndoorMapPathLabel(indoorMapAssetName, nonInstancedIndoorLocation),
      indoorMapType: trimString(entry.IndoorMapType),
      exteriorMapAssetName: null,
      exteriorMapPathLabel: null,
      exteriorMapName: null,
      exteriorEntryTile: null,
      worldEntrances: [],
      maxOccupants: parseNumber(entry.MaxOccupants, 0),
      validOccupantTypes: (entry.ValidOccupantTypes ?? []).filter((value): value is string => Boolean(value?.trim())),
      allowAnimalPregnancy: Boolean(entry.AllowAnimalPregnancy),
      indoorItemMoves: entry.IndoorItemMoves ?? [],
      indoorItems: entry.IndoorItems ?? [],
      addMailOnBuild: (entry.AddMailOnBuild ?? []).filter((value): value is string => Boolean(value?.trim())),
      metadata: entry.Metadata ?? {},
      modData: entry.ModData ?? {},
      hayCapacity: parseNumber(entry.HayCapacity, 0),
      chests: entry.Chests ?? [],
      defaultAction: trimString(entry.DefaultAction),
      additionalTilePropertyRadius: parseNumber(entry.AdditionalTilePropertyRadius, 0),
      allowsFlooringUnderneath: Boolean(entry.AllowsFlooringUnderneath),
      actionTiles: entry.ActionTiles ?? [],
      tileProperties: entry.TileProperties ?? [],
      itemConversions: entry.ItemConversions ?? [],
      drawLayers: entry.DrawLayers ?? [],
      customFields: entry.CustomFields ?? {},
      skins: createSkinEntries(key, entry.Skins),
      upgradeChainKeys: [key],
      stageIndex: 0,
      stageCount: 1,
      rootKey: key,
      leafKey: key,
    } satisfies BuildingWorkspaceEntry
  })

  const entryByKey = new Map(baseEntries.map((entry) => [entry.key, entry] as const))
  const childKeysByParent = new Map<string, string[]>()

  for (const entry of baseEntries) {
    if (!entry.upgradeFromKey) {
      continue
    }

    const children = childKeysByParent.get(entry.upgradeFromKey) ?? []
    children.push(entry.key)
    childKeysByParent.set(entry.upgradeFromKey, children)
  }

  for (const children of childKeysByParent.values()) {
    children.sort((left, right) => left.localeCompare(right))
  }

  return baseEntries
    .map((entry) => {
      const rootKey = getRootKey(entry.key, entryByKey)
      const upgradeChainKeys = buildUpgradeChainKeys(rootKey, childKeysByParent)
      const stageIndex = Math.max(0, upgradeChainKeys.indexOf(entry.key))
      const leafKey = upgradeChainKeys[upgradeChainKeys.length - 1] ?? entry.key

      return {
        ...entry,
        groupKey: rootKey,
        groupDisplayName: entryByKey.get(rootKey)?.displayName ?? entry.displayName,
        upgradeToKeys: childKeysByParent.get(entry.key) ?? [],
        upgradeChainKeys,
        stageIndex,
        stageCount: upgradeChainKeys.length,
        rootKey,
        leafKey,
      } satisfies BuildingWorkspaceEntry
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function createConstructibleBuildingGroups(entries: BuildingWorkspaceEntry[]) {
  const rootEntries = entries.filter((entry) => entry.sourceKind === 'constructible' && entry.rootKey === entry.key)

  return rootEntries
    .map((rootEntry) => {
      const groupEntries = rootEntry.upgradeChainKeys
        .map((key) => entries.find((entry) => entry.key === key && entry.sourceKind === 'constructible') ?? null)
        .filter((entry): entry is BuildingWorkspaceEntry => entry != null)
      const displayName =
        rootEntry.generalTypeDisplayName ??
        rootEntry.displayName
      const builderLabel =
        groupEntries.map((entry) => entry.builder).find((value): value is string => Boolean(value)) ?? null

      return {
        key: rootEntry.key,
        displayName,
        searchText: [
          displayName,
          ...groupEntries.flatMap((entry) => [
            entry.searchText,
            entry.displayName,
            entry.internalName,
            entry.builder,
            entry.indoorMapAssetName,
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        rootEntry,
        entries: groupEntries,
        stageCount: groupEntries.length,
        hasIndoorMap: groupEntries.some((entry) => Boolean(entry.indoorMapAssetName || entry.nonInstancedIndoorLocation)),
        builderLabel,
      } satisfies ConstructibleBuildingGroup
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function getBuildingTexturePath(rootPath: string | null, entry: BuildingWorkspaceEntry | null) {
  if (!rootPath || !entry) {
    return null
  }

  return buildGameContentPath(rootPath, entry.textureAssetName)
}
