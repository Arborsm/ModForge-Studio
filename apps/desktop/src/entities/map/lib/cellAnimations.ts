import type { MapDocument, MapTilesetAnimationFrame } from './mapTypes'
import { findTilesetForGid } from './tilesets'
import { stripTileGidFlags } from './tileFlags'

/**
 * Sets or removes the per-cell animation of one cell of one layer. Immutable:
 * returns a new document where the target layer's `cellAnimations` entry is
 * replaced by `frames`, and a cell whose frames are empty (or a null value) is
 * deleted from the map. Out-of-bounds indices and missing layers return the
 * document unchanged, so the editor never fabricates layers.
 */
export function setCellAnimation(
  document: MapDocument,
  layerId: number,
  index: number,
  frames: readonly MapTilesetAnimationFrame[] | null,
): MapDocument {
  if (!Number.isInteger(index) || index < 0) return document
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer || index >= layer.width * layer.height) return document
  const cellAnimations = { ...layer.cellAnimations }
  if (!frames || frames.length === 0) delete cellAnimations[index]
  else cellAnimations[index] = frames.map((frame) => ({ ...frame }))
  return {
    ...document,
    layers: document.layers.map((candidate) => (candidate.id === layerId ? { ...candidate, cellAnimations } : candidate)),
  }
}

/** True when the frame list carries more than one distinct duration value. */
export function hasMixedFrameDurations(frames: readonly MapTilesetAnimationFrame[]): boolean {
  return new Set(frames.map((frame) => frame.duration)).size > 1
}

export type CellAnimationHoistPlan = { hoisted: number; dropped: number }

/**
 * Counts what a TMX save would do with every per-cell animation, mirroring the
 * Rust hoist pass exactly: each layer's animated cells are visited in sorted
 * index order, flag-stripped base gids resolve to their owning tileset's local
 * tile id, and the first cell per base id wins. `hoisted` counts cells whose
 * frame list gets promoted into the tileset definition; `dropped` counts cells
 * skipped because that base id's definition-level animation already exists
 * (either original or written by an earlier cell in the pass). Cells with an
 * empty base gid or a gid outside every tileset range are ignored entirely —
 * the Rust pass skips them without writing anything.
 */
export function planCellAnimationHoist(document: MapDocument): CellAnimationHoistPlan {
  let hoisted = 0
  let dropped = 0
  const written = new Set<string>()
  for (const layer of document.layers) {
    if (layer.kind !== 'tile' || !layer.cellAnimations) continue
    const indices = Object.keys(layer.cellAnimations)
      .map(Number)
      .sort((left, right) => left - right)
    for (const index of indices) {
      const gid = layer.gids[index] ?? 0
      const base = stripTileGidFlags(gid)
      if (base === 0) continue
      const candidate = findTilesetForGid(document.tilesets, base)
      if (!candidate || base >= candidate.firstGid + candidate.tileCount) continue
      const localId = base - candidate.firstGid
      const key = `${document.tilesets.indexOf(candidate)}:${localId}`
      if (written.has(key) || candidate.animations[localId] !== undefined) {
        dropped += 1
        continue
      }
      written.add(key)
      hoisted += 1
    }
  }
  return { hoisted, dropped }
}
