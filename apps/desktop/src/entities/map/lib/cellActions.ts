import type { MapDocument, MapPropertyValue } from './mapTypes'
import { writeCellPropertyObjects } from './cellOverlayObjects'
import { asMapPropertyString } from './properties'
import { stripTileGidFlags } from './tileFlags'

/**
 * One per-cell action property read from a layer: the cell it lives on, the
 * property key (`TouchAction`, `Action`, ...) and the raw string value, plus
 * which of the two per-cell carriers held it.
 */
export type CellActionEntry = {
  x: number
  y: number
  key: string
  value: string
  source: 'cellProperties' | 'tileDataObject'
}

/**
 * Collects the named property keys from every cell of one layer, merging the
 * two per-cell carriers the game reads (xTile semantics): first
 * `layer.cellProperties` (the tbin backing store), then `TileData` objects on
 * the object group named exactly like the layer — the TMX carrier, where each
 * object's properties apply to every cell its pixel rect covers. When both
 * carriers define the same key on the same cell, the `cellProperties` entry
 * wins. TileData rules only land on cells that actually have a tile placed
 * (empty tiles never carry instance properties in the game); the
 * cellProperties store is read as-is. Entries are returned in reading order:
 * cellProperties first, then TileData objects in document order.
 */
export function collectCellActions(document: MapDocument, layerName: string, keys: readonly string[]): CellActionEntry[] {
  const layer = document.layers.find((candidate) => candidate.name === layerName)
  if (!layer) {
    return []
  }

  const entries: CellActionEntry[] = []
  const seen = new Set<string>()

  function push(key: string, value: string, x: number, y: number, source: CellActionEntry['source']) {
    const dedupeKey = `${x},${y}\u0000${key}`
    if (seen.has(dedupeKey)) {
      return
    }
    seen.add(dedupeKey)
    entries.push({ x, y, key, value, source })
  }

  // 1. tbin per-cell instance properties.
  for (const [indexKey, properties] of Object.entries(layer.cellProperties ?? {})) {
    const index = Number(indexKey)
    if (!Number.isInteger(index) || index < 0 || index >= layer.gids.length) {
      continue
    }
    const x = index % layer.width
    const y = Math.floor(index / layer.width)
    for (const key of keys) {
      const value = asMapPropertyString(properties[key]).trim()
      if (value) {
        push(key, value, x, y, 'cellProperties')
      }
    }
  }

  // 2. TileData objects on the group named exactly like the layer (TMX).
  const tileWidth = document.tileWidth
  const tileHeight = document.tileHeight
  for (const group of document.objectGroups) {
    if (group.name !== layerName) {
      continue
    }
    for (const object of group.objects) {
      if (object.name !== 'TileData') {
        continue
      }
      const startX = Math.floor(object.x / tileWidth)
      const startY = Math.floor(object.y / tileHeight)
      const endX = Math.floor((object.x + object.width - 1) / tileWidth)
      const endY = Math.floor((object.y + object.height - 1) / tileHeight)
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= layer.height) {
          continue
        }
        for (let x = startX; x <= endX; x += 1) {
          if (x < 0 || x >= layer.width) {
            continue
          }
          if (stripTileGidFlags(layer.gids[y * layer.width + x]) === 0) {
            continue
          }
          for (const key of keys) {
            const value = asMapPropertyString(object.properties[key]).trim()
            if (value) {
              push(key, value, x, y, 'tileDataObject')
            }
          }
        }
      }
    }
  }

  return entries
}

/**
 * Parses a per-cell `Warp` action string into its destination. Both argument
 * orders are recognized, matching the game: the Back-layer TouchAction form
 * `Warp <map> <x> <y>` (GameLocation.cs:3470-3482) and the Buildings-layer
 * Action form `Warp <x> <y> <map>` (GameLocation.cs:2061-2078). The two are
 * told apart by whether the first token parses as a number. Returns null for
 * non-`Warp` actions or malformed values.
 */
export function parseCellWarpAction(rawValue: string) {
  const tokens = rawValue.trim().split(/\s+/u)
  if (tokens[0] !== 'Warp' || tokens.length < 4) {
    return null
  }

  const firstIsNumber = Number.isFinite(Number(tokens[1]))
  const secondIsNumber = Number.isFinite(Number(tokens[2]))
  if (firstIsNumber && secondIsNumber) {
    const x = Number.parseInt(tokens[1] ?? '', 10)
    const y = Number.parseInt(tokens[2] ?? '', 10)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !tokens[3]) {
      return null
    }
    return { toMap: tokens[3], toX: x, toY: y }
  }

  if (!firstIsNumber) {
    const x = Number.parseInt(tokens[2] ?? '', 10)
    const y = Number.parseInt(tokens[3] ?? '', 10)
    if (!tokens[1] || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null
    }
    return { toMap: tokens[1], toX: x, toY: y }
  }

  return null
}

/** Serializes the Back-layer TouchAction warp form: `Warp <map> <x> <y>`. */
export function formatTouchActionWarp(toMap: string, x: number, y: number) {
  return `Warp ${toMap} ${x} ${y}`
}

/** Serializes the Buildings-layer Action warp form: `Warp <x> <y> <map>`. */
export function formatActionWarp(x: number, y: number, toMap: string) {
  return `Warp ${x} ${y} ${toMap}`
}

/**
 * Writes (or clears, with an empty value) one per-cell action property. TMX
 * maps go through the `TileData` object carrier via
 * {@link writeCellPropertyObjects}, which reuses the rule object covering the
 * cell and removes it once its properties become empty; other formats merge
 * into the tbin `cellProperties` backing store, preserving the cell's other
 * keys. Returns the input document unchanged when the write changes nothing
 * (unknown layer, out-of-bounds point, or the key already holds the value).
 * Typed property envelopes are preserved when present.
 */
export function writeCellAction(
  document: MapDocument,
  layerName: string,
  point: { x: number; y: number },
  key: string,
  value: string,
): MapDocument {
  const layer = document.layers.find((candidate) => candidate.name === layerName)
  if (!layer || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    return document
  }

  if (document.format === 'tmx') {
    const painted = writeCellPropertyObjects(document, layer.id, [point], (current) => {
      const next = { ...current }
      const trimmed = value.trim()
      if (trimmed) {
        next[key] = replacePropertyValue(current, key, trimmed)
      } else {
        delete next[key]
      }
      return next
    })
    return painted.document
  }

  if (point.x < 0 || point.y < 0 || point.x >= layer.width || point.y >= layer.height) {
    return document
  }

  const index = point.y * layer.width + point.x
  const current = layer.cellProperties?.[index] ?? {}
  const trimmed = value.trim()
  const beforeRaw = asMapPropertyString(current[key]).trim()
  if (trimmed ? beforeRaw === trimmed : beforeRaw === '') {
    return document
  }

  const nextProperties = { ...current }
  if (trimmed) {
    nextProperties[key] = replacePropertyValue(current, key, trimmed)
  } else {
    delete nextProperties[key]
  }
  const nextCellProperties = { ...layer.cellProperties }
  if (Object.keys(nextProperties).length === 0) {
    delete nextCellProperties[index]
  } else {
    nextCellProperties[index] = nextProperties
  }
  return {
    ...document,
    layers: document.layers.map((candidate) =>
      candidate.id === layer.id ? { ...candidate, cellProperties: nextCellProperties } : candidate,
    ),
  }
}

/** Writes a raw string into a property, preserving a typed envelope when one exists. */
function replacePropertyValue(current: Record<string, MapPropertyValue>, key: string, trimmed: string): MapPropertyValue {
  const existing = current[key]
  if (typeof existing === 'object' && existing !== null && 'value' in existing) {
    const typed = existing as { value: MapPropertyValue; tmxType: string; propertyType?: string }
    return typed.propertyType != null
      ? { value: trimmed, tmxType: typed.tmxType, propertyType: typed.propertyType }
      : { value: trimmed, tmxType: typed.tmxType }
  }
  return trimmed
}
