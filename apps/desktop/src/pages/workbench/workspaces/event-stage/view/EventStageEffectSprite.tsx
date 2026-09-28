import { useRef } from 'react'
import { EFFECT_VIEWPORT_BASE_HEIGHT, EFFECT_VIEWPORT_BASE_WIDTH, getStageEffectPlayback, getStageEffectSortValue } from '@entities/event'
import type { EffectAssetState, StageEffectState } from '@entities/event'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { useEventStageAnimationEffect } from '../state/eventStageAnimationClock'

type EventStageWorldEffectSpriteProps = {
  effect: StageEffectState
  asset: EffectAssetState | undefined
  gamePixelScale: number
  viewportZoom: number
}

/**
 * Single-texture stage effect. Per-frame playback (frame index, motion, scale,
 * opacity, visibility) is applied imperatively from the animation clock; React
 * only renders the two static wrapper divs per transition.
 */
export function EventStageWorldEffectSprite({ effect, asset, gamePixelScale, viewportZoom }: EventStageWorldEffectSpriteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  useEventStageAnimationEffect((nowMs) => {
    const container = containerRef.current
    const frame = frameRef.current
    if (!container || !frame) {
      return
    }
    const playback = getStageEffectPlayback(effect, nowMs)
    if (!playback.visible || !asset?.url) {
      container.style.display = 'none'
      return
    }
    container.style.display = ''
    const frameX = effect.sourceX + playback.frameIndex * effect.sourceWidth
    const pixelX = (effect.baseX + playback.offsetX) * gamePixelScale * viewportZoom
    const pixelY = (effect.baseY + playback.offsetY) * gamePixelScale * viewportZoom
    const width = effect.sourceWidth * playback.scale * gamePixelScale * viewportZoom
    const height = effect.sourceHeight * playback.scale * gamePixelScale * viewportZoom
    container.style.transform = `translate(${pixelX}px, ${pixelY}px)`
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    container.style.zIndex = String(getStageEffectSortValue(effect))
    container.style.opacity = String(playback.opacity)
    frame.style.transform = effect.flip
      ? `translateX(${width}px) scale(${-width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
      : `scale(${width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
    frame.style.backgroundPosition = `-${frameX}px -${effect.sourceY}px`
  })

  if (asset?.loading) {
    const width = effect.sourceWidth * gamePixelScale * viewportZoom
    const height = effect.sourceHeight * gamePixelScale * viewportZoom
    return (
      <div
        className="absolute"
        style={{
          transform: `translate(${effect.baseX * gamePixelScale * viewportZoom}px, ${effect.baseY * gamePixelScale * viewportZoom}px)`,
          width: `${width}px`,
          height: `${height}px`,
          zIndex: getStageEffectSortValue(effect),
        }}
      >
        <ImageSkeleton overlay rounded={false} />
      </div>
    )
  }
  if (!asset?.url) {
    return null
  }

  return (
    <div ref={containerRef} className="absolute" style={{ display: 'none' }}>
      <div
        ref={frameRef}
        style={{
          width: `${effect.sourceWidth}px`,
          height: `${effect.sourceHeight}px`,
          transformOrigin: 'top left',
          backgroundImage: `url("${asset.url}")`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          filter: effect.color ? `drop-shadow(0 0 10px ${effect.color})` : undefined,
        }}
      />
    </div>
  )
}

type EventStageScreenEffectSpriteProps = {
  effect: StageEffectState
  asset: EffectAssetState | undefined
}

export function EventStageScreenEffectSprite({ effect, asset }: EventStageScreenEffectSpriteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  useEventStageAnimationEffect((nowMs) => {
    const container = containerRef.current
    const frame = frameRef.current
    if (!container || !frame) {
      return
    }
    const playback = getStageEffectPlayback(effect, nowMs)
    if (!playback.visible || !asset?.url) {
      container.style.display = 'none'
      return
    }
    container.style.display = ''
    const frameX = effect.sourceX + playback.frameIndex * effect.sourceWidth
    const width = effect.sourceWidth * playback.scale
    const height = effect.sourceHeight * playback.scale
    container.style.left = `${((effect.baseX + playback.offsetX) / EFFECT_VIEWPORT_BASE_WIDTH) * 100}%`
    container.style.top = `${((effect.baseY + playback.offsetY) / EFFECT_VIEWPORT_BASE_HEIGHT) * 100}%`
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    container.style.zIndex = String(getStageEffectSortValue(effect))
    container.style.opacity = String(playback.opacity)
    frame.style.transform = effect.flip
      ? `translateX(${width}px) scale(${-width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
      : `scale(${width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
    frame.style.backgroundPosition = `-${frameX}px -${effect.sourceY}px`
  })

  if (asset?.loading) {
    const width = effect.sourceWidth
    const height = effect.sourceHeight
    return (
      <div
        className="absolute"
        style={{
          left: `${(effect.baseX / EFFECT_VIEWPORT_BASE_WIDTH) * 100}%`,
          top: `${(effect.baseY / EFFECT_VIEWPORT_BASE_HEIGHT) * 100}%`,
          width: `${width}px`,
          height: `${height}px`,
          zIndex: getStageEffectSortValue(effect),
        }}
      >
        <ImageSkeleton overlay rounded={false} />
      </div>
    )
  }
  if (!asset?.url) {
    return null
  }

  return (
    <div ref={containerRef} className="absolute" style={{ display: 'none' }}>
      <div
        ref={frameRef}
        style={{
          width: `${effect.sourceWidth}px`,
          height: `${effect.sourceHeight}px`,
          transformOrigin: 'top left',
          backgroundImage: `url("${asset.url}")`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          filter: effect.color ? `drop-shadow(0 0 12px ${effect.color})` : undefined,
        }}
      />
    </div>
  )
}
