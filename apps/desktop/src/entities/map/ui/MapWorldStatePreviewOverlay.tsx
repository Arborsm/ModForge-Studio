import { memo, useMemo } from 'react'
import type { MapDocument, MapWorldOverlaySprite, OverlayTextureAsset } from '@shared/contracts'

type MapWorldStatePreviewOverlayProps = {
  mapDocument: MapDocument | null
  viewportZoom: number
  sprites: MapWorldOverlaySprite[]
  textureAssets: Record<string, OverlayTextureAsset>
}

type RenderableOverlaySprite = {
  id: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  pixelX: number
  pixelY: number
  width: number
  height: number
  zIndex: number
  assetUrl: string
}

function MapWorldStatePreviewOverlay({
  mapDocument,
  viewportZoom,
  sprites,
  textureAssets,
}: MapWorldStatePreviewOverlayProps) {
  const spriteEntries = useMemo(
    () =>
      sprites.flatMap((sprite) => {
        const asset = textureAssets[sprite.textureName]
        return asset?.url
          ? [
              {
                id: sprite.id,
                sourceX: sprite.sourceX,
                sourceY: sprite.sourceY,
                sourceWidth: sprite.sourceWidth,
                sourceHeight: sprite.sourceHeight,
                pixelX: sprite.pixelX,
                pixelY: sprite.pixelY,
                width: sprite.width,
                height: sprite.height,
                zIndex: sprite.zIndex,
                assetUrl: asset.url,
              } satisfies RenderableOverlaySprite,
            ]
          : []
      }),
    [sprites, textureAssets],
  )

  if (!mapDocument || sprites.length === 0) {
    return null
  }

  const gamePixelScale = mapDocument.tileWidth / 64

  return (
    <div className="absolute inset-0">
      {spriteEntries.map((sprite) => {
        const pixelX = sprite.pixelX * gamePixelScale * viewportZoom
        const pixelY = sprite.pixelY * gamePixelScale * viewportZoom
        const width = sprite.width * gamePixelScale * viewportZoom
        const height = sprite.height * gamePixelScale * viewportZoom

        return (
          <div
            key={sprite.id}
            className="absolute"
            style={{
              transform: `translate(${Math.round(pixelX)}px, ${Math.round(pixelY)}px)`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: sprite.zIndex,
            }}
          >
            <div
              style={{
                width: `${sprite.sourceWidth}px`,
                height: `${sprite.sourceHeight}px`,
                transform: `scale(${width / sprite.sourceWidth}, ${height / sprite.sourceHeight})`,
                transformOrigin: 'top left',
                backgroundImage: `url("${sprite.assetUrl}")`,
                backgroundPosition: `-${sprite.sourceX}px -${sprite.sourceY}px`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default memo(MapWorldStatePreviewOverlay)
