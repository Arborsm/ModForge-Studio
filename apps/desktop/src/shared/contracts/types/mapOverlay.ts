/** Texture asset reference for a map overlay (nullable URL for missing textures). */
export type OverlayTextureAsset = {
  url: string | null
}

/** One sprite placed on the map world overlay — source rect, pixel position, dimensions, and z-index. */
export type MapWorldOverlaySprite = {
  id: string
  textureName: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  pixelX: number
  pixelY: number
  width: number
  height: number
  zIndex: number
}
