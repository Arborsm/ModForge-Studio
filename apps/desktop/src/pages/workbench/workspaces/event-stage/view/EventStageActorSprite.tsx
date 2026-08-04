import { useRef } from 'react'
import {
  buildActorBreathingLayerDescriptor,
  buildSpriteLayerDescriptors,
  getActorRenderState,
  normalizeActorName,
  type ActorAssetState,
  type EventActorState,
  type SpriteLayerDescriptor,
} from '@entities/event'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { loadImageResource } from '@shared/lib/assets'
import { getEventStageAnimationNow, useEventStageAnimationEffect } from '../state/eventStageAnimationClock'

type EventStageActorSpriteProps = {
  actor: EventActorState
  asset: ActorAssetState | undefined
  frameWidth: number
  frameHeight: number
  spriteColumns: number
  tileWidth: number
  tileHeight: number
  gamePixelScale: number
  viewportZoom: number
  showFallbackLabel?: boolean
}

type SpriteImageCache = Map<string, HTMLImageElement | 'pending'>

/** Parses a CSS transform-origin (`left top` / `50% 50%` / `8px 2px`) into layer-local pixels. */
function parseTransformOrigin(origin: string | undefined, width: number, height: number): [number, number] {
  if (!origin) {
    return [0, 0]
  }
  const resolve = (token: string, size: number, keywords: Record<string, number>) => {
    const normalized = token.trim().toLowerCase()
    if (normalized in keywords) {
      return keywords[normalized]!
    }
    if (normalized.endsWith('%')) {
      return (Number.parseFloat(normalized) / 100) * size
    }
    const px = Number.parseFloat(normalized)
    return Number.isFinite(px) ? px : 0
  }
  const [x = 'left', y = 'top'] = origin.split(/\s+/)
  return [
    resolve(x, width, { left: 0, center: width / 2, right: width }),
    resolve(y, height, { top: 0, center: height / 2, bottom: height }),
  ]
}

function resolveSpriteImage(url: string, images: SpriteImageCache, onReady: () => void) {
  const cached = images.get(url)
  if (cached instanceof HTMLImageElement) {
    return cached
  }
  if (cached === 'pending') {
    return null
  }
  images.set(url, 'pending')
  void loadImageResource(url).then(
    (resource) => {
      images.set(url, resource.image)
      onReady()
    },
    () => {
      images.delete(url)
    },
  )
  return null
}

/** Mirrors the retired CSS layering: origin translation, then flip/scale/rotate in CSS order. */
function drawSpriteLayer(context: CanvasRenderingContext2D, layer: SpriteLayerDescriptor, images: SpriteImageCache, onReady: () => void) {
  const alpha = layer.opacity ?? 1
  if (alpha <= 0) {
    return
  }
  context.save()
  context.globalAlpha = alpha
  const [originX, originY] = parseTransformOrigin(layer.transformOrigin, layer.width, layer.height)
  context.translate(layer.offsetX + originX, layer.offsetY + originY)
  if (layer.flip) {
    context.translate(layer.width, 0)
    context.scale(-1, 1)
  }
  if (layer.scaleX != null || layer.scaleY != null) {
    context.scale(layer.scaleX ?? 1, layer.scaleY ?? 1)
  }
  if (layer.rotation != null) {
    context.rotate(layer.rotation)
  }
  context.translate(-originX, -originY)

  const image = layer.url ? resolveSpriteImage(layer.url, images, onReady) : null
  if (image) {
    context.drawImage(image, layer.sourceX, layer.sourceY, layer.width, layer.height, 0, 0, layer.width, layer.height)
  } else if (layer.backgroundColor) {
    context.fillStyle = layer.backgroundColor
    context.fillRect(0, 0, layer.width, layer.height)
  }
  context.restore()
}

/**
 * Actor sprite rendered on a tiny native-resolution canvas. Per-frame updates
 * (position, frame index, breathing, shakes) are drawn imperatively from the
 * animation clock — React only re-renders on playback transitions, never per
 * frame, no matter how many sprite layers the actor has.
 */
export function EventStageActorSprite({
  actor,
  asset,
  frameWidth,
  frameHeight,
  spriteColumns,
  tileWidth,
  tileHeight,
  gamePixelScale,
  viewportZoom,
  showFallbackLabel = false,
}: EventStageActorSpriteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imagesRef = useRef<SpriteImageCache>(new Map())

  const actorWidth = tileWidth * (frameWidth / 16) * viewportZoom
  const actorHeight = tileHeight * (frameHeight / 16) * viewportZoom

  function applyFrame(nowMs: number) {
    const container = containerRef.current
    if (!container) {
      return
    }
    const renderState = getActorRenderState(actor, nowMs)
    const pixelX =
      renderState.tileX * tileWidth * viewportZoom +
      renderState.offsetX * gamePixelScale * viewportZoom +
      renderState.shakeOffsetX * viewportZoom
    const pixelY =
      renderState.tileY * tileHeight * viewportZoom +
      (renderState.offsetY + renderState.breathingOffsetY) * gamePixelScale * viewportZoom +
      renderState.shakeOffsetY * viewportZoom -
      tileHeight * (frameHeight / 16 - 1) * viewportZoom
    container.style.transform = `translate(${Math.round(pixelX)}px, ${Math.round(pixelY)}px)`
    container.style.zIndex = String(Math.round(renderState.tileY * 100) + 50)

    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const spriteScale = Math.max(1, actorWidth / frameWidth)
    canvas.style.transform = asset?.farmerAppearance
      ? `scale(${spriteScale}, ${spriteScale})`
      : renderState.flip
        ? `translateX(${actorWidth}px) scale(${-spriteScale}, ${spriteScale})`
        : `scale(${spriteScale}, ${spriteScale})`

    // The canvas element is recreated when the sprite branch flips (loading →
    // sprite → fallback), so the 2d context is fetched per frame instead of cached.
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, frameWidth, frameHeight)
    context.imageSmoothingEnabled = false
    const redrawWhenReady = () => applyFrame(getEventStageAnimationNow())
    const layers = buildSpriteLayerDescriptors(
      asset,
      renderState.frame,
      renderState.facingDirection,
      frameWidth,
      frameHeight,
      spriteColumns,
      renderState.directionalFlip,
      renderState.farmerRenderState,
      renderState.bodyFlip,
    )
    for (const layer of layers) {
      drawSpriteLayer(context, layer, imagesRef.current, redrawWhenReady)
    }
    const breathingLayer = buildActorBreathingLayerDescriptor(
      asset,
      actor,
      renderState.frame,
      frameWidth,
      frameHeight,
      spriteColumns,
      nowMs,
      renderState.breathingScale,
      renderState.farmerRenderState,
    )
    if (breathingLayer) {
      drawSpriteLayer(context, breathingLayer, imagesRef.current, redrawWhenReady)
    }
  }

  useEventStageAnimationEffect(applyFrame)

  if (asset?.loading) {
    return (
      <div
        ref={containerRef}
        className="absolute"
        data-event-stage-actor={normalizeActorName(actor.actorName)}
        style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}
      >
        <ImageSkeleton overlay rounded={false} />
      </div>
    )
  }

  const hasSprite = Boolean(asset?.spriteUrl ?? asset?.farmerAppearance)
  return (
    <div
      ref={containerRef}
      className="absolute"
      data-event-stage-actor={normalizeActorName(actor.actorName)}
      style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}
    >
      {hasSprite ? (
        <div className="relative overflow-visible" style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}>
          <canvas
            ref={canvasRef}
            width={frameWidth}
            height={frameHeight}
            data-event-stage-actor-sprite={normalizeActorName(actor.actorName)}
            style={{ transformOrigin: 'top left', imageRendering: 'pixelated' }}
          />
        </div>
      ) : showFallbackLabel ? (
        <div className="flex h-full w-full items-end justify-center">
          <div className="rounded-full border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-primary) uppercase shadow-(--shadow-panel)">
            {normalizeActorName(actor.actorName)}
          </div>
        </div>
      ) : (
        <div className="h-full w-full" />
      )}
    </div>
  )
}
