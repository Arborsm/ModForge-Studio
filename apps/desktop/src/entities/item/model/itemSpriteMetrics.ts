/**
 * @file Item sprite metrics helpers: default sprite dimensions per kind, source
 * rect calculation, tint mask rects, and contained-fit scaling for item thumbnails.
 */

import {
  getClothingPantsMenuSourceRect,
  getClothingShirtMenuMaskSourceRect,
  getClothingShirtMenuSourceRect,
} from '@entities/character/lib/clothingSprites'

import type { ItemKind, ItemTextureAssetState, ItemWorkspaceEntry } from './itemTypes'

/** Returns the default sprite dimensions (width, height in source pixels) for an item kind. */
export function getDefaultItemSpriteMetrics(kind: ItemKind) {
  if (kind === 'big-craftable') {
    return { width: 16, height: 32 }
  }

  if (kind === 'shirt') {
    return { width: 8, height: 8 }
  }

  if (kind === 'hat') {
    return { width: 20, height: 20 }
  }

  return { width: 16, height: 16 }
}

/** Returns the effective sprite metrics, falling back to defaults when the entry has no explicit dimensions. */
export function getItemSpriteMetrics(entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteWidth' | 'spriteHeight'>) {
  return {
    width: entry.spriteWidth || getDefaultItemSpriteMetrics(entry.kind).width,
    height: entry.spriteHeight || getDefaultItemSpriteMetrics(entry.kind).height,
  }
}

/** Computes the source rect for an item's sprite in its texture atlas, handling kind-specific layouts. */
export function getItemSpriteSourceRect(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight'>,
  textureState: Pick<ItemTextureAssetState, 'width'> | null,
) {
  const spriteIndex = entry.menuSpriteIndex ?? entry.spriteIndex
  if (spriteIndex == null || !textureState?.width) {
    return null
  }

  const metrics = getItemSpriteMetrics(entry)
  if (entry.kind === 'shirt') {
    return getClothingShirtMenuSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'pants') {
    return getClothingPantsMenuSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'furniture') {
    const pixelOffset = spriteIndex * 16
    return {
      x: pixelOffset % textureState.width,
      y: Math.floor(pixelOffset / textureState.width) * 16,
      width: metrics.width,
      height: metrics.height,
    }
  }

  const columns = Math.max(1, Math.floor(textureState.width / metrics.width))

  return {
    x: (spriteIndex % columns) * metrics.width,
    y: Math.floor(spriteIndex / columns) * metrics.height,
    width: metrics.width,
    height: metrics.height,
  }
}

/** Computes the tint mask source rect for apparel items (shirts/pants), or null when not applicable. */
export function getItemSpriteTintMaskSourceRect(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight'>,
  textureState: Pick<ItemTextureAssetState, 'width'> | null,
) {
  const spriteIndex = entry.menuSpriteIndex ?? entry.spriteIndex
  const sourceRect = getItemSpriteSourceRect(entry, textureState)
  if (spriteIndex == null || !sourceRect || !textureState?.width) {
    return null
  }

  if (entry.kind === 'shirt') {
    return getClothingShirtMenuMaskSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'pants') {
    return sourceRect
  }

  return null
}

/** Returns the largest scale that fits an item sprite within a square frame of `frameSize` pixels. */
export function getContainedItemSpriteScale(
  entry: Pick<ItemWorkspaceEntry, 'spriteWidth' | 'spriteHeight'>,
  frameSize: number,
  preferredScale: number,
) {
  return Math.min(preferredScale, frameSize / Math.max(1, entry.spriteWidth, entry.spriteHeight))
}

/** Computes a contained-fit frame (scale + pixel dimensions) for an item sprite within a max-size box. */
export function getContainedItemSpriteFrame(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteWidth' | 'spriteHeight'>,
  maxFrameSize: number,
  preferredScale: number,
  padding = 0,
  minFrameSize = 0,
) {
  const metrics = getItemSpriteMetrics(entry)
  const availableWidth = Math.max(1, maxFrameSize - padding * 2)
  const availableHeight = Math.max(1, maxFrameSize - padding * 2)
  const scale = Math.min(preferredScale, availableWidth / metrics.width, availableHeight / metrics.height)
  const width = Math.min(maxFrameSize, Math.max(minFrameSize, Math.round(metrics.width * scale + padding * 2)))
  const height = Math.min(maxFrameSize, Math.max(minFrameSize, Math.round(metrics.height * scale + padding * 2)))

  return {
    scale,
    width,
    height,
  }
}
