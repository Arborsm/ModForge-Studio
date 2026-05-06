import type {
  ScaleUpBreathType,
  ScaleUpDraft,
  ScaleUpImageDimensions,
  ScaleUpSpriteDraft,
} from './types'

type ScaleUpRect = {
  x: number
  y: number
  width: number
  height: number
}

type ScaleUpPreviewCrop = {
  sourceRect: ScaleUpRect
}

type ScaleUpHeadshotPreview = ScaleUpPreviewCrop & {
  renderOffset: {
    x: number
    y: number
  }
}

type ScaleUpChestOverlay = ScaleUpPreviewCrop & {
  adjust: {
    x: number
    y: number
  }
}

export type ScaleUpPreviewModel = {
  sheet: {
    width: number
    height: number
    scale: number
    originalWidth: number
    originalHeight: number
  }
  headshot: ScaleUpHeadshotPreview | null
  miniMap: ScaleUpPreviewCrop | null
  chestOverlay: ScaleUpChestOverlay | null
}

const DEFAULT_SPRITE_WIDTH = 64
const DEFAULT_SPRITE_HEIGHT = 128
const HEADSHOT_ASPECT_RATIO = 16 / 24
const MINIMAP_SOURCE_X = 14
const MINIMAP_SOURCE_Y = 70
const MINIMAP_SOURCE_SIZE = 32

const BREATH_TYPE_DEFAULTS: Record<
  ScaleUpBreathType,
  Pick<
    ScaleUpSpriteDraft,
    | 'chestSourceX'
    | 'chestSourceY'
    | 'chestSourceWidth'
    | 'chestSourceHeight'
    | 'chestAdjustX'
    | 'chestAdjustY'
  >
> = {
  None: {
    chestSourceX: null,
    chestSourceY: null,
    chestSourceWidth: null,
    chestSourceHeight: null,
    chestAdjustX: null,
    chestAdjustY: null,
  },
  Male: {
    chestSourceX: 24,
    chestSourceY: 98,
    chestSourceWidth: 16,
    chestSourceHeight: 16,
    chestAdjustX: 0,
    chestAdjustY: 0,
  },
  Female: {
    chestSourceX: 24,
    chestSourceY: 100,
    chestSourceWidth: 16,
    chestSourceHeight: 8,
    chestAdjustX: 0,
    chestAdjustY: -4,
  },
}

function sanitizeDimension(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function sanitizeCoordinate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0
}

function toRect(x: number, y: number, width: number, height: number): ScaleUpRect | null {
  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    x,
    y,
    width,
    height,
  }
}

export function withBreathTypeDefaults(sprite: ScaleUpSpriteDraft, breathType: ScaleUpBreathType): ScaleUpSpriteDraft {
  return {
    ...sprite,
    breathType,
    ...BREATH_TYPE_DEFAULTS[breathType],
  }
}

export function buildScaleUpPreviewModel(
  draft: ScaleUpDraft,
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
): ScaleUpPreviewModel {
  const scale = Math.max(1, sanitizeDimension(draft.scale, 1))
  const originalWidth = sanitizeDimension(images?.originalImage?.width, DEFAULT_SPRITE_WIDTH)
  const originalHeight = sanitizeDimension(images?.originalImage?.height, DEFAULT_SPRITE_HEIGHT)
  const resultWidth = sanitizeDimension(images?.resultImage?.width, originalWidth * scale + draft.paddingWidth)
  const resultHeight = sanitizeDimension(images?.resultImage?.height, originalHeight * scale + draft.paddingHeight)
  const sprite = draft.sprite

  if (!sprite) {
    return {
      sheet: {
        width: resultWidth,
        height: resultHeight,
        scale,
        originalWidth,
        originalHeight,
      },
      headshot: null,
      miniMap: null,
      chestOverlay: null,
    }
  }

  const headShotX = sanitizeCoordinate(sprite.headShotX)
  const headShotY = sanitizeCoordinate(sprite.headShotY)
  const headshotWidth = Math.max(0, originalWidth - headShotX * 2)
  const unclampedHeadshotHeight = Math.floor(headshotWidth / HEADSHOT_ASPECT_RATIO)
  const headshotHeight = Math.max(0, Math.min(unclampedHeadshotHeight, originalHeight - headShotY))
  const headshotSourceRect = toRect(
    headShotX * scale,
    headShotY * scale,
    headshotWidth * scale,
    headshotHeight * scale,
  )

  const miniMapX = MINIMAP_SOURCE_X + sanitizeCoordinate(sprite.miniMapXOffset)
  const miniMapY = MINIMAP_SOURCE_Y + sanitizeCoordinate(sprite.miniMapYOffset)
  const miniMapSourceRect = toRect(
    miniMapX * scale,
    miniMapY * scale,
    MINIMAP_SOURCE_SIZE * scale,
    MINIMAP_SOURCE_SIZE * scale,
  )

  const chestSourceRect = toRect(
    sanitizeCoordinate(sprite.chestSourceX) * scale,
    sanitizeCoordinate(sprite.chestSourceY) * scale,
    Math.max(0, sanitizeCoordinate(sprite.chestSourceWidth)) * scale,
    Math.max(0, sanitizeCoordinate(sprite.chestSourceHeight)) * scale,
  )

  return {
    sheet: {
      width: resultWidth,
      height: resultHeight,
      scale,
      originalWidth,
      originalHeight,
    },
    headshot: headshotSourceRect
      ? {
          sourceRect: headshotSourceRect,
          renderOffset: {
            x: sanitizeCoordinate(sprite.headShotXRenderOffset),
            y: sanitizeCoordinate(sprite.headShotYRenderOffset),
          },
        }
      : null,
    miniMap: miniMapSourceRect
      ? {
          sourceRect: miniMapSourceRect,
        }
      : null,
    chestOverlay: chestSourceRect
      ? {
          sourceRect: chestSourceRect,
          adjust: {
            x: sanitizeCoordinate(sprite.chestAdjustX),
            y: sanitizeCoordinate(sprite.chestAdjustY),
          },
        }
      : null,
  }
}
