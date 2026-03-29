import type { EffectAssetState } from '../lib/app/eventStageShared'
import type { StageWorldOverlaySprite } from '../lib/app/mapWorldStatePreview'
import type { MapDocument } from '../lib/maps/types'

type MapWorldStatePreviewOverlayProps = {
  mapDocument: MapDocument | null
  viewportZoom: number
  sprites: StageWorldOverlaySprite[]
  textureAssets: Record<string, EffectAssetState>
}

export default function MapWorldStatePreviewOverlay({
  mapDocument,
  viewportZoom,
  sprites,
  textureAssets,
}: MapWorldStatePreviewOverlayProps) {
  if (!mapDocument || sprites.length === 0) {
    return null
  }

  const gamePixelScale = mapDocument.tileWidth / 64

  return (
    <div className="absolute inset-0">
      {sprites.map((sprite) => {
        const asset = textureAssets[sprite.textureName]
        if (!asset?.url) {
          return null
        }

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
                backgroundImage: `url("${asset.url}")`,
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
