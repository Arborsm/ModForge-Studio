/**
 * @file Map overlay type definitions: texture assets, world overlay sprites,
 * and building data entries used by the world-state preview overlay.
 */

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
