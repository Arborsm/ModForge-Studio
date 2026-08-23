import type { SpriteSheetImageDimensions } from './types'

type SpriteSheetFrameLayout = {
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  frameCount: number
}

type SpriteSheetFrameOptions = {
  frameWidth?: number
  frameHeight?: number
  previewScale?: number
}

type SpriteSheetImages = {
  resultImage?: SpriteSheetImageDimensions | null
  originalImage?: SpriteSheetImageDimensions | null
}

const DEFAULT_FRAME_WIDTH = 64
const DEFAULT_FRAME_HEIGHT = 64

function sanitizePositiveDimension(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function inferSpriteSheetImageMetrics(images?: SpriteSheetImages) {
  const resultWidth = sanitizePositiveDimension(images?.resultImage?.width)
  const resultHeight = sanitizePositiveDimension(images?.resultImage?.height)
  const originalWidth = sanitizePositiveDimension(images?.originalImage?.width)
  const originalHeight = sanitizePositiveDimension(images?.originalImage?.height)
  const hasOriginalDimensions = resultWidth > 0 && resultHeight > 0 && originalWidth > 0 && originalHeight > 0

  if (!hasOriginalDimensions) {
    return { scale: 1, resultWidth, resultHeight, originalWidth: 0, originalHeight: 0, hasOriginalDimensions: false }
  }

  const widthScale = resultWidth / originalWidth
  const heightScale = resultHeight / originalHeight
  const scale = Math.max(1, Math.floor(Math.min(widthScale, heightScale)))
  const paddingWidth = Math.max(0, resultWidth - originalWidth * scale)
  const paddingHeight = Math.max(0, resultHeight - originalHeight * scale)

  return {
    scale,
    resultWidth,
    resultHeight,
    originalWidth,
    originalHeight,
    hasOriginalDimensions: Math.abs(widthScale - heightScale) < 0.001 && (scale > 1 || paddingWidth > 0 || paddingHeight > 0),
  }
}

function resolveSpriteSheetFrameLayout(images?: SpriteSheetImages, options?: SpriteSheetFrameOptions): SpriteSheetFrameLayout {
  const baseFrameWidth = sanitizePositiveDimension(options?.frameWidth, DEFAULT_FRAME_WIDTH)
  const baseFrameHeight = sanitizePositiveDimension(options?.frameHeight, DEFAULT_FRAME_HEIGHT)
  const metrics = inferSpriteSheetImageMetrics(images)

  if (metrics.hasOriginalDimensions) {
    const columns = Math.max(1, Math.floor(metrics.originalWidth / baseFrameWidth))
    const rows = Math.max(1, Math.floor(metrics.originalHeight / baseFrameHeight))
    return {
      frameWidth: Math.max(baseFrameWidth, baseFrameWidth * metrics.scale),
      frameHeight: Math.max(baseFrameHeight, baseFrameHeight * metrics.scale),
      columns,
      rows,
      frameCount: columns * rows,
    }
  }

  if (metrics.resultWidth <= 0 || metrics.resultHeight <= 0) {
    return { frameWidth: baseFrameWidth, frameHeight: baseFrameHeight, columns: 0, rows: 0, frameCount: 0 }
  }

  if (metrics.resultWidth < baseFrameWidth || metrics.resultHeight < baseFrameHeight) {
    return {
      frameWidth: Math.max(metrics.resultWidth, baseFrameWidth),
      frameHeight: Math.max(metrics.resultHeight, baseFrameHeight),
      columns: 1,
      rows: 1,
      frameCount: 1,
    }
  }

  const columns = Math.max(1, Math.floor(metrics.resultWidth / baseFrameWidth))
  const rows = Math.max(1, Math.floor(metrics.resultHeight / baseFrameHeight))
  return { frameWidth: baseFrameWidth, frameHeight: baseFrameHeight, columns, rows, frameCount: columns * rows }
}

/**
 * Returns the number of fixed-size frames visible in a sprite sheet, including
 * ScaleUp-style enlarged sheets whose result is an integer multiple of the
 * original. Returns 0 when no usable dimensions are available.
 */
export function getSpriteSheetFrameCount(images?: SpriteSheetImages, options?: SpriteSheetFrameOptions) {
  return resolveSpriteSheetFrameLayout(images, options).frameCount
}

function getSpriteSheetFrameBounds(images: SpriteSheetImages | undefined, frameIndex: number, options?: SpriteSheetFrameOptions) {
  const layout = resolveSpriteSheetFrameLayout(images, options)
  if (layout.frameCount <= 0) {
    return { frameWidth: layout.frameWidth, frameHeight: layout.frameHeight, frameX: 0, frameY: 0 }
  }

  const clampedFrameIndex = Math.max(0, Math.min(layout.frameCount - 1, frameIndex))
  return {
    frameWidth: layout.frameWidth,
    frameHeight: layout.frameHeight,
    frameX: (clampedFrameIndex % layout.columns) * layout.frameWidth,
    frameY: Math.floor(clampedFrameIndex / layout.columns) * layout.frameHeight,
  }
}

function getSpriteSheetFramePreviewScale(images?: SpriteSheetImages, options?: SpriteSheetFrameOptions) {
  const layout = resolveSpriteSheetFrameLayout(images, options)
  const baseFrameWidth = sanitizePositiveDimension(options?.frameWidth, DEFAULT_FRAME_WIDTH)
  const baseFrameHeight = sanitizePositiveDimension(options?.frameHeight, DEFAULT_FRAME_HEIGHT)
  const previewScale =
    typeof options?.previewScale === 'number' && Number.isFinite(options.previewScale) && options.previewScale > 0
      ? options.previewScale
      : 1

  return previewScale * Math.min(baseFrameWidth / layout.frameWidth, baseFrameHeight / layout.frameHeight, 1)
}

/**
 * Resolves crop and sheet dimensions for one preview frame of a sprite sheet.
 * Frames are addressed by index in reading order over the sheet grid.
 */
export function getSpriteSheetFramePreviewMetrics(
  images: SpriteSheetImages | undefined,
  frameIndex: number,
  options?: SpriteSheetFrameOptions,
) {
  const bounds = getSpriteSheetFrameBounds(images, frameIndex, options)
  const layout = resolveSpriteSheetFrameLayout(images, options)
  const metrics = inferSpriteSheetImageMetrics(images)
  const previewScale = getSpriteSheetFramePreviewScale(images, options)
  const sheetWidth = (metrics.resultWidth > 0 ? metrics.resultWidth : layout.frameWidth * Math.max(1, layout.columns)) * previewScale
  const sheetHeight = (metrics.resultHeight > 0 ? metrics.resultHeight : layout.frameHeight * Math.max(1, layout.rows)) * previewScale

  return {
    frameWidth: bounds.frameWidth * previewScale,
    frameHeight: bounds.frameHeight * previewScale,
    frameX: bounds.frameX * previewScale,
    frameY: bounds.frameY * previewScale,
    sheetWidth,
    sheetHeight,
  }
}
