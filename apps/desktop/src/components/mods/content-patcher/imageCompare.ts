import { loadImageResource } from '../../../lib/imageMetrics'

export type RgbaRaster = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type ImageCompareBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type PreparedImageCompareAssets = {
  width: number
  height: number
  hasChanges: boolean
  diffBounds: ImageCompareBounds | null
  originalDiffDataUrl: string | null
  patchedDiffDataUrl: string | null
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function createRasterFromImage(image: HTMLImageElement, width: number, height: number): RgbaRaster {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0)
  return {
    width,
    height,
    data: context.getImageData(0, 0, width, height).data,
  }
}

function equalPixel(data: Uint8ClampedArray, offset: number, reference: Uint8ClampedArray) {
  return (
    data[offset] === reference[offset] &&
    data[offset + 1] === reference[offset + 1] &&
    data[offset + 2] === reference[offset + 2] &&
    data[offset + 3] === reference[offset + 3]
  )
}

export function findChangedBounds(original: RgbaRaster, patched: RgbaRaster): ImageCompareBounds | null {
  const width = Math.min(original.width, patched.width)
  const height = Math.min(original.height, patched.height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (equalPixel(original.data, offset, patched.data)) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

export function maskUnchangedPixels(source: RgbaRaster, reference: RgbaRaster): RgbaRaster {
  const data = new Uint8ClampedArray(source.data)
  const totalPixels = Math.min(source.data.length, reference.data.length) / 4

  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
    const offset = pixelIndex * 4
    if (equalPixel(source.data, offset, reference.data)) {
      data[offset + 3] = 0
    }
  }

  return {
    width: source.width,
    height: source.height,
    data,
  }
}

export function cropRaster(raster: RgbaRaster, bounds: ImageCompareBounds): RgbaRaster {
  const next = new Uint8ClampedArray(bounds.width * bounds.height * 4)

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sourceX = bounds.x + x
      const sourceY = bounds.y + y
      const sourceOffset = (sourceY * raster.width + sourceX) * 4
      const targetOffset = (y * bounds.width + x) * 4
      next[targetOffset] = raster.data[sourceOffset]
      next[targetOffset + 1] = raster.data[sourceOffset + 1]
      next[targetOffset + 2] = raster.data[sourceOffset + 2]
      next[targetOffset + 3] = raster.data[sourceOffset + 3]
    }
  }

  return {
    width: bounds.width,
    height: bounds.height,
    data: next,
  }
}

function rasterToDataUrl(raster: RgbaRaster) {
  const canvas = createCanvas(raster.width, raster.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  const imageData = context.createImageData(raster.width, raster.height)
  imageData.data.set(raster.data)
  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function prepareImageCompareAssets(
  originalImageDataUrl: string,
  patchedImageDataUrl: string,
): Promise<PreparedImageCompareAssets> {
  const [originalResource, patchedResource] = await Promise.all([
    loadImageResource(originalImageDataUrl),
    loadImageResource(patchedImageDataUrl),
  ])
  const width = Math.max(originalResource.width, patchedResource.width)
  const height = Math.max(originalResource.height, patchedResource.height)
  const originalRaster = createRasterFromImage(originalResource.image, width, height)
  const patchedRaster = createRasterFromImage(patchedResource.image, width, height)
  const diffBounds = findChangedBounds(originalRaster, patchedRaster)

  if (!diffBounds) {
    return {
      width,
      height,
      hasChanges: false,
      diffBounds: null,
      originalDiffDataUrl: null,
      patchedDiffDataUrl: null,
    }
  }

  const maskedOriginal = cropRaster(maskUnchangedPixels(originalRaster, patchedRaster), diffBounds)
  const maskedPatched = cropRaster(maskUnchangedPixels(patchedRaster, originalRaster), diffBounds)
  const originalDiffDataUrl = rasterToDataUrl(maskedOriginal)
  const patchedDiffDataUrl = rasterToDataUrl(maskedPatched)
  const ready = Boolean(originalDiffDataUrl && patchedDiffDataUrl)

  return {
    width,
    height,
    hasChanges: ready,
    diffBounds: ready ? diffBounds : null,
    originalDiffDataUrl,
    patchedDiffDataUrl,
  }
}
