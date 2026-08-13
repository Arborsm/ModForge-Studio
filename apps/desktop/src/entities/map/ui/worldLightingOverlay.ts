import indoorWindowLightUrl from '../assets/lighting/indoorWindowLight.png'
import lanternUrl from '../assets/lighting/lantern.png'
import sconceLightUrl from '../assets/lighting/sconceLight.png'
import windowLightUrl from '../assets/lighting/windowLight.png'
import { computeLightingOverlayChannel, getLightingGlowTextureSize, type LightingColor, type WorldLightingState } from '../model/lighting'

/**
 * Bakes a `WorldLightingState` into an opaque overlay canvas meant for a
 * `mix-blend-mode: multiply` layer over the map. The canvas first stores the
 * game's lightmap (ambient base fill + the game's own LooseSprites/Lighting
 * glow textures, tinted exactly like `LightSource.Draw`: texel×tint lerped in
 * by texel alpha), then every pixel is converted to the multiply-overlay
 * approximation of the game's reverse-subtract blend (`255 - stored^2 / 255`
 * per channel).
 *
 * The bake is downsampled to at most `MAX_BAKE_DIMENSION` on the long edge —
 * the lightmap only contains low-frequency content (a flat base and soft
 * glows), so the upscale is invisible next to the pixel-art map.
 */

const MAX_BAKE_DIMENSION = 1024

/** Texture index -> bundled asset URL (the game's own glow textures). */
const LIGHT_GLOW_TEXTURE_URLS: Record<number, string> = {
  1: lanternUrl,
  2: windowLightUrl,
  4: sconceLightUrl,
  6: indoorWindowLightUrl,
}
/** Texture indexes without a bundled texture draw with the sconce shape. */
const FALLBACK_TEXTURE_INDEX = 4

/** Decoded glow textures by texture index; absent until loaded, null on error. */
const textureCache = new Map<number, HTMLImageElement | null>()
/** Tinted glow canvases keyed by `${textureIndex}:${r},${g},${b}` (static assets, never invalidated). */
const tintedTextureCache = new Map<string, HTMLCanvasElement>()
let texturesRequested = false
const textureReadyListeners = new Set<() => void>()

function notifyTexturesReady() {
  for (const listener of textureReadyListeners) {
    listener()
  }
}

/**
 * Starts loading the bundled glow textures (idempotent) and invokes `onReady`
 * whenever one finishes so callers can re-bake with the sharper texture.
 * Returns an unsubscribe function.
 */
export function preloadWorldLightingTextures(onReady: () => void): () => void {
  textureReadyListeners.add(onReady)
  if (!texturesRequested) {
    texturesRequested = true
    for (const [key, url] of Object.entries(LIGHT_GLOW_TEXTURE_URLS)) {
      const textureIndex = Number(key)
      const image = new Image()
      image.onload = () => {
        textureCache.set(textureIndex, image)
        notifyTexturesReady()
      }
      image.onerror = () => {
        textureCache.set(textureIndex, null)
      }
      image.src = url
    }
  }
  return () => {
    textureReadyListeners.delete(onReady)
  }
}

/**
 * Reproduces the game's `texel × tint` draw: multiplies the texture's RGB by
 * the tint while keeping its alpha, via multiply + destination-in passes.
 */
function getTintedGlowTexture(textureIndex: number, image: HTMLImageElement, color: LightingColor): HTMLCanvasElement | null {
  const cacheKey = `${textureIndex}:${color.r},${color.g},${color.b}`
  const cached = tintedTextureCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.drawImage(image, 0, 0)
  context.globalCompositeOperation = 'multiply'
  context.fillStyle = `rgb(${color.r} ${color.g} ${color.b})`
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(image, 0, 0)
  tintedTextureCache.set(cacheKey, canvas)
  return canvas
}

/**
 * Procedural stand-in used until the real texture finishes loading: a radial
 * falloff roughly matching the sconce alpha curve (fading fully to zero —
 * unlike a hard-edged disc).
 */
function drawFallbackGlow(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: LightingColor,
) {
  context.save()
  context.translate(centerX, centerY)
  context.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY))
  const radius = Math.max(radiusX, radiusY)
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius)
  const rgb = `${color.r} ${color.g} ${color.b}`
  gradient.addColorStop(0, `rgb(${rgb} / 0.85)`)
  gradient.addColorStop(0.25, `rgb(${rgb} / 0.7)`)
  gradient.addColorStop(0.5, `rgb(${rgb} / 0.4)`)
  gradient.addColorStop(0.75, `rgb(${rgb} / 0.09)`)
  gradient.addColorStop(0.9, `rgb(${rgb} / 0)`)
  gradient.addColorStop(1, `rgb(${rgb} / 0)`)
  context.fillStyle = gradient
  context.fillRect(-radius, -radius, radius * 2, radius * 2)
  context.restore()
}

/** Bakes the overlay canvas; null when the state produces no darkening at all. */
export function bakeWorldLightingCanvas(worldWidthPx: number, worldHeightPx: number, state: WorldLightingState): HTMLCanvasElement | null {
  if (worldWidthPx <= 0 || worldHeightPx <= 0) {
    return null
  }
  const baseColor = state.baseColor ?? { r: 0, g: 0, b: 0 }
  if (!state.baseColor && state.glows.length === 0) {
    return null
  }

  const scale = Math.min(1, MAX_BAKE_DIMENSION / Math.max(worldWidthPx, worldHeightPx))
  const width = Math.max(1, Math.round(worldWidthPx * scale))
  const height = Math.max(1, Math.round(worldHeightPx * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.fillStyle = `rgb(${baseColor.r} ${baseColor.g} ${baseColor.b})`
  context.fillRect(0, 0, width, height)

  // Source-over with the texture alpha matches the game's non-premultiplied
  // lerp toward texel×tint.
  for (const glow of state.glows) {
    const size = getLightingGlowTextureSize(glow.textureIndex)
    const drawWidth = Math.max(1, size.widthPx * glow.scale * scale)
    const drawHeight = Math.max(1, size.heightPx * glow.scale * scale)
    const centerX = glow.worldX * scale
    const centerY = glow.worldY * scale
    const image = textureCache.get(glow.textureIndex) ?? textureCache.get(FALLBACK_TEXTURE_INDEX)
    const tinted = image ? getTintedGlowTexture(glow.textureIndex, image, glow.color) : null
    if (tinted) {
      context.drawImage(tinted, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight)
    } else {
      drawFallbackGlow(context, centerX, centerY, drawWidth / 2, drawHeight / 2, glow.color)
    }
  }

  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  for (let index = 0; index < data.length; index += 4) {
    data[index] = computeLightingOverlayChannel(data[index] ?? 0)
    data[index + 1] = computeLightingOverlayChannel(data[index + 1] ?? 0)
    data[index + 2] = computeLightingOverlayChannel(data[index + 2] ?? 0)
    data[index + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas
}
