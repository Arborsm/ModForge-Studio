export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
export const FLIPPED_VERTICALLY_FLAG = 0x40000000
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000
export const ROTATED_HEXAGONAL_120_FLAG = 0x10000000

export const TILE_GID_FLAG_MASK =
  (FLIPPED_HORIZONTALLY_FLAG |
    FLIPPED_VERTICALLY_FLAG |
    FLIPPED_DIAGONALLY_FLAG |
    ROTATED_HEXAGONAL_120_FLAG) >>> 0

export const TILE_ID_MASK = (~TILE_GID_FLAG_MASK) >>> 0

export function stripTileGidFlags(rawGid: number) {
  return (rawGid >>> 0) & TILE_ID_MASK
}

export function extractTileFlags(rawGid: number) {
  return (rawGid >>> 0) & TILE_GID_FLAG_MASK
}
