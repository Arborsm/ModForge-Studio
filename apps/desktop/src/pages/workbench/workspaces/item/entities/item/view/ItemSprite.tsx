import type { CSSProperties } from 'react'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '../model'
import { getItemSpriteSourceRect, getItemSpriteTintMaskSourceRect } from '../model'
import { AtlasSprite } from './AtlasSprite'

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
  item: Pick<
    ItemWorkspaceEntry,
    'displayName' | 'kind' | 'textureAssetName' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight' | 'apparelStats'
  >
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
    <AtlasSprite
      texture={textureState}
      sourceRect={sourceRect}
      maskRect={tintMaskRect}
      maskColor={tintColor}
      maskBlendMode={item.kind === 'pants' ? 'multiply' : 'normal'}
      scale={scale}
      className={className}
      style={style}
      fallback={
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-(--text-secondary) uppercase">
          {item.displayName.slice(0, 1)}
        </div>
      }
    />
  )
}
