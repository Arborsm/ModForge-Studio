import type { CSSProperties } from 'react'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '../lib/app/itemWorkspace'
import { getItemSpriteSourceRect, getItemSpriteTintMaskSourceRect } from '../lib/app/itemWorkspace'

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

function parseTintColor(rawColor: string | null | undefined) {
  const trimmed = rawColor?.trim() ?? ''
  if (!trimmed) {
    return '#ffffff'
  }

  const parts = trimmed.split(/[\s,]+/u).map((part) => Number.parseInt(part, 10))
  if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
    const [r, g, b] = parts
    return `rgb(${r}, ${g}, ${b})`
  }

  return trimmed
}

type ItemSpriteProps = {
  item: Pick<ItemWorkspaceEntry, 'displayName' | 'kind' | 'textureAssetName' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight' | 'apparelStats'>
  textureState: ItemTextureAssetState | null
  scale?: number
  className?: string
  style?: CSSProperties
}

export function ItemSprite({ item, textureState, scale = 2, className = '', style }: ItemSpriteProps) {
  const sourceRect = getItemSpriteSourceRect(item, textureState)
  const tintMaskRect = getItemSpriteTintMaskSourceRect(item, textureState)
  const tintColor = item.kind === 'shirt' || item.kind === 'pants' ? parseTintColor(item.apparelStats?.defaultColor) : null

  return (
    <div className={`relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] ${className}`} style={{ isolation: 'isolate', ...style }}>
      {sourceRect && textureState?.url && textureState.width && textureState.height ? (
        <>
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              ...buildSpriteLayerStyle({
                url: textureState.url,
                sheetWidth: textureState.width,
                sheetHeight: textureState.height,
                sourceX: sourceRect.x,
                sourceY: sourceRect.y,
                width: sourceRect.width,
                height: sourceRect.height,
              }),
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
          {tintMaskRect && tintColor ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                ...buildMaskLayerStyle({
                  url: textureState.url,
                  sheetWidth: textureState.width,
                  sheetHeight: textureState.height,
                  sourceX: tintMaskRect.x,
                  sourceY: tintMaskRect.y,
                  width: tintMaskRect.width,
                  height: tintMaskRect.height,
                  color: tintColor,
                  blendMode: item.kind === 'pants' ? 'multiply' : 'normal',
                }),
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: 'center center',
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase text-[var(--text-secondary)]">
          {item.displayName.slice(0, 1)}
        </div>
      )}
    </div>
  )
}
