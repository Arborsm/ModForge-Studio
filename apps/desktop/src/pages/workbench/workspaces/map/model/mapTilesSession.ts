import type { MapDocument, MapLayer, MapPropertyValue, MapTileset } from '@entities/map'
import { extractTileFlags, stripTileGidFlags, TILE_ID_MASK } from '@entities/map'
import { compactMapTileEdits, type MapTileEditDraft } from './mapPatchReducer'

export type ApplyMapTilesResult = {
  document: MapDocument
  /** Edits that could not be applied (unknown layer/tileset, invalid index, out-of-bounds cell). */
  skippedCount: number
}

/**
 * Resolves a bare gid against tilesets ordered by descending firstGid and
 * returns the owning tileset name plus the in-tileset index. Orphan gids that
 * fall inside no tileset's range resolve to null.
 */
function resolveTileReference(tilesets: readonly MapTileset[], bareGid: number): { tilesetName: string; tileId: number } | null {
  for (const tileset of tilesets) {
    if (bareGid >= tileset.firstGid) {
      const tileId = bareGid - tileset.firstGid
      return tileId < tileset.tileCount ? { tilesetName: tileset.name, tileId } : null
    }
  }
  return null
}

function cloneSessionLayer(layer: MapLayer): MapLayer {
  return {
    ...layer,
    properties: { ...layer.properties },
    gids: new Uint32Array(layer.gids),
    cellProperties: layer.cellProperties
      ? Object.fromEntries(Object.entries(layer.cellProperties).map(([index, properties]) => [index, { ...properties }]))
      : undefined,
    cellAnimations: layer.cellAnimations
      ? Object.fromEntries(Object.entries(layer.cellAnimations).map(([index, frames]) => [index, [...frames]]))
      : undefined,
  }
}

/** Writes draft property values at one cell using the layer cell-property storage (empty clears). */
function writeCellProperties(layer: MapLayer, cell: number, properties: Record<string, unknown>) {
  const next: Record<number, Record<string, MapPropertyValue>> = { ...layer.cellProperties }
  if (Object.keys(properties).length === 0) delete next[cell]
  else next[cell] = { ...properties } as Record<string, MapPropertyValue>
  layer.cellProperties = next
}

/**
 * Applies MapTiles session edits onto a deep copy of the base document. The
 * returned document shares no mutable layer state with `base` (fresh gids and
 * cell-property containers), so the map editor can keep mutating it freely.
 * Edits are compacted first (last edit per cell wins, matching CP patch order);
 * unresolvable edits are counted in `skippedCount` and left unapplied.
 */
export function applyMapTilesToDocument(base: MapDocument, edits: readonly MapTileEditDraft[]): ApplyMapTilesResult {
  const document: MapDocument = {
    ...base,
    properties: { ...base.properties },
    tilesets: base.tilesets.map((tileset) => ({ ...tileset })),
    layers: base.layers.map(cloneSessionLayer),
  }
  let skippedCount = 0
  const touchedLayers = new Set<number>()

  for (const edit of compactMapTileEdits(edits)) {
    if (typeof edit.x !== 'number' || typeof edit.y !== 'number') {
      skippedCount += 1
      continue
    }
    const layerIndex = document.layers.findIndex((layer) => layer.name === edit.layer)
    if (layerIndex < 0) {
      skippedCount += 1
      continue
    }
    const layer = document.layers[layerIndex]!
    if (edit.x < 0 || edit.y < 0 || edit.x >= layer.width || edit.y >= layer.height) {
      skippedCount += 1
      continue
    }
    const cell = edit.y * layer.width + edit.x
    if (edit.remove) {
      layer.gids[cell] = 0
      touchedLayers.add(layerIndex)
    }
    if (edit.setIndex !== undefined && edit.setIndex !== '') {
      const tileIndex = typeof edit.setIndex === 'number' ? edit.setIndex : Number(edit.setIndex)
      const tileset = edit.setTilesheet ? document.tilesets.find((entry) => entry.name === edit.setTilesheet) : undefined
      if (!Number.isInteger(tileIndex) || tileIndex < 0 || !tileset || tileIndex >= tileset.tileCount) {
        skippedCount += 1
      } else {
        layer.gids[cell] = (tileset.firstGid + tileIndex) >>> 0
        touchedLayers.add(layerIndex)
      }
    }
    if (edit.setProperties !== undefined) {
      writeCellProperties(layer, cell, edit.setProperties)
      touchedLayers.add(layerIndex)
    }
  }

  for (const layerIndex of touchedLayers) {
    const layer = document.layers[layerIndex]!
    layer.nonEmptyTiles = Array.from(layer.gids).filter((gid) => (gid & TILE_ID_MASK) !== 0).length
  }

  return { document, skippedCount }
}

function propertiesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => propertiesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

/**
 * Converts the delta between `base` and the editor's `current` working copy
 * back into MapTiles edits, limited to layers present in `base`. Gids are
 * compared with flip flags masked; a bare-gid change becomes
 * setTilesheet/setIndex, a cleared tile becomes remove. Current-only flip bits
 * are normalized away as their bare tile. Cell-property changes become
 * setProperties (an empty object clears). The result is compaction-stable.
 */
export function diffMapDocumentToMapTiles(base: MapDocument, current: MapDocument): MapTileEditDraft[] {
  const edits: MapTileEditDraft[] = []
  const sortedTilesets = [...base.tilesets].sort((left, right) => right.firstGid - left.firstGid)
  for (const baseLayer of base.layers) {
    const currentLayer = current.layers.find((layer) => layer.name === baseLayer.name)
    if (!currentLayer) continue
    const baseProperties = baseLayer.cellProperties ?? {}
    const currentProperties = currentLayer.cellProperties ?? {}
    const cellCount = baseLayer.width * baseLayer.height
    for (let cell = 0; cell < cellCount; cell += 1) {
      const x = cell % baseLayer.width
      const y = Math.floor(cell / baseLayer.width)
      const baseGid = baseLayer.gids[cell] ?? 0
      const currentGid = currentLayer.gids[cell] ?? 0
      const baseBare = stripTileGidFlags(baseGid)
      const currentBare = stripTileGidFlags(currentGid)
      const currentHasFlags = extractTileFlags(currentGid) !== 0 && extractTileFlags(baseGid) === 0
      const tileChanged = baseBare !== currentBare || currentHasFlags
      const propertyChanged = !propertiesEqual(baseProperties[cell], currentProperties[cell])
      if (!tileChanged && !propertyChanged) continue
      const edit: MapTileEditDraft = { layer: baseLayer.name, x, y }
      if (tileChanged) {
        if (currentBare > 0) {
          const reference = resolveTileReference(sortedTilesets, currentBare)
          if (reference) {
            edit.setTilesheet = reference.tilesetName
            edit.setIndex = reference.tileId
          }
        } else if (baseBare > 0) {
          edit.remove = true
        }
      }
      if (propertyChanged) edit.setProperties = { ...currentProperties[cell] }
      if (edit.setTilesheet !== undefined || edit.setIndex !== undefined || edit.remove !== undefined || edit.setProperties !== undefined) {
        edits.push(edit)
      }
    }
  }
  return compactMapTileEdits(edits)
}

function isTilesCard(card: unknown, cardId: string): boolean {
  if (typeof card !== 'object' || card === null || Array.isArray(card)) return false
  const record = card as Record<string, unknown>
  return record['id'] === cardId && record['type'] === 'tiles'
}

/**
 * Reads the mapTiles of the tiles change card matching `cardId`, or an empty
 * array when the editor state has no such card. Mirrors `withCardMapTiles` so a
 * patch-tiles session can seed its working document from the same card it will
 * write back to on completion.
 */
export function readCardMapTiles(editorState: unknown, cardId: string): MapTileEditDraft[] {
  if (typeof editorState !== 'object' || editorState === null || Array.isArray(editorState)) return []
  const changes = (editorState as Record<string, unknown>)['changes']
  if (!Array.isArray(changes)) return []
  const card = changes.find((candidate) => isTilesCard(candidate, cardId))
  if (!card) return []
  const mapTiles = (card as Record<string, unknown>)['mapTiles']
  return Array.isArray(mapTiles) ? (mapTiles as MapTileEditDraft[]) : []
}

/**
 * Whether the patch-tiles entry point can run for a target: the game directory
 * must be configured and the target must not depend on runtime tokens, which
 * cannot be resolved outside a simulated game context.
 */
export function canEditPatchTiles(target: string, gameRootPath: string | null): boolean {
  return Boolean(gameRootPath) && !target.includes('{{')
}

/**
 * Replaces the mapTiles of the tiles change card matching `cardId` in
 * `editorState.changes`. Returns the input unchanged when no such card exists.
 * Other cards and top-level fields keep their identity; the matched card and
 * the changes array are shallow-copied.
 */
export function withCardMapTiles(editorState: unknown, cardId: string, edits: readonly MapTileEditDraft[]): unknown {
  if (typeof editorState !== 'object' || editorState === null || Array.isArray(editorState)) return editorState
  const state = editorState as Record<string, unknown>
  const changes = state['changes']
  if (!Array.isArray(changes)) return editorState
  const cardIndex = changes.findIndex((card) => isTilesCard(card, cardId))
  if (cardIndex < 0) return editorState
  const nextChanges = changes.map((card, index) => {
    if (index !== cardIndex) return card
    return { ...(card as Record<string, unknown>), mapTiles: [...edits] }
  })
  return { ...state, changes: nextChanges }
}
