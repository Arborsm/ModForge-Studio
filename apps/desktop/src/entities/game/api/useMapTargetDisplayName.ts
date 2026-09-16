/**
 * @file Localized display names for vanilla map targets.
 *
 * A `Maps/<名>` target can carry a human-readable name: the same-named
 * location in `Data/Locations` has a `DisplayName`, usually a `[LocalizedText
 * Strings/Locations:key]` reference resolved against the locale's string
 * table. Non-location maps (festival, event, and mod maps) have no record and
 * resolve to null so callers fall back to the raw target name. The record →
 * reference → table chain is pure and unit-tested; the hook only loads the
 * two assets once per (root, locale).
 */

import { useEffect, useState } from 'react'
import { TaskCancelledError, useKeyedResourceTask } from '@shared/lib/task-runtime'
import type { LocaleCode } from '@locales/api'
import { loadOptionalTextAsset } from './gameAssets'
import { loadStringTable, tryParseStringAssetReference } from './localizedText'

const LOCATIONS_ASSET_PATH = 'Content\\Data\\Locations.xnb'
const LOCATIONS_STRING_TABLE_PATH = 'Content\\Strings\\Locations.xnb'

/** One `Data/Locations` entry; only `DisplayName` matters for display names. */
export type MapLocationEntry = { DisplayName?: string | null } | null | undefined

export type MapLocationRecord = Record<string, MapLocationEntry>

/**
 * Extracts the vanilla location name from a `Maps/<名>` target. The prefix
 * check is case- and slash-insensitive like the family classifier; token
 * expressions, nested paths, and non-Maps targets are not location names.
 */
export function mapTargetLocationName(target: string): string | null {
  const normalized = target.trim().replaceAll('\\', '/')
  if (!normalized.toLowerCase().startsWith('maps/')) {
    return null
  }
  const name = normalized.slice('Maps/'.length)
  if (name === '' || name.includes('/') || name.includes('{')) {
    return null
  }
  return name
}

/** Parses the Locations data asset body into a name → entry record. */
export function parseMapLocationRecord(content: string): MapLocationRecord {
  const parsed = JSON.parse(content) as Record<string, unknown>
  const record: MapLocationRecord = {}
  for (const [name, entry] of Object.entries(parsed)) {
    record[name] = entry as MapLocationEntry
  }
  return record
}

/**
 * Resolves a target's display name from the Locations record and string
 * table. Plain `DisplayName` values pass through; `[LocalizedText …]`
 * references resolve against the table. Returns null when the map has no
 * location record or no readable name.
 */
export function resolveMapTargetDisplayName(
  target: string,
  locations: MapLocationRecord,
  stringTable: Record<string, string>,
): string | null {
  const locationName = mapTargetLocationName(target)
  if (locationName === null) {
    return null
  }
  const lowered = locationName.toLowerCase()
  const entry = Object.entries(locations).find(([name]) => name.toLowerCase() === lowered)?.[1]
  const rawDisplayName = entry?.DisplayName?.trim() ?? ''
  if (rawDisplayName === '') {
    return null
  }
  if (!rawDisplayName.startsWith('[')) {
    return rawDisplayName
  }
  const reference = tryParseStringAssetReference(rawDisplayName)
  if (reference === null) {
    return null
  }
  return stringTable[reference.key]?.trim() || null
}

export type MapTargetDisplayNameData = {
  locations: MapLocationRecord
  stringTable: Record<string, string>
}

const EMPTY_DATA: MapTargetDisplayNameData = { locations: {}, stringTable: {} }

const locationsCache = new Map<string, Promise<MapLocationRecord>>()

/** Loads the Locations data asset, cached per (root, locale); failures resolve to an empty record. */
function loadMapLocationRecord(rootPath: string, locale: LocaleCode): Promise<MapLocationRecord> {
  const cacheKey = `${rootPath}::${locale}`
  const cached = locationsCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const pending = loadOptionalTextAsset(rootPath, LOCATIONS_ASSET_PATH, locale, 'mapTargetDisplayName.optionalLocations')
    .then((asset) => (asset ? parseMapLocationRecord(asset.content) : {}))
    .catch(() => ({}) as MapLocationRecord)
  locationsCache.set(cacheKey, pending)
  return pending
}

/**
 * Loads the vanilla location display-name data once per (root, locale) and
 * exposes a synchronous lookup. `displayNameFor('Maps/Farm')` returns the
 * localized name, or null when the map has no location record — callers fall
 * back to the raw target name in that case.
 */
export function useMapTargetDisplayName(gameRootPath: string | null, locale: LocaleCode): (target: string) => string | null {
  const [data, setData] = useState<MapTargetDisplayNameData>(EMPTY_DATA)
  const runLoadTask = useKeyedResourceTask(`${gameRootPath ?? 'none'}::${locale}`)

  useEffect(() => {
    void runLoadTask(async (scope) => {
      if (gameRootPath === null) {
        setData(EMPTY_DATA)
        return
      }
      const [locations, table] = await Promise.all([
        loadMapLocationRecord(gameRootPath, locale),
        loadStringTable(gameRootPath, LOCATIONS_STRING_TABLE_PATH, locale),
      ])
      if (scope.isCurrent()) {
        setData({ locations, stringTable: table.table })
      }
    }).catch((error) => {
      if (error instanceof TaskCancelledError) {
        return
      }
      throw error
    })
  }, [gameRootPath, locale, runLoadTask])

  return (target: string) => resolveMapTargetDisplayName(target, data.locations, data.stringTable)
}
