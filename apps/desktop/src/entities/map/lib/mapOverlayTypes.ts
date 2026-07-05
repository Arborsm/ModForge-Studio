export type OverlayTextureAsset = {
  url: string | null
  loading?: boolean
}

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
