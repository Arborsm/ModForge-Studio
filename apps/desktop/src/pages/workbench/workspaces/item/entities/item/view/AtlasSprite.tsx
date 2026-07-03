import type { CSSProperties, ReactNode } from 'react'

export type AtlasSpriteRect = {
  x: number
  y: number
  width: number
  height: number
}

export type AtlasSpriteTexture = {
  url: string | null
  width: number | null
  height: number | null
}

type AtlasSpriteProps = {
  texture: AtlasSpriteTexture | null
  sourceRect: AtlasSpriteRect | null
  maskRect?: AtlasSpriteRect | null
  maskColor?: string | null
  maskBlendMode?: CSSProperties['mixBlendMode']
  scale?: number
  className?: string
  style?: CSSProperties
  fallback?: ReactNode
}

function buildSpriteLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX}px -${sourceY}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
  }
}

function buildMaskLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
  color,
  blendMode,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
  color: string
  blendMode?: CSSProperties['mixBlendMode']
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: color,
    maskImage: `url("${url}")`,
    maskRepeat: 'no-repeat',
    maskPosition: `-${sourceX}px -${sourceY}px`,
    maskSize: `${sheetWidth}px ${sheetHeight}px`,
    WebkitMaskImage: `url("${url}")`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: `-${sourceX}px -${sourceY}px`,
    WebkitMaskSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
    mixBlendMode: blendMode,
  }
}

/** Renders one sprite from a texture atlas without depending on item workspace models. */
export function AtlasSprite({
  texture,
  sourceRect,
  maskRect = null,
  maskColor = null,
  maskBlendMode,
  scale = 2,
  className = '',
  style,
  fallback = null,
}: AtlasSpriteProps) {
  const hasSprite = sourceRect && texture?.url && texture.width && texture.height

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-panel-muted) ${className}`}
      style={{ isolation: 'isolate', ...style }}
    >
      {hasSprite ? (
        <>
          <div
            className="absolute top-1/2 left-1/2"
            style={{
              ...buildSpriteLayerStyle({
                url: texture.url!,
                sheetWidth: texture.width!,
                sheetHeight: texture.height!,
                sourceX: sourceRect.x,
                sourceY: sourceRect.y,
                width: sourceRect.width,
                height: sourceRect.height,
              }),
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
          {maskRect && maskColor ? (
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                ...buildMaskLayerStyle({
                  url: texture.url!,
                  sheetWidth: texture.width!,
                  sheetHeight: texture.height!,
                  sourceX: maskRect.x,
                  sourceY: maskRect.y,
                  width: maskRect.width,
                  height: maskRect.height,
                  color: maskColor,
                  blendMode: maskBlendMode,
                }),
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: 'center center',
              }}
            />
          ) : null}
        </>
      ) : (
        fallback
      )}
    </div>
  )
}
