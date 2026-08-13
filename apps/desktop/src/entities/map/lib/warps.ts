import type { MapDocument } from './types'
import { asMapPropertyString, WARP_PROPERTY_KEY } from './properties'
import { collectCellActions, parseCellWarpAction } from './cellActions'

export type WarpEntry = {
  sourceX: number
  sourceY: number
  targetMap: string
  targetX: number
  targetY: number
}

/** One fixed-size group of the raw `Warp`/`NPCWarp` property value. */
export type WarpGroup = { fromX: number; fromY: number; toMap: string; toX: number; toY: number }
/** One fixed-size group of the raw `Doors` property value. */
export type DoorGroup = { x: number; y: number; sheet: number; tileIndex: number }

export function parseWarpProperty(rawValue: string) {
  const tokens = rawValue.trim().split(/\s+/u).filter(Boolean)
  const entries: WarpEntry[] = []

  for (let index = 0; index + 4 < tokens.length; index += 5) {
    const sourceX = Number.parseInt(tokens[index] ?? '', 10)
    const sourceY = Number.parseInt(tokens[index + 1] ?? '', 10)
    const targetMap = tokens[index + 2] ?? ''
    const targetX = Number.parseInt(tokens[index + 3] ?? '', 10)
    const targetY = Number.parseInt(tokens[index + 4] ?? '', 10)

    if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY) || !Number.isFinite(targetX) || !Number.isFinite(targetY) || !targetMap) {
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

export function parseWarpEntries(mapDocument: MapDocument) {
  const entries: WarpEntry[] = []

  for (const propertyName of ['Warp', 'NPCWarp']) {
    const rawValue = asMapPropertyString(mapDocument.properties[propertyName]).trim()
    if (!rawValue) {
      continue
    }

    entries.push(...parseWarpProperty(rawValue))
  }

  return entries
}

export function isExteriorWarp(mapDocument: MapDocument, entry: WarpEntry) {
  return entry.sourceX < 0 || entry.sourceY < 0 || entry.sourceX >= mapDocument.width || entry.sourceY >= mapDocument.height
}

// ── Raw fixed-size group parsing (warp and door properties) ────────────────

type GroupParseResult<T> = { groups: T[]; leftover: string[] }

/**
 * Splits a space-separated raw property value into fixed-size groups. Groups
 * whose tokens fail `parse` are preserved verbatim in `leftover` so the raw
 * value round-trips losslessly when re-serialized.
 */
export function parseRawGroups<T>(raw: string, size: number, parse: (tokens: readonly string[]) => T | null): GroupParseResult<T> {
  const tokens = raw.trim().split(/\s+/u).filter(Boolean)
  const groups: T[] = []
  const leftover: string[] = []
  const groupCount = Math.floor(tokens.length / size)
  for (let index = 0; index < groupCount; index += 1) {
    const slice = tokens.slice(index * size, index * size + size)
    const parsed = parse(slice)
    if (parsed != null) groups.push(parsed)
    else leftover.push(...slice)
  }
  leftover.push(...tokens.slice(groupCount * size))
  return { groups, leftover }
}

/** Joins pre-rendered group strings and preserved leftover tokens back into one raw value. */
export function serializeRawGroups(groups: readonly string[], leftover: readonly string[]) {
  return [...groups, ...leftover].join(' ')
}

/** Parses the `Warp` property: groups of `fromX fromY toMap toX toY`. */
export function parseWarpGroups(raw: string) {
  return parseRawGroups(raw, 5, (tokens) => {
    const fromX = Number.parseInt(tokens[0] ?? '', 10)
    const fromY = Number.parseInt(tokens[1] ?? '', 10)
    const toMap = (tokens[2] ?? '').trim()
    const toX = Number.parseInt(tokens[3] ?? '', 10)
    const toY = Number.parseInt(tokens[4] ?? '', 10)
    if (!Number.isFinite(fromX) || !Number.isFinite(fromY) || !toMap || !Number.isFinite(toX) || !Number.isFinite(toY)) {
      return null
    }
    return { fromX, fromY, toMap, toX, toY }
  })
}

export function serializeWarpGroups(groups: readonly WarpGroup[], leftover: readonly string[]) {
  return serializeRawGroups(
    groups.map((group) => [group.fromX, group.fromY, group.toMap, group.toX, group.toY].join(' ')),
    leftover,
  )
}

/** Parses the `Doors` property: groups of `x y sheet tileIndex`. */
export function parseDoorGroups(raw: string) {
  return parseRawGroups(raw, 4, (tokens) => {
    const x = Number.parseInt(tokens[0] ?? '', 10)
    const y = Number.parseInt(tokens[1] ?? '', 10)
    const sheet = Number.parseInt(tokens[2] ?? '', 10)
    const tileIndex = Number.parseInt(tokens[3] ?? '', 10)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(sheet) || !Number.isFinite(tileIndex)) {
      return null
    }
    return { x, y, sheet, tileIndex }
  })
}

export function serializeDoorGroups(groups: readonly DoorGroup[], leftover: readonly string[]) {
  return serializeRawGroups(
    groups.map((group) => [group.x, group.y, group.sheet, group.tileIndex].join(' ')),
    leftover,
  )
}

// ── Merged warp reading (property + per-cell carriers) ─────────────────────

/**
 * One warp entry shown by the warp card, merged from the three carriers the
 * game can read a warp from: the `Warp` map property (rows of
 * `fromX fromY toMap toX toY`), Back-layer per-cell `TouchAction` strings
 * (`Warp <map> <x> <y>`) and Buildings-layer per-cell `Action` strings
 * (`Warp <x> <y> <map>`). Per-cell entries keep their carrier `source` so the
 * card can badge them and write edits back to the same place.
 */
export type WarpSourceEntry =
  | { kind: 'property'; group: WarpGroup; index: number }
  | { kind: 'touch' | 'action'; x: number; y: number; toMap: string; toX: number; toY: number; source: 'cellProperties' | 'tileDataObject' }

/** Merges every warp the map defines into one ordered list for the warp card. */
export function collectWarpEntries(mapDocument: MapDocument): WarpSourceEntry[] {
  const entries: WarpSourceEntry[] = []
  const propertyGroups = parseWarpGroups(asMapPropertyString(mapDocument.properties[WARP_PROPERTY_KEY]))
  propertyGroups.groups.forEach((group, index) => {
    entries.push({ kind: 'property', group, index })
  })
  for (const action of collectCellActions(mapDocument, 'Back', ['TouchAction'])) {
    const parsed = parseCellWarpAction(action.value)
    if (parsed) {
      entries.push({
        kind: 'touch',
        x: action.x,
        y: action.y,
        toMap: parsed.toMap,
        toX: parsed.toX,
        toY: parsed.toY,
        source: action.source,
      })
    }
  }
  for (const action of collectCellActions(mapDocument, 'Buildings', ['Action'])) {
    const parsed = parseCellWarpAction(action.value)
    if (parsed) {
      entries.push({
        kind: 'action',
        x: action.x,
        y: action.y,
        toMap: parsed.toMap,
        toX: parsed.toX,
        toY: parsed.toY,
        source: action.source,
      })
    }
  }
  return entries
}
