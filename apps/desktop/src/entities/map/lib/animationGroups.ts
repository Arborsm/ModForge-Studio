import type { MapTileset, MapTilesetAnimationFrame } from './mapTypes'

/** A multi-tile animation group. The owner tile is the top-left tile of the
 * region. All tiles in the region share the same frame count and duration,
 * so they play in sync — visually appearing as one large animated block. */
export type AnimationGroup = {
  /** Owner tile id (top-left of the region). */
  ownerTileId: number
  /** Region width in tiles. */
  width: number
  /** Region height in tiles. */
  height: number
  /** Frame count (same for every tile in the region). */
  frameCount: number
  /** Duration per frame in ms (same for every tile/frame in the group). */
  duration: number
  /** For each frame, the tileId of the top-left tile of that frame's region. */
  frameOrigins: number[]
}

/** A rectangular tile region on the sheet. */
export type TileRegion = {
  startCol: number
  startRow: number
  width: number
  height: number
}

function tileToColRow(tileId: number, columns: number): { col: number; row: number } {
  return { col: tileId % columns, row: Math.floor(tileId / columns) }
}

function colRowToTile(col: number, row: number, columns: number): number {
  return row * columns + col
}

/** Scans a tileset's `animations` map and reconstructs multi-tile animation
 * groups. Tiles are grouped when they form a contiguous rectangle and share
 * the same frame count, duration, and frame origin pattern (offset by their
 * position within the group). Isolated single-tile animations become 1x1
 * groups. */
export function extractAnimationGroups(tileset: MapTileset): AnimationGroup[] {
  const { columns, tileCount, animations } = tileset
  const animatedIds = Object.keys(animations)
    .map(Number)
    .filter((id) => animations[id]?.length > 0)
  if (animatedIds.length === 0) return []

  const visited = new Set<number>()
  const groups: AnimationGroup[] = []

  for (const seedId of animatedIds.sort((a, b) => a - b)) {
    if (visited.has(seedId)) continue
    const seedFrames = animations[seedId]!
    const frameCount = seedFrames.length
    const duration = seedFrames[0].duration
    const seedPos = tileToColRow(seedId, columns)

    // Try to grow the group rightward and downward from the seed.
    // Find max width: how many consecutive tiles to the right have matching
    // animations (same frame count, same duration, frame origins offset by dx).
    let width = 1
    for (let dx = 1; seedPos.col + dx < columns; dx++) {
      const neighborId = colRowToTile(seedPos.col + dx, seedPos.row, columns)
      const neighborFrames = animations[neighborId]
      if (!neighborFrames || neighborFrames.length !== frameCount) break
      if (neighborFrames[0].duration !== duration) break
      // Check frame origins match the pattern (offset by dx).
      let matches = true
      for (let f = 0; f < frameCount; f++) {
        if (neighborFrames[f].tileId !== seedFrames[f].tileId + dx) {
          matches = false
          break
        }
      }
      if (!matches) break
      width++
    }

    // Find max height: how many consecutive rows below have matching groups.
    let height = 1
    rowLoop: for (let dy = 1; ; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const neighborId = colRowToTile(seedPos.col + dx, seedPos.row + dy, columns)
        if (neighborId >= tileCount) break rowLoop
        const neighborFrames = animations[neighborId]
        if (!neighborFrames || neighborFrames.length !== frameCount) break rowLoop
        if (neighborFrames[0].duration !== duration) break rowLoop
        let matches = true
        for (let f = 0; f < frameCount; f++) {
          const expected = seedFrames[f].tileId + dx + dy * columns
          if (neighborFrames[f].tileId !== expected) {
            matches = false
            break
          }
        }
        if (!matches) break rowLoop
      }
      height++
    }

    // Mark all tiles in the group as visited.
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        visited.add(colRowToTile(seedPos.col + dx, seedPos.row + dy, columns))
      }
    }

    // Frame origins = the top-left tileId of each frame's region.
    const frameOrigins = seedFrames.map((f) => f.tileId)

    groups.push({
      ownerTileId: seedId,
      width,
      height,
      frameCount,
      duration,
      frameOrigins,
    })
  }

  return groups
}

/** Expands an animation group into per-tile animation frame arrays, suitable
 * for storing in `tileset.animations`. Returns a map of tileId → frames. */
export function expandAnimationGroup(group: AnimationGroup, columns: number): Record<number, MapTilesetAnimationFrame[]> {
  const { ownerTileId, width, height, duration, frameOrigins } = group
  const ownerPos = tileToColRow(ownerTileId, columns)
  const result: Record<number, MapTilesetAnimationFrame[]> = {}

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const ownerCol = ownerPos.col + dx
      const ownerRow = ownerPos.row + dy
      const tileId = colRowToTile(ownerCol, ownerRow, columns)
      const frames: MapTilesetAnimationFrame[] = frameOrigins.map((origin) => {
        const originPos = tileToColRow(origin, columns)
        const frameTileId = colRowToTile(originPos.col + dx, originPos.row + dy, columns)
        return { tileId: frameTileId, duration }
      })
      result[tileId] = frames
    }
  }

  return result
}

/** Removes all per-tile animations that belong to a group from the
 * `tileset.animations` map. Returns a new animations map. */
export function removeAnimationGroupAnimations(
  animations: Record<number, MapTilesetAnimationFrame[]>,
  group: AnimationGroup,
  columns: number,
): Record<number, MapTilesetAnimationFrame[]> {
  const next = { ...animations }
  const ownerPos = tileToColRow(group.ownerTileId, columns)
  for (let dy = 0; dy < group.height; dy++) {
    for (let dx = 0; dx < group.width; dx++) {
      const tileId = colRowToTile(ownerPos.col + dx, ownerPos.row + dy, columns)
      delete next[tileId]
    }
  }
  return next
}
