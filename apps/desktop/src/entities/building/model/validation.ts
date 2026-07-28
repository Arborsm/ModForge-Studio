/**
 * Building validation, expressed as the workbench-wide `AssetIssue` shape.
 *
 * Layered on top of the generic schema rules (required fields, duplicate entry
 * keys, the per-field `validate` callbacks in `./buildingSchema`): the rules
 * here need context a single field cannot see — the item ids the project can
 * actually reference, the other buildings an upgrade chain walks through, the
 * footprint a door tile has to stay inside, and the maps the project ships.
 */

import { isPlainObject, validateAssetEntries, type AssetIssue } from '@entities/asset-schema'
import { normalizeIndoorMapAssetName, parseBuildingPoint, parseBuildingRectangle, parseQualifiedObjectId } from './buildingIndex'
import { BUILDING_DATA_SCHEMA } from './buildingSchema'

/**
 * Reference data the cross-entry rules check against.
 *
 * Every list is optional and an empty list disables its rule rather than
 * reporting everything as missing, because the game directory may not be
 * connected while the author is editing.
 */
export type BuildingValidationContext = {
  /** Item ids `BuildMaterials` may reference, unqualified or `(O)`-qualified. */
  knownItemIds?: readonly string[]
  /** Building keys outside this patch that an upgrade chain may point at. */
  knownBuildingKeys?: readonly string[]
  /** Map asset names (`Maps/Barn`) the project or the game provides. */
  knownMapAssets?: readonly string[]
}

function lowerSet(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.toLowerCase()))
}

function objectAt(raw: unknown): Record<string, unknown> {
  return isPlainObject(raw) ? raw : {}
}

function listAt(raw: unknown, key: string): Record<string, unknown>[] {
  const value = objectAt(raw)[key]
  return Array.isArray(value) ? value.map((item) => objectAt(item)) : []
}

function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Checks one `BuildMaterials` list. `pathPrefix` lets the same rule run for the
 * building's own materials and for each skin's override list.
 */
function validateMaterials(
  materials: readonly Record<string, unknown>[],
  pathPrefix: readonly (string | number)[],
  knownItems: Set<string>,
): AssetIssue[] {
  const issues: AssetIssue[] = []

  materials.forEach((material, index) => {
    const path = [...pathPrefix, index, 'ItemId']
    const itemId = trimmedText(material['ItemId'])
    if (itemId === '') {
      // `required` on the item schema already reports a blank row; an explicit
      // whitespace-only id would otherwise slip through as "present".
      return
    }

    const bare = parseQualifiedObjectId(itemId)
    if (knownItems.size === 0 || bare === null) {
      return
    }

    if (!knownItems.has(itemId.toLowerCase()) && !knownItems.has(bare.toLowerCase())) {
      issues.push({
        severity: 'warning',
        code: 'buildingMaterialItemUnknown',
        messageKey: 'building.materialItemUnknown',
        path,
        params: { itemId },
      })
    }
  })

  return issues
}

/** Rejects duplicate skin ids: the game keys skins by id and the later one wins. */
function validateSkins(entryKey: string, raw: unknown, knownItems: Set<string>): AssetIssue[] {
  const issues: AssetIssue[] = []
  const seen = new Map<string, number>()

  listAt(raw, 'Skins').forEach((skin, index) => {
    const id = trimmedText(skin['Id'])
    if (id !== '') {
      const lower = id.toLowerCase()
      const previous = seen.get(lower)
      if (previous === undefined) {
        seen.set(lower, index)
      } else {
        issues.push({
          severity: 'error',
          code: 'buildingSkinIdDuplicate',
          messageKey: 'building.skinIdDuplicate',
          path: [entryKey, 'Skins', index, 'Id'],
          params: { id, index: previous + 1 },
        })
      }
    }

    const materials = Array.isArray(skin['BuildMaterials']) ? skin['BuildMaterials'].map((item) => objectAt(item)) : []
    issues.push(...validateMaterials(materials, [entryKey, 'Skins', index, 'BuildMaterials'], knownItems))
  })

  return issues
}

/**
 * Walks `BuildingToUpgrade` from every entry.
 *
 * A cycle means the carpenter menu can never resolve a base stage, so the whole
 * chain disappears from the build list; the game reports nothing. Each entry on
 * a cycle gets its own issue so the rail can jump to any of them, and carries
 * the rest of the cycle as `relatedKeys`.
 */
function validateUpgradeChain(entries: Readonly<Record<string, unknown>>, knownBuildingKeys: Set<string>): AssetIssue[] {
  const issues: AssetIssue[] = []
  const parentOf = new Map<string, string>()
  const keyByLower = new Map<string, string>()

  for (const entryKey of Object.keys(entries)) {
    keyByLower.set(entryKey.toLowerCase(), entryKey)
  }
  for (const [entryKey, raw] of Object.entries(entries)) {
    const parent = trimmedText(objectAt(raw)['BuildingToUpgrade'])
    if (parent !== '') {
      parentOf.set(entryKey, parent)
    }
  }

  for (const [entryKey, parent] of parentOf) {
    const resolved = keyByLower.get(parent.toLowerCase())
    if (resolved === undefined && knownBuildingKeys.size > 0 && !knownBuildingKeys.has(parent.toLowerCase())) {
      issues.push({
        severity: 'info',
        code: 'buildingUpgradeTargetUnknown',
        messageKey: 'building.upgradeTargetUnknown',
        path: [entryKey, 'BuildingToUpgrade'],
        params: { target: parent },
      })
    }
  }

  for (const entryKey of parentOf.keys()) {
    const visited: string[] = []
    let current: string | undefined = entryKey

    while (current !== undefined) {
      if (visited.includes(current)) {
        const cycle = visited.slice(visited.indexOf(current))
        if (cycle[0] === entryKey) {
          issues.push({
            severity: 'error',
            code: 'buildingUpgradeChainCycle',
            messageKey: 'building.upgradeChainCycle',
            path: [entryKey, 'BuildingToUpgrade'],
            relatedKeys: cycle.filter((key) => key !== entryKey),
            params: { chain: [...cycle, entryKey].join(' → ') },
          })
        }
        break
      }

      visited.push(current)
      const parent = parentOf.get(current)
      current = parent === undefined ? undefined : keyByLower.get(parent.toLowerCase())
    }
  }

  return issues
}

/** Reports a tile that must sit on the building's own footprint but does not. */
function tileOutOfBounds(
  entryKey: string,
  fieldKey: string,
  tile: { X: number; Y: number } | null,
  size: { X: number; Y: number },
): AssetIssue | null {
  if (tile === null) {
    return null
  }
  if (tile.X >= 0 && tile.Y >= 0 && tile.X < size.X && tile.Y < size.Y) {
    return null
  }
  return {
    severity: 'error',
    code: 'buildingTileOutOfBounds',
    messageKey: 'building.tileOutOfBounds',
    path: [entryKey, fieldKey],
    params: { field: fieldKey, tile: `${tile.X}, ${tile.Y}`, width: size.X, height: size.Y },
  }
}

/**
 * Placement rules that depend on `Size`.
 *
 * Door tiles are addressed relative to the building's top-left corner and have
 * to land on the building itself; `AdditionalPlacementTiles` are the opposite —
 * they exist to reserve ground *outside* the footprint, so those are only
 * reported when the rectangle is empty (nothing is reserved) or fully inside
 * the footprint (already reserved by the building).
 */
function validatePlacement(entryKey: string, raw: unknown): AssetIssue[] {
  const issues: AssetIssue[] = []
  const fields = objectAt(raw)
  const size = parseBuildingPoint(fields['Size'])

  if (size !== null && size.X > 0 && size.Y > 0) {
    const humanDoor = tileOutOfBounds(entryKey, 'HumanDoor', parseBuildingPoint(fields['HumanDoor']), size)
    if (humanDoor !== null) {
      issues.push(humanDoor)
    }

    const upgradeSign = tileOutOfBounds(entryKey, 'UpgradeSignTile', parseBuildingPoint(fields['UpgradeSignTile']), size)
    if (upgradeSign !== null) {
      issues.push(upgradeSign)
    }

    const animalDoor = parseBuildingRectangle(fields['AnimalDoor'])
    const animalDoorTile = animalDoor === null ? null : { X: animalDoor.X, Y: animalDoor.Y }
    const animalDoorIssue = tileOutOfBounds(entryKey, 'AnimalDoor', animalDoorTile, size)
    if (animalDoorIssue !== null) {
      issues.push(animalDoorIssue)
    }
  }

  listAt(raw, 'AdditionalPlacementTiles').forEach((tile, index) => {
    const path = [entryKey, 'AdditionalPlacementTiles', index, 'TileArea']
    const area = parseBuildingRectangle(tile['TileArea'])
    if (area === null || area.Width <= 0 || area.Height <= 0) {
      issues.push({
        severity: 'error',
        code: 'buildingPlacementTileEmptyArea',
        messageKey: 'building.placementTileEmptyArea',
        path,
        params: { index: index + 1 },
      })
      return
    }

    if (
      size !== null &&
      size.X > 0 &&
      size.Y > 0 &&
      area.X >= 0 &&
      area.Y >= 0 &&
      area.X + area.Width <= size.X &&
      area.Y + area.Height <= size.Y
    ) {
      issues.push({
        severity: 'info',
        code: 'buildingPlacementTileRedundant',
        messageKey: 'building.placementTileRedundant',
        path,
        params: { index: index + 1 },
      })
    }
  })

  return issues
}

/** Interior rules: the map has to exist, and occupants need somewhere to live. */
function validateInterior(entryKey: string, raw: unknown, knownMaps: Set<string>): AssetIssue[] {
  const issues: AssetIssue[] = []
  const fields = objectAt(raw)
  const indoorMap = trimmedText(fields['IndoorMap'])
  const nonInstanced = trimmedText(fields['NonInstancedIndoorLocation'])
  const normalized = normalizeIndoorMapAssetName(indoorMap)

  if (normalized !== null && knownMaps.size > 0 && !knownMaps.has(normalized.toLowerCase())) {
    issues.push({
      severity: 'warning',
      code: 'buildingIndoorMapMissing',
      messageKey: 'building.indoorMapMissing',
      path: [entryKey, 'IndoorMap'],
      params: { map: normalized },
    })
  }

  const maxOccupants = fields['MaxOccupants']
  if (typeof maxOccupants === 'number' && maxOccupants > 0 && normalized === null && nonInstanced === '') {
    issues.push({
      severity: 'warning',
      code: 'buildingOccupantsWithoutInterior',
      messageKey: 'building.occupantsWithoutInterior',
      path: [entryKey, 'MaxOccupants'],
      params: { count: maxOccupants },
    })
  }

  return issues
}

/**
 * Validates every `Data/Buildings` entry: the schema rules plus the cross-entry
 * material, upgrade-chain, placement and interior rules.
 */
export function validateBuildingEntries(entries: Readonly<Record<string, unknown>>, context: BuildingValidationContext = {}): AssetIssue[] {
  const knownItems = lowerSet(context.knownItemIds)
  const knownMaps = lowerSet(context.knownMapAssets)
  const knownBuildings = lowerSet(context.knownBuildingKeys)

  const issues = validateAssetEntries(BUILDING_DATA_SCHEMA, entries)

  for (const [entryKey, raw] of Object.entries(entries)) {
    issues.push(...validateMaterials(listAt(raw, 'BuildMaterials'), [entryKey, 'BuildMaterials'], knownItems))
    issues.push(...validateSkins(entryKey, raw, knownItems))
    issues.push(...validatePlacement(entryKey, raw))
    issues.push(...validateInterior(entryKey, raw, knownMaps))
  }

  issues.push(...validateUpgradeChain(entries, knownBuildings))

  return issues
}
