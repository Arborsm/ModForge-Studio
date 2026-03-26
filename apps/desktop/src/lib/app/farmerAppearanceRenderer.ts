import type { PlayerAppearanceColor, PlayerAppearanceProfile } from './playerAppearance'

export type FarmerAppearanceImageAsset = {
  image: HTMLImageElement
  url: string
  width: number
  height: number
}

export type FarmerAppearanceCompositeAssets = {
  isFemale: boolean
  shirtSpriteIndex: number
  pantsSpriteIndex: number
  hairStyleIndex: number
  accessoryIndex: number
  hatSpriteIndex: number | null
  hatHairDrawMode: 'normal' | 'hide' | 'cover'
  hatIgnoreHairstyleOffset: boolean
  recoloredBaseTextureUrl: string | null
  hairTextureUrl: string | null
  bakedHairTextureUrl: string | null
  shirtsTextureUrl: string | null
  bakedShirtTextureUrl: string | null
  pantsTextureUrl: string | null
  bakedPantsTextureUrl: string | null
  accessoriesTextureUrl: string | null
  hatsTextureUrl: string | null
  accessoriesTextureWidth: number | null
  hatsTextureWidth: number | null
}

export type FarmerSpriteLayerDescriptor = {
  key: string
  url: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  sourceX: number
  sourceY: number
  flip: boolean
}

export type FarmerDirectionalFrameState = {
  frame: number
  directionalFlip: boolean
}

export type FarmerWalkAnimationState = {
  frames: number[]
  directionalFlip: boolean
}

export const FARMER_FEATURE_Y_OFFSET_PER_FRAME = [
  1, 2, 2, 0, 5, 6, 1, 2, 2, 1, 0, 2, 0, 1, 1, 0, 2, 2, 3, 3, 2, 2, 1, 1, 0, 0, 2, 2, 4, 4, 0, 0, 1, 2, 1, 1,
  1, 1, 0, 0, 1, 1, 1, 0, 0, -2, -1, 1, 1, 0, -1, -2, -1, -1, 5, 4, 0, 0, 3, 2, -1, 0, 4, 2, 0, 0, 2, 1, 0,
  -1, 1, -2, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, -1, -1, -1, -1, 1, 1, 0, 0, 0, 0, 4, 1, 0, 1, 2, 1, 0,
  1, 0, 1, 2, -3, -4, -1, 0, 0, 2, 1, -4, -1, 0, 0, -3, 0, 0, -1, 0, 0, 2, 1, 1,
]

export const FARMER_FEATURE_X_OFFSET_PER_FRAME = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, -1, 0,
  0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

const baseTextureCache = new Map<string, string>()
const shirtTextureCache = new Map<string, string>()
const pantsTextureCache = new Map<string, string>()
const hairTextureCache = new Map<string, string>()
const recolorOffsetCache = new Map<string, Record<number, number[]>>()
const BASE_RECOLOR_SOURCE_INDICES = [256, 257, 258, 260, 261, 262, 268, 269, 270, 271, 276, 277] as const
const FARMER_HAIRSTYLE_HAT_OFFSET = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0] as const

function safeBakeTexture(fallbackUrl: string | null, bake: () => string | null) {
  try {
    return bake() ?? fallbackUrl
  } catch (error) {
    console.warn('Failed to bake farmer appearance texture.', error)
    return fallbackUrl
  }
}

function clampPaletteIndex(value: number, asset: FarmerAppearanceImageAsset | null, width: number) {
  if (!asset || width <= 0) {
    return Math.max(0, value)
  }

  return Math.max(0, Math.min(Math.floor(asset.height) - 1, value))
}

function getPixelAtLinearIndex(data: Uint8ClampedArray, pixelIndex: number) {
  const offset = pixelIndex * 4
  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0,
    a: data[offset + 3] ?? 0,
  }
}

function getPixelAtXY(data: Uint8ClampedArray, width: number, x: number, y: number) {
  return getPixelAtLinearIndex(data, y * width + x)
}

function sameColor(left: { r: number; g: number; b: number; a: number }, right: { r: number; g: number; b: number; a: number }) {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a
}

function applyIndexedColorSwap(data: Uint8ClampedArray, offsets: Record<number, number[]>, sourceColorIndex: number, target: { r: number; g: number; b: number; a: number }) {
  for (const pixelIndex of offsets[sourceColorIndex] ?? []) {
    const offset = pixelIndex * 4
    data[offset] = target.r
    data[offset + 1] = target.g
    data[offset + 2] = target.b
    data[offset + 3] = target.a
  }
}

function getBaseRecolorOffsets(baseAsset: FarmerAppearanceImageAsset) {
  const cached = recolorOffsetCache.get(baseAsset.url)
  if (cached) {
    return cached
  }

  const canvas = document.createElement('canvas')
  canvas.width = baseAsset.width
  canvas.height = baseAsset.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    const empty = Object.fromEntries(BASE_RECOLOR_SOURCE_INDICES.map((index) => [index, []])) as Record<number, number[]>
    recolorOffsetCache.set(baseAsset.url, empty)
    return empty
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(baseAsset.image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const offsets: Record<number, number[]> = Object.fromEntries(BASE_RECOLOR_SOURCE_INDICES.map((index) => [index, []])) as Record<number, number[]>

  for (const sourceIndex of BASE_RECOLOR_SOURCE_INDICES) {
    const sourceColor = getPixelAtLinearIndex(pixels, sourceIndex)
    const matches: number[] = []
    for (let pixelIndex = 0; pixelIndex < pixels.length / 4; pixelIndex += 1) {
      if (sameColor(getPixelAtLinearIndex(pixels, pixelIndex), sourceColor)) {
        matches.push(pixelIndex)
      }
    }
    offsets[sourceIndex] = matches
  }

  recolorOffsetCache.set(baseAsset.url, offsets)
  return offsets
}

function changeBrightness(color: PlayerAppearanceColor, brightness: number): PlayerAppearanceColor {
  return {
    r: Math.min(255, Math.max(0, color.r + brightness)),
    g: Math.min(255, Math.max(0, color.g + brightness)),
    b: Math.min(255, Math.max(0, color.b + (brightness > 0 ? Math.floor((brightness * 5) / 6) : Math.floor((brightness * 8) / 7)))),
    a: color.a,
  }
}

function multiplyColor(
  left: { r: number; g: number; b: number; a: number },
  right: { r: number; g: number; b: number; a: number },
) {
  return {
    r: Math.round((left.r * right.r) / 255),
    g: Math.round((left.g * right.g) / 255),
    b: Math.round((left.b * right.b) / 255),
    a: left.a,
  }
}

function makeOpaque(color: PlayerAppearanceColor): PlayerAppearanceColor {
  return { ...color, a: 255 }
}

function tintOpaquePixels(data: Uint8ClampedArray, color: PlayerAppearanceColor) {
  const tint = makeOpaque(color)
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0
    if (alpha === 0) {
      continue
    }

    data[offset] = Math.round((data[offset] * tint.r) / 255)
    data[offset + 1] = Math.round((data[offset + 1] * tint.g) / 255)
    data[offset + 2] = Math.round((data[offset + 2] * tint.b) / 255)
  }
}

export function getFarmerFeatureXOffset(frame: number) {
  return FARMER_FEATURE_X_OFFSET_PER_FRAME[frame] ?? 0
}

export function getFarmerFeatureYOffset(frame: number) {
  return FARMER_FEATURE_Y_OFFSET_PER_FRAME[frame] ?? 0
}

export function getFarmerHairYOffsetAdjustment(isFemale: boolean, hairStyleIndex: number) {
  if (!isFemale && hairStyleIndex >= 16) {
    return -1
  }

  if (isFemale && hairStyleIndex < 16) {
    return 1
  }

  return 0
}

function isFarmerAccessoryFacialHair(accessoryIndex: number) {
  return accessoryIndex < 6 || (accessoryIndex >= 19 && accessoryIndex <= 22)
}

function shouldDrawFarmerAccessoryBelowHair(accessoryIndex: number) {
  return accessoryIndex < 8 || isFarmerAccessoryFacialHair(accessoryIndex)
}

export function getFarmerDirectionalFrame(direction: number): FarmerDirectionalFrameState {
  switch (direction) {
    case 0:
      return { frame: 12, directionalFlip: false }
    case 1:
      return { frame: 6, directionalFlip: false }
    case 3:
      return { frame: 6, directionalFlip: true }
    default:
      return { frame: 0, directionalFlip: false }
  }
}

export function getFarmerWalkAnimation(direction: number): FarmerWalkAnimationState {
  switch (direction) {
    case 0:
      return { frames: [13, 12, 14, 12], directionalFlip: false }
    case 1:
      return { frames: [7, 6, 8, 6], directionalFlip: false }
    case 3:
      return { frames: [7, 6, 8, 6], directionalFlip: true }
    default:
      return { frames: [1, 0, 2, 0], directionalFlip: false }
  }
}

export function getFarmerFacingDirectionFromFrame(frame: number, directionalFlip: boolean, fallbackDirection: number) {
  if (frame >= 12 && frame <= 17) {
    return 0
  }

  if (frame >= 0 && frame <= 5) {
    return 2
  }

  if (frame >= 6 && frame <= 11) {
    return directionalFlip ? 3 : 1
  }

  return fallbackDirection
}

export function buildFarmerSpriteLayerDescriptors(
  farmerAppearance: FarmerAppearanceCompositeAssets,
  frame: number,
  facingDirection: number,
  spriteUrl: string,
  directionalFlip = false,
): FarmerSpriteLayerDescriptor[] {
  const frameWidth = 16
  const frameHeight = 32
  const spriteColumns = 6
  const frameX = (frame % spriteColumns) * frameWidth
  const frameY = Math.floor(frame / spriteColumns) * frameHeight
  const recoloredBaseUrl = farmerAppearance.recoloredBaseTextureUrl ?? spriteUrl
  const effectiveFacingDirection = getFarmerFacingDirectionFromFrame(frame, directionalFlip, facingDirection)
  const featureX = getFarmerFeatureXOffset(frame)
  const featureY = getFarmerFeatureYOffset(frame)
  const hairYOffsetAdjustment = getFarmerHairYOffsetAdjustment(farmerAppearance.isFemale, farmerAppearance.hairStyleIndex)
  const hairColorOverrideUrl = farmerAppearance.bakedHairTextureUrl ?? farmerAppearance.hairTextureUrl
  const accessoryUnderHair = shouldDrawFarmerAccessoryBelowHair(farmerAppearance.accessoryIndex)
  const hatHairOffset = farmerAppearance.hatIgnoreHairstyleOffset
    ? 0
    : (FARMER_HAIRSTYLE_HAT_OFFSET[farmerAppearance.hairStyleIndex % 16] ?? 0)
  const bodyFlip = directionalFlip

  const layers: FarmerSpriteLayerDescriptor[] = [
    {
      key: 'base',
      url: recoloredBaseUrl,
      width: 16,
      height: 32,
      offsetX: 0,
      offsetY: 0,
      sourceX: frameX,
      sourceY: frameY,
      flip: bodyFlip,
    },
  ]

  if (farmerAppearance.pantsTextureUrl) {
    const pantsUrl = farmerAppearance.bakedPantsTextureUrl ?? farmerAppearance.pantsTextureUrl
    layers.push({
      key: 'pants',
      url: pantsUrl,
      width: 16,
      height: 32,
      offsetX: 0,
      offsetY: 0,
      sourceX: farmerAppearance.bakedPantsTextureUrl ? frameX : frameX + (farmerAppearance.pantsSpriteIndex % 10) * 192 + (farmerAppearance.isFemale ? 96 : 0),
      sourceY: farmerAppearance.bakedPantsTextureUrl ? frameY : frameY + Math.floor(farmerAppearance.pantsSpriteIndex / 10) * 688,
      flip: bodyFlip,
    })
  }

  if (effectiveFacingDirection !== 0) {
    const faceOffsetX =
      5 + (effectiveFacingDirection === 3 ? 1 - featureX : featureX + (effectiveFacingDirection === 1 ? 3 : 0))
    const faceWidth = effectiveFacingDirection === 2 ? 6 : 2
    layers.push({
      key: 'face-skin',
      url: recoloredBaseUrl,
      width: faceWidth,
      height: 2,
      offsetX: faceOffsetX,
      offsetY: featureY + (!farmerAppearance.isFemale && effectiveFacingDirection !== 2 ? 9 : 10),
      sourceX: 5,
      sourceY: 16,
      flip: false,
    })
    layers.push({
      key: 'eyes',
      url: recoloredBaseUrl,
      width: faceWidth,
      height: 2,
      offsetX: faceOffsetX,
      offsetY: featureY + (effectiveFacingDirection === 1 || effectiveFacingDirection === 3 ? 10 : 11),
      sourceX: 264 + (effectiveFacingDirection === 3 ? 4 : 0),
      sourceY: 2,
      flip: false,
    })
  }

  if (farmerAppearance.shirtsTextureUrl) {
    const shirtBaseX = (farmerAppearance.shirtSpriteIndex * 8) % 128
    const shirtBaseY = Math.floor((farmerAppearance.shirtSpriteIndex * 8) / 128) * 32
    const shirtRowOffset =
      effectiveFacingDirection === 0 ? 24 : effectiveFacingDirection === 1 ? 8 : effectiveFacingDirection === 3 ? 16 : 0
    const shirtOffsetX = effectiveFacingDirection === 3 ? 4 - featureX : 4 + featureX
    layers.push({
      key: 'shirt',
      url: farmerAppearance.bakedShirtTextureUrl ?? farmerAppearance.shirtsTextureUrl,
      width: 8,
      height: 8,
      offsetX: shirtOffsetX,
      offsetY: 14 + featureY,
      sourceX: farmerAppearance.bakedShirtTextureUrl ? 0 : shirtBaseX,
      sourceY: farmerAppearance.bakedShirtTextureUrl ? shirtRowOffset : shirtBaseY + shirtRowOffset,
      flip: false,
    })
  }

  const accessoryLayer =
    farmerAppearance.accessoriesTextureUrl && farmerAppearance.accessoryIndex >= 0 && effectiveFacingDirection !== 0
      ? {
          key: accessoryUnderHair ? 'accessory-under-hair' : 'accessory',
          url: farmerAppearance.accessoriesTextureUrl,
          width: 16,
          height: 16,
          offsetX: effectiveFacingDirection === 3 ? -featureX : featureX,
          offsetY: effectiveFacingDirection === 2 ? 4 + featureY : 1 + featureY,
          sourceX: (farmerAppearance.accessoryIndex * 16) % Math.max(16, farmerAppearance.accessoriesTextureWidth ?? 128),
          sourceY:
            Math.floor((farmerAppearance.accessoryIndex * 16) / Math.max(16, farmerAppearance.accessoriesTextureWidth ?? 128)) * 32 +
            (effectiveFacingDirection === 2 ? 0 : 16),
          flip: effectiveFacingDirection === 3,
        }
      : null

  if (accessoryLayer && accessoryUnderHair) {
    layers.push(accessoryLayer)
  }

  if (farmerAppearance.hairTextureUrl && hairColorOverrideUrl && farmerAppearance.hatHairDrawMode !== 'hide') {
    const hairRowOffset = effectiveFacingDirection === 0 ? 64 : effectiveFacingDirection === 2 ? 0 : 32
    const hairOffsetX = effectiveFacingDirection === 3 ? -featureX : featureX
    const hairOffsetY = featureY + hairYOffsetAdjustment + (effectiveFacingDirection === 0 ? 1 : 0)
    layers.push({
      key: 'hair',
      url: hairColorOverrideUrl,
      width: 16,
      height: 32,
      offsetX: hairOffsetX,
      offsetY: hairOffsetY,
      sourceX: farmerAppearance.bakedHairTextureUrl ? 0 : (farmerAppearance.hairStyleIndex * 16) % 128,
      sourceY: farmerAppearance.bakedHairTextureUrl ? hairRowOffset : Math.floor((farmerAppearance.hairStyleIndex * 16) / 128) * 96 + hairRowOffset,
      flip: effectiveFacingDirection === 3,
    })
  }

  if (accessoryLayer && !accessoryUnderHair) {
    layers.push(accessoryLayer)
  }

  if (farmerAppearance.hatsTextureUrl && farmerAppearance.hatSpriteIndex != null) {
    const hatRowOffset =
      effectiveFacingDirection === 0 ? 60 : effectiveFacingDirection === 1 ? 20 : effectiveFacingDirection === 3 ? 40 : 0
    layers.push({
      key: 'hat',
      url: farmerAppearance.hatsTextureUrl,
      width: 20,
      height: 20,
      offsetX: -2 + (effectiveFacingDirection === 3 ? -featureX : featureX),
      offsetY: -3 + featureY + hatHairOffset,
      sourceX: (farmerAppearance.hatSpriteIndex * 20) % Math.max(20, farmerAppearance.hatsTextureWidth ?? 320),
      sourceY: Math.floor((farmerAppearance.hatSpriteIndex * 20) / Math.max(20, farmerAppearance.hatsTextureWidth ?? 320)) * 80 + hatRowOffset,
      flip: false,
    })
  }

  layers.push({
    key: 'arms',
    url: recoloredBaseUrl,
    width: 16,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    sourceX: frameX + 96,
    sourceY: frameY,
    flip: bodyFlip,
  })

  return layers
}

export function getFarmerBaseAsset(
  profile: PlayerAppearanceProfile,
  baseMale: FarmerAppearanceImageAsset | null,
  baseFemale: FarmerAppearanceImageAsset | null,
) {
  return profile.isFemale ? baseFemale ?? baseMale : baseMale ?? baseFemale
}

export function bakeFarmerBaseTexture(
  profile: PlayerAppearanceProfile | null,
  baseAsset: FarmerAppearanceImageAsset | null,
  shirtsAsset: FarmerAppearanceImageAsset | null,
  skinColorsAsset: FarmerAppearanceImageAsset | null,
  shoeColorsAsset: FarmerAppearanceImageAsset | null,
) {
  if (!baseAsset || !profile) {
    return baseAsset?.url ?? null
  }

  const cacheKey = JSON.stringify({
    base: baseAsset.url,
    shirts: shirtsAsset?.url ?? null,
    skin: skinColorsAsset?.url ?? null,
    shoes: shoeColorsAsset?.url ?? null,
    shirtSpriteIndex: profile.shirtSpriteIndex,
    skinToneIndex: profile.skinToneIndex,
    shoesIndex: profile.shoesIndex,
    eyeColor: profile.eyeColor,
    shirtColor: profile.shirtColor,
  })
  const cached = baseTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return safeBakeTexture(baseAsset.url, () => {
    const canvas = document.createElement('canvas')
    canvas.width = baseAsset.width
    canvas.height = baseAsset.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return baseAsset.url
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(baseAsset.image, 0, 0)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data
    const recolorOffsets = getBaseRecolorOffsets(baseAsset)

    const eyeLight = makeOpaque(profile.eyeColor)
    let eyeDark = changeBrightness(eyeLight, -75)
    if (sameColor(eyeLight, eyeDark)) {
      eyeDark = { ...eyeDark, b: Math.min(255, eyeDark.b + 10) }
    }
    applyIndexedColorSwap(pixels, recolorOffsets, 276, eyeLight)
    applyIndexedColorSwap(pixels, recolorOffsets, 277, eyeDark)

    if (skinColorsAsset) {
      const skinCanvas = document.createElement('canvas')
      skinCanvas.width = skinColorsAsset.width
      skinCanvas.height = skinColorsAsset.height
      const skinContext = skinCanvas.getContext('2d', { willReadFrequently: true })
      if (skinContext) {
        skinContext.drawImage(skinColorsAsset.image, 0, 0)
        const skinPixels = skinContext.getImageData(0, 0, skinCanvas.width, skinCanvas.height).data
        const skinIndex = clampPaletteIndex(profile.skinToneIndex, skinColorsAsset, 3)
        applyIndexedColorSwap(pixels, recolorOffsets, 260, getPixelAtXY(skinPixels, skinCanvas.width, 0, skinIndex))
        applyIndexedColorSwap(pixels, recolorOffsets, 261, getPixelAtXY(skinPixels, skinCanvas.width, 1, skinIndex))
        applyIndexedColorSwap(pixels, recolorOffsets, 262, getPixelAtXY(skinPixels, skinCanvas.width, 2, skinIndex))
      }
    }

    if (shoeColorsAsset) {
      const shoeCanvas = document.createElement('canvas')
      shoeCanvas.width = shoeColorsAsset.width
      shoeCanvas.height = shoeColorsAsset.height
      const shoeContext = shoeCanvas.getContext('2d', { willReadFrequently: true })
      if (shoeContext) {
        shoeContext.drawImage(shoeColorsAsset.image, 0, 0)
        const shoePixels = shoeContext.getImageData(0, 0, shoeCanvas.width, shoeCanvas.height).data
        const shoeIndex = clampPaletteIndex(profile.shoesIndex, shoeColorsAsset, 4)
        applyIndexedColorSwap(pixels, recolorOffsets, 268, getPixelAtXY(shoePixels, shoeCanvas.width, 0, shoeIndex))
        applyIndexedColorSwap(pixels, recolorOffsets, 269, getPixelAtXY(shoePixels, shoeCanvas.width, 1, shoeIndex))
        applyIndexedColorSwap(pixels, recolorOffsets, 270, getPixelAtXY(shoePixels, shoeCanvas.width, 2, shoeIndex))
        applyIndexedColorSwap(pixels, recolorOffsets, 271, getPixelAtXY(shoePixels, shoeCanvas.width, 3, shoeIndex))
      }
    }

    if (shirtsAsset) {
      const shirtCanvas = document.createElement('canvas')
      shirtCanvas.width = shirtsAsset.width
      shirtCanvas.height = shirtsAsset.height
      const shirtContext = shirtCanvas.getContext('2d', { willReadFrequently: true })
      if (shirtContext) {
        shirtContext.drawImage(shirtsAsset.image, 0, 0)
        const shirtPixels = shirtContext.getImageData(0, 0, shirtCanvas.width, shirtCanvas.height).data
        const shirtBaseIndex =
          Math.floor((profile.shirtSpriteIndex * 8) / 128) * 32 * shirtCanvas.width + ((profile.shirtSpriteIndex * 8) % 128) + shirtCanvas.width * 4
        const shirtDyeIndex = shirtBaseIndex + 128

        let fallbackSkin: ReturnType<typeof getPixelAtXY>[] | null = null
        if (skinColorsAsset) {
          const skinCanvas = document.createElement('canvas')
          skinCanvas.width = skinColorsAsset.width
          skinCanvas.height = skinColorsAsset.height
          const skinContext = skinCanvas.getContext('2d', { willReadFrequently: true })
          if (skinContext) {
            skinContext.drawImage(skinColorsAsset.image, 0, 0)
            const skinPixels = skinContext.getImageData(0, 0, skinCanvas.width, skinCanvas.height).data
            const skinIndex = clampPaletteIndex(profile.skinToneIndex, skinColorsAsset, 3)
            fallbackSkin = [
              getPixelAtXY(skinPixels, skinCanvas.width, 0, skinIndex),
              getPixelAtXY(skinPixels, skinCanvas.width, 1, skinIndex),
              getPixelAtXY(skinPixels, skinCanvas.width, 2, skinIndex),
            ]
          }
        }

        for (let row = 0; row < 3; row += 1) {
          const dyeSample = getPixelAtLinearIndex(shirtPixels, shirtDyeIndex - shirtCanvas.width * row)
          const target =
            dyeSample.a < 255
              ? (fallbackSkin?.[row] ?? getPixelAtLinearIndex(shirtPixels, shirtBaseIndex - shirtCanvas.width * row))
              : multiplyColor(getPixelAtLinearIndex(shirtPixels, shirtDyeIndex - shirtCanvas.width * row), makeOpaque(profile.shirtColor))

          applyIndexedColorSwap(pixels, recolorOffsets, 256 + row, target)
        }
      }
    }

    context.putImageData(imageData, 0, 0)
    const url = canvas.toDataURL('image/png')
    baseTextureCache.set(cacheKey, url)
    return url
  })
}

export function bakeFarmerShirtTexture(profile: PlayerAppearanceProfile | null, shirtsAsset: FarmerAppearanceImageAsset | null) {
  if (!shirtsAsset || !profile) {
    return null
  }

  const cacheKey = JSON.stringify({
    shirts: shirtsAsset.url,
    shirtSpriteIndex: profile.shirtSpriteIndex,
    shirtColor: profile.shirtColor,
  })
  const cached = shirtTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return safeBakeTexture(null, () => {
    const baseX = (profile.shirtSpriteIndex * 8) % 128
    const baseY = Math.floor((profile.shirtSpriteIndex * 8) / 128) * 32
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 32
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(shirtsAsset.image, baseX, baseY, 8, 32, 0, 0, 8, 32)
    const baseImageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const basePixels = baseImageData.data

    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = 8
    overlayCanvas.height = 32
    const overlayContext = overlayCanvas.getContext('2d', { willReadFrequently: true })
    if (!overlayContext) {
      return null
    }

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    overlayContext.drawImage(shirtsAsset.image, baseX + 128, baseY, 8, 32, 0, 0, 8, 32)
    const overlayPixels = overlayContext.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height).data
    const shirtColor = makeOpaque(profile.shirtColor)

    for (let offset = 0; offset < basePixels.length; offset += 4) {
      const overlayAlpha = overlayPixels[offset + 3] ?? 0
      if (overlayAlpha < 255) {
        continue
      }

      basePixels[offset] = Math.round((overlayPixels[offset] * shirtColor.r) / 255)
      basePixels[offset + 1] = Math.round((overlayPixels[offset + 1] * shirtColor.g) / 255)
      basePixels[offset + 2] = Math.round((overlayPixels[offset + 2] * shirtColor.b) / 255)
      basePixels[offset + 3] = overlayAlpha
    }

    context.putImageData(baseImageData, 0, 0)
    const url = canvas.toDataURL('image/png')
    shirtTextureCache.set(cacheKey, url)
    return url
  })
}

export function bakeFarmerPantsTexture(profile: PlayerAppearanceProfile | null, pantsAsset: FarmerAppearanceImageAsset | null) {
  if (!pantsAsset || !profile) {
    return null
  }

  const cacheKey = JSON.stringify({
    pants: pantsAsset.url,
    pantsSpriteIndex: profile.pantsSpriteIndex,
    isFemale: profile.isFemale,
    pantsColor: profile.pantsColor,
  })
  const cached = pantsTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return safeBakeTexture(null, () => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 688
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    const sourceX = (profile.pantsSpriteIndex % 10) * 192 + (profile.isFemale ? 96 : 0)
    const sourceY = Math.floor(profile.pantsSpriteIndex / 10) * 688
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(pantsAsset.image, sourceX, sourceY, 96, 688, 0, 0, 96, 688)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    tintOpaquePixels(imageData.data, profile.pantsColor)
    context.putImageData(imageData, 0, 0)

    const url = canvas.toDataURL('image/png')
    pantsTextureCache.set(cacheKey, url)
    return url
  })
}

export function bakeFarmerHairTexture(profile: PlayerAppearanceProfile | null, hairAsset: FarmerAppearanceImageAsset | null) {
  if (!hairAsset || !profile) {
    return null
  }

  const cacheKey = JSON.stringify({
    hair: hairAsset.url,
    hairStyleIndex: profile.hairStyleIndex,
    hairColor: profile.hairColor,
  })
  const cached = hairTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return safeBakeTexture(null, () => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 96
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    const sourceX = (profile.hairStyleIndex * 16) % 128
    const sourceY = Math.floor((profile.hairStyleIndex * 16) / 128) * 96
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(hairAsset.image, sourceX, sourceY, 16, 96, 0, 0, 16, 96)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    tintOpaquePixels(imageData.data, profile.hairColor)
    context.putImageData(imageData, 0, 0)

    const url = canvas.toDataURL('image/png')
    hairTextureCache.set(cacheKey, url)
    return url
  })
}
