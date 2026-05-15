import type { PlayerAppearanceColor, PlayerAppearanceProfile } from '@entities/event'
import {
  getClothingPantsVariantSourceRect,
  getClothingShirtMenuSourceRect,
  getClothingShirtStripMaskSourceRect,
  getClothingShirtStripSourceRect,
} from '@shared/lib/clothingSprites'

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
  hatIsMask: boolean
  hatHairDrawMode: 'normal' | 'hide' | 'cover'
  hatIgnoreHairstyleOffset: boolean
  recoloredBaseTextureUrl: string | null
  hairTextureUrl: string | null
  bakedHairTextureUrl: string | null
  hairTextureWidth: number | null
  hairStyleMetadata: FarmerHairMetadataEntry | null
  obscuredHairStyleIndex: number | null
  obscuredHairTextureUrl: string | null
  obscuredBakedHairTextureUrl: string | null
  obscuredHairTextureWidth: number | null
  obscuredHairStyleMetadata: FarmerHairMetadataEntry | null
  shirtsTextureUrl: string | null
  shirtsTextureWidth: number | null
  bakedShirtTextureUrl: string | null
  pantsTextureUrl: string | null
  pantsTextureWidth: number | null
  rotation: null
  bakedPantsTextureUrl: string | null
  accessoriesTextureUrl: string | null
  hatsTextureUrl: string | null
  accessoriesTextureWidth: number | null
  hatsTextureWidth: number | null
}

export type FarmerSpriteLayerDescriptor = {
  key: string
  url: string | null
  width: number
  height: number
  offsetX: number
  offsetY: number
  sourceX: number
  sourceY: number
  flip: boolean
  opacity?: number
  backgroundColor?: string | null
  rotation?: number
  scaleX?: number
  scaleY?: number
  transformOrigin?: string
}

export type FarmerHairMetadataEntry = {
  textureName: string
  tileX: number
  tileY: number
  usesUniqueLeftSprite: boolean
  coveredIndex: number
  isBaldStyle: boolean
}

export type FarmerVisualToolKind = 'none' | 'fishingRod' | 'slingshot' | 'other'

export type FarmerRenderState = {
  bodyFlip?: boolean
  currentEyes?: number
  bathingClothes?: boolean
  swimming?: boolean
  swimmingYOffset?: number
  isDrawingForUi?: boolean
  isInBed?: boolean
  timeWentToBed?: number
  timeOfDay?: number
  pauseForSingleAnimation?: boolean
  usingTool?: boolean
  toolKind?: FarmerVisualToolKind
  fishingRodIsCasting?: boolean
  armOffset?: number
  slingshotAimRadians?: number
  slingshotBackArmDistance?: number
  rotation?: number
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
  1, 2, 2, 0, 5, 6, 1, 2, 2, 1, 0, 2, 0, 1, 1, 0, 2, 2, 3, 3, 2, 2, 1, 1, 0, 0, 2, 2, 4, 4, 0, 0, 1, 2, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, -2,
  -1, 1, 1, 0, -1, -2, -1, -1, 5, 4, 0, 0, 3, 2, -1, 0, 4, 2, 0, 0, 2, 1, 0, -1, 1, -2, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, -1, -1, -1,
  -1, 1, 1, 0, 0, 0, 0, 4, 1, 0, 1, 2, 1, 0, 1, 0, 1, 2, -3, -4, -1, 0, 0, 2, 1, -4, -1, 0, 0, -3, 0, 0, -1, 0, 0, 2, 1, 1,
]

export const FARMER_FEATURE_X_OFFSET_PER_FRAME = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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

function applyIndexedColorSwap(
  data: Uint8ClampedArray,
  offsets: Record<number, number[]>,
  sourceColorIndex: number,
  target: { r: number; g: number; b: number; a: number },
) {
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
  const offsets: Record<number, number[]> = Object.fromEntries(BASE_RECOLOR_SOURCE_INDICES.map((index) => [index, []])) as Record<
    number,
    number[]
  >

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

function multiplyColor(left: { r: number; g: number; b: number; a: number }, right: { r: number; g: number; b: number; a: number }) {
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

export function getFarmerObscuredHairStyleIndex(hairStyleIndex: number) {
  switch (hairStyleIndex) {
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 1:
    case 3:
    case 5:
    case 6:
    case 9:
    case 11:
    case 17:
    case 20:
    case 23:
    case 24:
    case 25:
    case 27:
    case 28:
    case 29:
    case 30:
    case 32:
    case 33:
    case 34:
    case 36:
    case 39:
    case 41:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
      return hairStyleIndex
    case 48:
      return 6
    case 49:
      return 52
    case 18:
    case 19:
    case 21:
    case 31:
      return 23
    case 42:
      return 46
    default:
      if (hairStyleIndex >= 16) {
        return hairStyleIndex < 100 ? 30 : hairStyleIndex
      }
      return 7
  }
}

function getFarmerRotationAdjustment(facingDirection: number, rotation: number) {
  if (rotation === -Math.PI / 32) {
    return { x: 6, y: -2 }
  }

  if (rotation === Math.PI / 32) {
    return facingDirection === 3 ? { x: -5, y: 1 } : { x: -6, y: 1 }
  }

  return { x: 0, y: 0 }
}

function shouldDrawFarmerEyes(facingDirection: number, renderState: FarmerRenderState, currentEyes: number) {
  if (currentEyes === 0 || facingDirection === 0) {
    return false
  }

  const timeOfDay = renderState.timeOfDay ?? 1200
  const canStayAwake = timeOfDay < 2600 || (renderState.isInBed && (renderState.timeWentToBed ?? 0) !== 0)
  if (!canStayAwake) {
    return false
  }

  if ((!renderState.pauseForSingleAnimation && !renderState.usingTool) || renderState.toolKind === 'fishingRod') {
    return !(renderState.usingTool && renderState.toolKind === 'fishingRod' && renderState.fishingRodIsCasting === false)
  }

  return false
}

function getFarmerHairSourceRect(
  styleIndex: number,
  textureWidth: number | null,
  metadata: FarmerHairMetadataEntry | null,
  facingDirection: number,
  usingBakedTexture: boolean,
) {
  const width = Math.max(16, textureWidth ?? 128)
  const rowOffset =
    facingDirection === 0 ? 64 : facingDirection === 2 ? 0 : facingDirection === 3 && metadata?.usesUniqueLeftSprite ? 96 : 32

  if (usingBakedTexture) {
    return { sourceX: 0, sourceY: rowOffset }
  }

  if (metadata) {
    return {
      sourceX: metadata.tileX * 16,
      sourceY: metadata.tileY * 16 + rowOffset,
    }
  }

  return {
    sourceX: (styleIndex * 16) % width,
    sourceY: Math.floor((styleIndex * 16) / width) * 96 + rowOffset,
  }
}

function isFarmerAccessoryFacialHair(accessoryIndex: number) {
  return accessoryIndex < 6 || (accessoryIndex >= 19 && accessoryIndex <= 22)
}

function shouldDrawFarmerAccessoryBelowHair(accessoryIndex: number) {
  return accessoryIndex < 8 || isFarmerAccessoryFacialHair(accessoryIndex)
}

function createFarmerLineLayerDescriptor(
  key: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = '#ffffff',
): FarmerSpriteLayerDescriptor {
  const deltaX = endX - startX
  const deltaY = endY - startY
  return {
    key,
    url: null,
    width: Math.max(0.75, Math.hypot(deltaX, deltaY)),
    height: 0.75,
    offsetX: startX,
    offsetY: startY,
    sourceX: 0,
    sourceY: 0,
    flip: false,
    backgroundColor: color,
    rotation: Math.atan2(deltaY, deltaX),
    transformOrigin: '0 50%',
  }
}

function buildFarmerSlingshotLayerDescriptors(
  spriteUrl: string,
  facingDirection: number,
  renderState: FarmerRenderState,
): FarmerSpriteLayerDescriptor[] {
  const angle =
    renderState.slingshotAimRadians ?? (facingDirection === 0 ? 1.25 : facingDirection === 1 ? 0.2 : facingDirection === 3 ? -0.2 : 1.1)
  const backArmDistance = Math.max(0, renderState.slingshotBackArmDistance ?? 8)

  switch (facingDirection) {
    case 0:
      return [
        {
          key: 'slingshot-up',
          url: spriteUrl,
          width: 9,
          height: 14,
          offsetX: 1 + angle * 2,
          offsetY: -11,
          sourceX: 173,
          sourceY: 238,
          flip: false,
        },
      ]
    case 1: {
      const startX = (52 - backArmDistance) / 4
      const startY = -36 / 4
      const num5 = Math.cos(angle + Math.PI / 2) * (20 - backArmDistance - 8) - Math.sin(angle + Math.PI / 2) * -68
      const num6 = Math.sin(angle + Math.PI / 2) * (20 - backArmDistance - 8) + Math.cos(angle + Math.PI / 2) * -68
      return [
        {
          key: 'slingshot-body-right',
          url: spriteUrl,
          width: 10,
          height: 4,
          offsetX: (52 - backArmDistance) / 4,
          offsetY: -8,
          sourceX: 147,
          sourceY: 237,
          flip: false,
        },
        {
          key: 'slingshot-head-right',
          url: spriteUrl,
          width: 9,
          height: 10,
          offsetX: 9,
          offsetY: -11,
          sourceX: 156,
          sourceY: 244,
          flip: false,
          rotation: angle,
          transformOrigin: '0px 3px',
        },
        createFarmerLineLayerDescriptor('slingshot-line-right', startX, startY, 8 + num5 / 8, -11 + num6 / 8),
      ]
    }
    case 3: {
      const startX = (4 + backArmDistance) / 4
      const startY = -40 / 4
      const num5 = Math.cos(angle + (Math.PI * 2) / 5) * (20 + backArmDistance - 8) - Math.sin(angle + (Math.PI * 2) / 5) * -68
      const num6 = Math.sin(angle + (Math.PI * 2) / 5) * (20 + backArmDistance - 8) + Math.cos(angle + (Math.PI * 2) / 5) * -68
      return [
        {
          key: 'slingshot-body-left',
          url: spriteUrl,
          width: 10,
          height: 4,
          offsetX: (40 + backArmDistance) / 4,
          offsetY: -8,
          sourceX: 147,
          sourceY: 237,
          flip: true,
        },
        {
          key: 'slingshot-head-left',
          url: spriteUrl,
          width: 9,
          height: 10,
          offsetX: 6,
          offsetY: -10,
          sourceX: 156,
          sourceY: 244,
          flip: true,
          rotation: angle + Math.PI,
          transformOrigin: '8px 3px',
        },
        createFarmerLineLayerDescriptor('slingshot-line-left', startX, startY, 6.5 + (num5 * 4) / 40, -10 + (num6 * 4) / 40),
      ]
    }
    case 2:
    default:
      return [
        {
          key: 'slingshot-arm-down',
          url: spriteUrl,
          width: 4,
          height: 4,
          offsetX: 1,
          offsetY: -8 - backArmDistance / 8,
          sourceX: 148,
          sourceY: 244,
          flip: false,
        },
        createFarmerLineLayerDescriptor('slingshot-line-down-left', 4, -7 - backArmDistance / 8, 11 - angle * 2.5, -6),
        createFarmerLineLayerDescriptor('slingshot-line-down-right', 4, -7 - backArmDistance / 8, 14 - angle * 2.5, -6),
        {
          key: 'slingshot-head-down',
          url: spriteUrl,
          width: 7,
          height: 9,
          offsetX: 9 - angle * 2.5,
          offsetY: -4,
          sourceX: 167,
          sourceY: 235,
          flip: false,
        },
      ]
  }
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
  renderState: FarmerRenderState = {},
): FarmerSpriteLayerDescriptor[] {
  const frameWidth = 16
  const frameHeight = 32
  const spriteColumns = 6
  const frameX = (frame % spriteColumns) * frameWidth
  const frameY = Math.floor(frame / spriteColumns) * frameHeight
  const recoloredBaseUrl = farmerAppearance.recoloredBaseTextureUrl ?? spriteUrl
  const bodyFlip = renderState.bodyFlip ?? directionalFlip
  const effectiveFacingDirection = getFarmerFacingDirectionFromFrame(frame, bodyFlip, facingDirection)
  const featureX = getFarmerFeatureXOffset(frame)
  const featureY = getFarmerFeatureYOffset(frame)
  const hairYOffsetAdjustment = getFarmerHairYOffsetAdjustment(farmerAppearance.isFemale, farmerAppearance.hairStyleIndex)
  const accessoryUnderHair = shouldDrawFarmerAccessoryBelowHair(farmerAppearance.accessoryIndex)
  const hatHairOffset = farmerAppearance.hatIgnoreHairstyleOffset
    ? 0
    : (FARMER_HAIRSTYLE_HAT_OFFSET[farmerAppearance.hairStyleIndex % 16] ?? 0)
  const rotationAdjustment = getFarmerRotationAdjustment(effectiveFacingDirection, renderState.rotation ?? 0)
  const currentEyes = renderState.currentEyes ?? 0
  const bathingClothes = renderState.bathingClothes ?? false
  const swimming = !renderState.isDrawingForUi && Boolean(renderState.swimming)
  const swimmingYOffset = swimming ? (renderState.swimmingYOffset ?? 0) : 0
  const swimmingCropHeight = Math.max(1, Math.min(32, 16 - Math.trunc(swimmingYOffset / 4)))
  const verticalOffset = swimming ? 16 : 0
  const armOffset = renderState.armOffset ?? 6

  const activeHairStyleIndex =
    !bathingClothes && farmerAppearance.hatHairDrawMode === 'cover' && farmerAppearance.obscuredHairStyleIndex != null
      ? farmerAppearance.obscuredHairStyleIndex
      : farmerAppearance.hairStyleIndex
  const activeHairTextureUrl =
    !bathingClothes && farmerAppearance.hatHairDrawMode === 'cover'
      ? (farmerAppearance.obscuredBakedHairTextureUrl ?? farmerAppearance.obscuredHairTextureUrl)
      : (farmerAppearance.bakedHairTextureUrl ?? farmerAppearance.hairTextureUrl)
  const activeHairTextureWidth =
    !bathingClothes && farmerAppearance.hatHairDrawMode === 'cover'
      ? farmerAppearance.obscuredHairTextureWidth
      : farmerAppearance.hairTextureWidth
  const activeHairMetadata =
    !bathingClothes && farmerAppearance.hatHairDrawMode === 'cover'
      ? farmerAppearance.obscuredHairStyleMetadata
      : farmerAppearance.hairStyleMetadata

  const layers: FarmerSpriteLayerDescriptor[] = [
    {
      key: 'base',
      url: recoloredBaseUrl,
      width: 16,
      height: swimming ? swimmingCropHeight : 32,
      offsetX: 0,
      offsetY: verticalOffset,
      sourceX: frameX,
      sourceY: frameY,
      flip: bodyFlip,
    },
  ]

  if (farmerAppearance.pantsTextureUrl) {
    const pantsUrl = farmerAppearance.bakedPantsTextureUrl ?? farmerAppearance.pantsTextureUrl
    const pantsSourceRect = getClothingPantsVariantSourceRect(
      farmerAppearance.pantsTextureWidth ?? 192,
      farmerAppearance.pantsSpriteIndex,
      farmerAppearance.isFemale,
    )
    layers.push({
      key: 'pants',
      url: pantsUrl,
      width: 16,
      height: swimming ? swimmingCropHeight : 32,
      offsetX: 0,
      offsetY: verticalOffset,
      sourceX: farmerAppearance.bakedPantsTextureUrl ? frameX : frameX + pantsSourceRect.x,
      sourceY: farmerAppearance.bakedPantsTextureUrl ? frameY : frameY + pantsSourceRect.y,
      flip: bodyFlip,
    })
  }

  if (shouldDrawFarmerEyes(effectiveFacingDirection, renderState, currentEyes)) {
    const faceOffsetX =
      5 + (bodyFlip ? -featureX : featureX) + (effectiveFacingDirection === 1 ? 3 : effectiveFacingDirection === 3 ? 1 : 0)
    const faceWidth = effectiveFacingDirection === 2 ? 6 : 2
    layers.push({
      key: 'face-skin',
      url: recoloredBaseUrl,
      width: faceWidth,
      height: 2,
      offsetX: faceOffsetX,
      offsetY: verticalOffset + featureY + (!farmerAppearance.isFemale && effectiveFacingDirection !== 2 ? 9 : 10),
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
      offsetY: verticalOffset + featureY + (effectiveFacingDirection === 1 || effectiveFacingDirection === 3 ? 10 : 11),
      sourceX: 264 + (effectiveFacingDirection === 3 ? 4 : 0),
      sourceY: 2 + (currentEyes - 1) * 2,
      flip: false,
    })
  }

  if (!bathingClothes && farmerAppearance.shirtsTextureUrl) {
    const shirtSourceRect = getClothingShirtMenuSourceRect(farmerAppearance.shirtsTextureWidth ?? 256, farmerAppearance.shirtSpriteIndex)
    const shirtRowOffset =
      effectiveFacingDirection === 0 ? 24 : effectiveFacingDirection === 1 ? 8 : effectiveFacingDirection === 3 ? 16 : 0
    const shirtOffsetX = effectiveFacingDirection === 3 ? 4 - featureX + rotationAdjustment.x : 4 + featureX + rotationAdjustment.x
    layers.push({
      key: 'shirt',
      url: farmerAppearance.bakedShirtTextureUrl ?? farmerAppearance.shirtsTextureUrl,
      width: 8,
      height: 8,
      offsetX: shirtOffsetX,
      offsetY: verticalOffset + 14 + featureY + rotationAdjustment.y,
      sourceX: farmerAppearance.bakedShirtTextureUrl ? 0 : shirtSourceRect.x,
      sourceY: farmerAppearance.bakedShirtTextureUrl ? shirtRowOffset : shirtSourceRect.y + shirtRowOffset,
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
          offsetX: (effectiveFacingDirection === 3 ? -featureX : featureX) + rotationAdjustment.x,
          offsetY:
            verticalOffset +
            (effectiveFacingDirection === 2
              ? 3 + featureY + (farmerAppearance.accessoryIndex === 26 && [24, 25, 26, 70].includes(frame) ? 1 : 0)
              : 1 + featureY) +
            rotationAdjustment.y,
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

  if (activeHairTextureUrl && (bathingClothes || farmerAppearance.hatHairDrawMode !== 'hide')) {
    const hairSourceRect = getFarmerHairSourceRect(
      activeHairStyleIndex,
      activeHairTextureWidth,
      activeHairMetadata,
      effectiveFacingDirection,
      activeHairTextureUrl === farmerAppearance.bakedHairTextureUrl ||
        activeHairTextureUrl === farmerAppearance.obscuredBakedHairTextureUrl,
    )
    const hairOffsetX = effectiveFacingDirection === 3 ? -featureX : featureX
    const hairOffsetY = verticalOffset + featureY + hairYOffsetAdjustment + (effectiveFacingDirection === 0 ? 1 : 0)
    layers.push({
      key: 'hair',
      url: activeHairTextureUrl,
      width: 16,
      height: 32,
      offsetX: hairOffsetX,
      offsetY: hairOffsetY,
      sourceX: hairSourceRect.sourceX,
      sourceY: hairSourceRect.sourceY,
      flip: effectiveFacingDirection === 3,
    })
  }

  if (accessoryLayer && !accessoryUnderHair) {
    layers.push(accessoryLayer)
  }

  if (!bathingClothes && farmerAppearance.hatsTextureUrl && farmerAppearance.hatSpriteIndex != null) {
    const hatRowOffset = effectiveFacingDirection === 0 ? 60 : effectiveFacingDirection === 1 ? 20 : effectiveFacingDirection === 3 ? 40 : 0
    const hatSourceX = (farmerAppearance.hatSpriteIndex * 20) % Math.max(20, farmerAppearance.hatsTextureWidth ?? 320)
    const hatSourceY =
      Math.floor((farmerAppearance.hatSpriteIndex * 20) / Math.max(20, farmerAppearance.hatsTextureWidth ?? 320)) * 80 + hatRowOffset
    const hatOffsetX = -2 + (bodyFlip ? -featureX : featureX)
    const hatOffsetY = verticalOffset - 3 + featureY + hatHairOffset

    if (farmerAppearance.hatIsMask && effectiveFacingDirection === 0) {
      layers.push({
        key: 'hat-mask-upper',
        url: farmerAppearance.hatsTextureUrl,
        width: 20,
        height: 11,
        offsetX: hatOffsetX,
        offsetY: hatOffsetY,
        sourceX: hatSourceX,
        sourceY: hatSourceY,
        flip: false,
      })
      layers.push({
        key: 'hat-mask-lower',
        url: farmerAppearance.hatsTextureUrl,
        width: 20,
        height: 9,
        offsetX: hatOffsetX,
        offsetY: hatOffsetY + 11,
        sourceX: hatSourceX,
        sourceY: hatSourceY + 11,
        flip: false,
      })
    } else {
      layers.push({
        key: 'hat',
        url: farmerAppearance.hatsTextureUrl,
        width: 20,
        height: 20,
        offsetX: hatOffsetX,
        offsetY: hatOffsetY,
        sourceX: hatSourceX,
        sourceY: hatSourceY,
        flip: false,
      })
    }
  }

  if (armOffset > 0) {
    layers.push({
      key: 'arms',
      url: recoloredBaseUrl,
      width: 16,
      height: swimming ? swimmingCropHeight : 32,
      offsetX: 0,
      offsetY: verticalOffset,
      sourceX: frameX + armOffset * 16,
      sourceY: frameY,
      flip: bodyFlip,
    })
  }

  if (renderState.usingTool && renderState.toolKind === 'slingshot') {
    layers.push(...buildFarmerSlingshotLayerDescriptors(recoloredBaseUrl, effectiveFacingDirection, renderState))
  }

  if (swimming) {
    layers.push({
      key: 'swim-water-ring',
      url: null,
      width: Math.max(8, 12 - swimmingYOffset / 2),
      height: 1,
      offsetX: 2 + swimmingYOffset / 4,
      offsetY: 16 - swimmingYOffset / 4,
      sourceX: 0,
      sourceY: 0,
      flip: false,
      opacity: 0.75,
      backgroundColor: '#ffffff',
    })
  }

  return layers
}

export function getFarmerBaseAsset(
  profile: PlayerAppearanceProfile,
  baseMale: FarmerAppearanceImageAsset | null,
  baseFemale: FarmerAppearanceImageAsset | null,
) {
  return profile.isFemale ? (baseFemale ?? baseMale) : (baseMale ?? baseFemale)
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
        const shirtBaseRect = getClothingShirtStripSourceRect(shirtsAsset.width, profile.shirtSpriteIndex)
        const shirtMaskRect = getClothingShirtStripMaskSourceRect(shirtsAsset.width, profile.shirtSpriteIndex)
        const shirtBaseIndex = (shirtBaseRect.y + 4) * shirtCanvas.width + shirtBaseRect.x
        const shirtDyeIndex = (shirtMaskRect.y + 4) * shirtCanvas.width + shirtMaskRect.x

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
    const shirtBaseRect = getClothingShirtStripSourceRect(shirtsAsset.width, profile.shirtSpriteIndex)
    const shirtMaskRect = getClothingShirtStripMaskSourceRect(shirtsAsset.width, profile.shirtSpriteIndex)
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 32
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(shirtsAsset.image, shirtBaseRect.x, shirtBaseRect.y, shirtBaseRect.width, shirtBaseRect.height, 0, 0, 8, 32)
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
    overlayContext.drawImage(shirtsAsset.image, shirtMaskRect.x, shirtMaskRect.y, shirtMaskRect.width, shirtMaskRect.height, 0, 0, 8, 32)
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
    const pantsSourceRect = getClothingPantsVariantSourceRect(pantsAsset.width, profile.pantsSpriteIndex, profile.isFemale)
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 688
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(pantsAsset.image, pantsSourceRect.x, pantsSourceRect.y, pantsSourceRect.width, pantsSourceRect.height, 0, 0, 96, 688)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    tintOpaquePixels(imageData.data, profile.pantsColor)
    context.putImageData(imageData, 0, 0)

    const url = canvas.toDataURL('image/png')
    pantsTextureCache.set(cacheKey, url)
    return url
  })
}

export function bakeFarmerHairTexture(
  profile: PlayerAppearanceProfile | null,
  hairAsset: FarmerAppearanceImageAsset | null,
  options: {
    hairStyleIndex?: number
    metadata?: FarmerHairMetadataEntry | null
  } = {},
) {
  if (!hairAsset || !profile) {
    return null
  }

  const hairStyleIndex = options.hairStyleIndex ?? profile.hairStyleIndex
  const metadata = options.metadata ?? null
  const captureHeight = metadata?.usesUniqueLeftSprite ? 128 : 96
  const cacheKey = JSON.stringify({
    hair: hairAsset.url,
    hairStyleIndex,
    hairColor: profile.hairColor,
    metadata,
  })
  const cached = hairTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return safeBakeTexture(null, () => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = captureHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    const sourceX = metadata ? metadata.tileX * 16 : (hairStyleIndex * 16) % Math.max(16, hairAsset.width)
    const sourceY = metadata ? metadata.tileY * 16 : Math.floor((hairStyleIndex * 16) / Math.max(16, hairAsset.width)) * 96
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(hairAsset.image, sourceX, sourceY, 16, captureHeight, 0, 0, 16, captureHeight)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    tintOpaquePixels(imageData.data, profile.hairColor)
    context.putImageData(imageData, 0, 0)

    const url = canvas.toDataURL('image/png')
    hairTextureCache.set(cacheKey, url)
    return url
  })
}
