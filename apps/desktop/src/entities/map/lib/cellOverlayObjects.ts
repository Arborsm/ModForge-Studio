import type { MapDocument, MapObject, MapPropertyValue } from './mapTypes'
import { applyCellOverlayRule, cellOverlayRule, type CellOverlayRule } from './cellProperties'
import { isLightMarkerObject } from './mapObjectHelpers'
import { stripTileGidFlags } from './tileFlags'
import { findTilesetForGid } from './tilesets'

export type CellPropertyWriteStats = { created: number; reused: number; removed: number; skippedEmpty: number }

/**
 * Finds the first rule object in a layer's TileData group whose pixel rect
 * covers the given cell. Rule objects are `TileData`-named rectangles that are
 * not editor light markers; the game maps each object's properties onto every
 * cell its rect covers. Uses the same rect→cell mapping as
 * `deriveCellOverlayView`, so paints land exactly on the cells the game reads.
 */
function cellRuleObjectIndex(objects: readonly MapObject[], cellX: number, cellY: number, tileWidth: number, tileHeight: number): number {
  return objects.findIndex((object) => {
    if (object.name !== 'TileData' || isLightMarkerObject(object)) return false
    const startX = Math.floor(object.x / tileWidth)
    const startY = Math.floor(object.y / tileHeight)
    const endX = Math.floor((object.x + object.width - 1) / tileWidth)
    const endY = Math.floor((object.y + object.height - 1) / tileHeight)
    return cellX >= startX && cellX <= endX && cellY >= startY && cellY <= endY
  })
}

/**
 * Writes one property merge per cell of a layer as `TileData` objects on the
 * object group named exactly like the layer — the TMX carrier for per-cell
 * instance properties (xTile semantics). Immutable: returns a new document
 * reference only when something actually changed, plus per-cell stats.
 *
 * Per cell:
 * - out-of-bounds or non-integer points are skipped;
 * - empty tiles (gid 0 after stripping flags) are skipped — xTile does not
 *   attach instance properties to cells without a placed tile;
 * - the existing rule object covering the cell is reused (or removed when the
 *   painted properties become empty), otherwise a new 16×16 `TileData`
 *   rectangle is created;
 * - when `apply` returns its input reference unchanged, no write happens.
 */
export function writeCellPropertyObjects(
  document: MapDocument,
  layerId: number,
  points: readonly { x: number; y: number }[],
  apply: (current: Record<string, MapPropertyValue>) => Record<string, MapPropertyValue>,
): { document: MapDocument; stats: CellPropertyWriteStats } {
  const emptyStats: CellPropertyWriteStats = { created: 0, reused: 0, removed: 0, skippedEmpty: 0 }
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer) return { document, stats: emptyStats }

  const stats: CellPropertyWriteStats = { ...emptyStats }
  let nextLayerId = document.nextLayerId ?? 1
  let nextObjectId = document.nextObjectId ?? 1
  let groups = document.objectGroups
  let group = groups.find((candidate) => candidate.name === layer.name)
  let changed = false
  let objects = group?.objects ?? []
  const tileWidth = document.tileWidth
  const tileHeight = document.tileHeight

  for (const point of points) {
    if (
      !Number.isInteger(point.x) ||
      !Number.isInteger(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= layer.width ||
      point.y >= layer.height
    ) {
      continue
    }
    if (stripTileGidFlags(layer.gids[point.y * layer.width + point.x] ?? 0) === 0) {
      stats.skippedEmpty += 1
      continue
    }

    const objectIndex = cellRuleObjectIndex(objects, point.x, point.y, tileWidth, tileHeight)
    const current = objectIndex >= 0 ? objects[objectIndex]!.properties : {}
    const painted = apply(current)

    if (objectIndex >= 0) {
      if (Object.keys(painted).length === 0) {
        objects = objects.filter((_, index) => index !== objectIndex)
        stats.removed += 1
        changed = true
      } else if (painted !== current) {
        objects = objects.map((object, index) => (index === objectIndex ? { ...object, properties: painted } : object))
        stats.reused += 1
        changed = true
      } else {
        stats.reused += 1
      }
    } else if (Object.keys(painted).length > 0) {
      if (!group) {
        // Create the layer-named TileData group lazily, only when a rule object
        // actually needs to be written, so no-op strokes stay no-ops.
        const groupId = Math.max(
          nextLayerId,
          ...document.layers.map((candidate) => candidate.id + 1),
          ...groups.map((candidate) => candidate.id + 1),
        )
        nextLayerId = groupId + 1
        group = {
          id: groupId,
          name: layer.name,
          kind: 'object',
          visible: true,
          opacity: 1,
          drawOrder: 'topdown',
          properties: {},
          objects: [],
        }
        groups = [...groups, group]
        changed = true
      }
      const objectId = Math.max(
        nextObjectId,
        ...groups.flatMap((candidate) => candidate.objects.map((object) => object.id + 1)),
        ...objects.map((object) => object.id + 1),
      )
      nextObjectId = objectId + 1
      objects = [
        ...objects,
        {
          id: objectId,
          name: 'TileData',
          type: '',
          x: point.x * tileWidth,
          y: point.y * tileHeight,
          width: tileWidth,
          height: tileHeight,
          rotation: 0,
          visible: true,
          shape: 'rectangle',
          properties: painted,
        },
      ]
      stats.created += 1
      changed = true
    }
  }

  if (!changed) return { document, stats }

  const nextGroups =
    objects !== (group?.objects ?? []) ? groups.map((candidate) => (candidate === group ? { ...candidate, objects } : candidate)) : groups
  return {
    document: {
      ...document,
      nextLayerId: nextLayerId !== (document.nextLayerId ?? 1) ? nextLayerId : document.nextLayerId,
      nextObjectId: nextObjectId !== (document.nextObjectId ?? 1) ? nextObjectId : document.nextObjectId,
      objectGroups: nextGroups,
    },
    stats,
  }
}

/**
 * Paints one grid-rule onto cells of a layer through `writeCellPropertyObjects`
 * (one stroke = one call), returning how many cells a `walkable` erase had to
 * skip because their rule comes from the tileset definition level. Erasing
 * `walkable` over a cell that has no instance rule object but whose placed gid
 * resolves a rule from the tileset `tileProperties` is impossible — definition
 * rules are read by the game as-is and cannot be cleared per cell — so those
 * cells are left untouched and counted. Non-`walkable` rules never skip:
 * painting an instance rule over a definition-level one is the legal way to
 * override it.
 */
export function paintCellOverlayObjects(
  document: MapDocument,
  layerId: number,
  points: readonly { x: number; y: number }[],
  rule: CellOverlayRule,
): { document: MapDocument; skippedTilesetDerived: number } {
  if (rule !== 'walkable') {
    const painted = writeCellPropertyObjects(document, layerId, points, (current) => applyCellOverlayRule(current, rule))
    return { document: painted.document, skippedTilesetDerived: 0 }
  }

  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer) return { document, skippedTilesetDerived: 0 }
  const group = document.objectGroups.find((candidate) => candidate.name === layer.name)
  const paintable: { x: number; y: number }[] = []
  let skippedTilesetDerived = 0
  for (const point of points) {
    if (
      !Number.isInteger(point.x) ||
      !Number.isInteger(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= layer.width ||
      point.y >= layer.height
    ) {
      continue
    }
    const hasInstanceRuleObject =
      group != null && cellRuleObjectIndex(group.objects, point.x, point.y, document.tileWidth, document.tileHeight) >= 0
    if (!hasInstanceRuleObject) {
      const gid = stripTileGidFlags(layer.gids[point.y * layer.width + point.x] ?? 0)
      const tileset = findTilesetForGid(document.tilesets, gid)
      const tilesetRule = tileset ? cellOverlayRule(tileset.tileProperties[gid - tileset.firstGid] ?? {}) : null
      if (tilesetRule) {
        skippedTilesetDerived += 1
        continue
      }
    }
    paintable.push(point)
  }
  const painted = writeCellPropertyObjects(document, layerId, paintable, (current) => applyCellOverlayRule(current, rule))
  return { document: painted.document, skippedTilesetDerived }
}
