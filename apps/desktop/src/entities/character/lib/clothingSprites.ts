/**
 * @file Clothing sprite-sheet geometry helpers for shirt and pants texture cut-outs.
 * @module entities/character
 */
export type ClothingSourceRect = {
  x: number
  y: number
  width: number
  height: number
}

export const CLOTHING_SHIRT_ICON_WIDTH = 8
export const CLOTHING_SHIRT_ICON_HEIGHT = 8
export const CLOTHING_SHIRT_STRIP_HEIGHT = 32
export const CLOTHING_PANTS_MENU_WIDTH = 16
export const CLOTHING_PANTS_MENU_HEIGHT = 16
export const CLOTHING_PANTS_VARIANT_WIDTH = 96
export const CLOTHING_PANTS_VARIANT_HEIGHT = 688
export const CLOTHING_PANTS_STRIDE_X = 192
export const CLOTHING_PANTS_MENU_OFFSET_Y = 672

/** Half-sheet width used to separate the base strip from its alpha mask. */
export function getClothingShirtSheetWidth(textureWidth: number) {
  return Math.max(1, Math.floor(textureWidth / 2))
}

/** Source rect of one shirt's full vertical strip (icon + worn variant). */
export function getClothingShirtStripSourceRect(textureWidth: number, spriteIndex: number): ClothingSourceRect {
  const sheetWidth = getClothingShirtSheetWidth(textureWidth)
  const pixelOffset = spriteIndex * CLOTHING_SHIRT_ICON_WIDTH

  return {
    x: pixelOffset % sheetWidth,
    y: Math.floor(pixelOffset / sheetWidth) * CLOTHING_SHIRT_STRIP_HEIGHT,
    width: CLOTHING_SHIRT_ICON_WIDTH,
    height: CLOTHING_SHIRT_STRIP_HEIGHT,
  }
}

/** Source rect of one shirt's alpha mask strip, offset into the right half of the sheet. */
export function getClothingShirtStripMaskSourceRect(textureWidth: number, spriteIndex: number): ClothingSourceRect {
  const baseRect = getClothingShirtStripSourceRect(textureWidth, spriteIndex)
  return {
    ...baseRect,
    x: baseRect.x + getClothingShirtSheetWidth(textureWidth),
  }
}

/** Source rect of one shirt's menu icon (top 8×8 pixels of the strip). */
export function getClothingShirtMenuSourceRect(textureWidth: number, spriteIndex: number): ClothingSourceRect {
  const stripRect = getClothingShirtStripSourceRect(textureWidth, spriteIndex)
  return {
    ...stripRect,
    height: CLOTHING_SHIRT_ICON_HEIGHT,
  }
}

/** Source rect of one shirt's menu icon alpha mask. */
export function getClothingShirtMenuMaskSourceRect(textureWidth: number, spriteIndex: number): ClothingSourceRect {
  const maskStripRect = getClothingShirtStripMaskSourceRect(textureWidth, spriteIndex)
  return {
    ...maskStripRect,
    height: CLOTHING_SHIRT_ICON_HEIGHT,
  }
}

/** Total shirt count that fits in a sheet of the given dimensions. */
export function getClothingShirtCount(textureWidth: number, textureHeight: number) {
  return Math.max(
    0,
    Math.floor(getClothingShirtSheetWidth(textureWidth) / CLOTHING_SHIRT_ICON_WIDTH) *
      Math.floor(textureHeight / CLOTHING_SHIRT_STRIP_HEIGHT),
  )
}

/** Number of pants columns that fit across the sheet width. */
export function getClothingPantsColumns(textureWidth: number) {
  return Math.max(1, Math.floor(textureWidth / CLOTHING_PANTS_STRIDE_X))
}

/** Source rect of one pants worn variant, offset by gender into the stride. */
export function getClothingPantsVariantSourceRect(textureWidth: number, spriteIndex: number, isFemale: boolean): ClothingSourceRect {
  const columns = getClothingPantsColumns(textureWidth)
  return {
    x: CLOTHING_PANTS_STRIDE_X * (spriteIndex % columns) + (isFemale ? CLOTHING_PANTS_VARIANT_WIDTH : 0),
    y: CLOTHING_PANTS_VARIANT_HEIGHT * Math.floor(spriteIndex / columns),
    width: CLOTHING_PANTS_VARIANT_WIDTH,
    height: CLOTHING_PANTS_VARIANT_HEIGHT,
  }
}

/** Source rect of one pants menu icon (16×16 at the bottom of the variant). */
export function getClothingPantsMenuSourceRect(textureWidth: number, spriteIndex: number): ClothingSourceRect {
  const variantRect = getClothingPantsVariantSourceRect(textureWidth, spriteIndex, false)
  return {
    x: variantRect.x,
    y: variantRect.y + CLOTHING_PANTS_MENU_OFFSET_Y,
    width: CLOTHING_PANTS_MENU_WIDTH,
    height: CLOTHING_PANTS_MENU_HEIGHT,
  }
}

/** Total pants count that fits in a sheet of the given dimensions. */
export function getClothingPantsCount(textureWidth: number, textureHeight: number) {
  return Math.max(0, getClothingPantsColumns(textureWidth) * Math.floor(textureHeight / CLOTHING_PANTS_VARIANT_HEIGHT))
}
