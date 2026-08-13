/**
 * Animated character previews shared by the codex and the authoring page.
 *
 * Both surfaces show the same thing — a looping walk cycle per facing and the
 * idle breathing overlay the game applies to NPC sprites — so the animation
 * timing, the frame table lookup and the breathing descriptor live here once.
 * Everything is driven from a `CharacterWorkspaceEntry`, which the codex builds
 * from the vanilla index and the editor builds from the entry being drafted.
 */

import { memo, useEffect, useState } from 'react'
import { buildActorBreathingLayerDescriptor, getActorWalkAnimationState, type EventActorState } from '@entities/event'
import { useCharactersCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { buildAbsoluteSpriteLayerStyle, buildSpriteStyle } from '../lib/characterSprites'
import type { CharacterAppearanceVariant, CharacterVisualAssetState, CharacterWorkspaceEntry } from '../model/characterIndex'

/** The four facings in the order the game numbers them, top-left reading order. */
export const CHARACTER_WALK_DIRECTIONS = [
  { id: 'down', direction: 2 },
  { id: 'left', direction: 3 },
  { id: 'right', direction: 1 },
  { id: 'up', direction: 0 },
] as const

const WALK_FRAME_DURATION_MS = 180

/** Frame geometry every preview needs; derived from the entry and its sheet. */
export type CharacterSpriteMetrics = {
  frameWidth: number
  frameHeight: number
  spriteColumns: number
  /** Source rectangle to show as the thumbnail; falls back to the first sprite. */
  sourceX: number
  sourceY: number
  width: number
  height: number
}

function createPreviewActor(character: CharacterWorkspaceEntry): EventActorState {
  return {
    id: `${character.key}:preview`,
    actorName: character.internalName,
    tileX: 0,
    tileY: 0,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    facingDirection: 2,
    frame: 0,
    directionalFlip: false,
    portraitOverrideSuffix: null,
    spriteOverrideSuffix: null,
    animation: null,
    movement: null,
    breatherOverride: character.breather,
    shakeStartedAtMs: null,
    shakeDurationMs: 0,
    farmerPassesThrough: false,
    farmerRenderState: null,
  }
}

function WalkCycleTile({
  frameWidth,
  frameHeight,
  spriteColumns,
  sourceX,
  sourceY,
  spriteUrl,
  spriteSheetWidth,
  spriteSheetHeight,
  frames,
}: CharacterSpriteMetrics & {
  spriteUrl: string
  spriteSheetWidth: number
  spriteSheetHeight: number
  frames: number[]
}) {
  const frameSequenceKey = frames.join(',')
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    let frameId = 0
    let intervalId: number | null = null

    frameId = window.requestAnimationFrame(() => {
      setFrameIndex(0)

      if (frames.length <= 1) {
        return
      }

      intervalId = window.setInterval(() => {
        setFrameIndex((currentFrameIndex) => (currentFrameIndex + 1) % frames.length)
      }, WALK_FRAME_DURATION_MS)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      if (intervalId != null) {
        window.clearInterval(intervalId)
      }
    }
  }, [frameSequenceKey, frames.length])

  const currentFrame = frames[frameIndex] ?? frames[0] ?? 0
  const frameX = (currentFrame % spriteColumns) * frameWidth
  const frameY = Math.floor(currentFrame / spriteColumns) * frameHeight

  return (
    <div className="rounded-3xl bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] p-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_72%,transparent)]">
      <div className="panel-canvas-soft flex min-h-34 items-center justify-center border-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_82%,transparent),color-mix(in_srgb,var(--bg-panel-muted)_96%,var(--bg-panel)))]">
        <div
          style={buildSpriteStyle({
            url: spriteUrl,
            sheetWidth: spriteSheetWidth,
            sheetHeight: spriteSheetHeight,
            sourceX: sourceX + frameX,
            sourceY: sourceY + frameY,
            width: frameWidth,
            height: frameHeight,
          })}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {frames.map((frame, index) => (
          <span
            key={`${frame}:${index}`}
            className={cx('h-1.5 w-5 rounded-full transition-colors', index === frameIndex ? 'bg-accent' : 'bg-border-subtle')}
          />
        ))}
      </div>
    </div>
  )
}

/** One looping walk cycle, animated on an interval and paged by frame dots. */
export const CharacterWalkCycleTile = memo(WalkCycleTile)

/**
 * Every facing at once, or the sprite-missing placeholder when the sheet has
 * not resolved. `scale` shrinks the tile grid for narrow rails.
 */
export function CharacterWalkCycleGrid({
  character,
  assetState,
  metrics,
  className,
}: {
  character: CharacterWorkspaceEntry
  assetState: CharacterVisualAssetState
  metrics: CharacterSpriteMetrics
  className?: string
}) {
  const copy = useCharactersCopy()
  const { spriteUrl, spriteSheetWidth, spriteSheetHeight } = assetState

  if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
    return <div className="panel-canvas-empty min-h-55">{copy.spriteMissing}</div>
  }

  return (
    <div className={cx('grid gap-2.5 sm:grid-cols-2', className)}>
      {CHARACTER_WALK_DIRECTIONS.map(({ id, direction }) => (
        <CharacterWalkCycleTile
          key={id}
          frameWidth={metrics.frameWidth}
          frameHeight={metrics.frameHeight}
          spriteColumns={metrics.spriteColumns}
          sourceX={metrics.sourceX}
          sourceY={metrics.sourceY}
          width={metrics.width}
          height={metrics.height}
          spriteUrl={spriteUrl}
          spriteSheetWidth={spriteSheetWidth}
          spriteSheetHeight={spriteSheetHeight}
          frames={getActorWalkAnimationState(character.internalName, direction).frames}
        />
      ))}
    </div>
  )
}

/**
 * The idle sprite with the game's breathing overlay composited on top, redrawn
 * on every animation frame. `scale` is the integer zoom of the pixel art.
 */
export const CharacterBreathingCanvas = memo(function CharacterBreathingCanvas({
  character,
  activeVariant,
  assetState,
  metrics,
  scale = 6,
}: {
  character: CharacterWorkspaceEntry
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
  metrics: CharacterSpriteMetrics
  scale?: number
}) {
  const copy = useCharactersCopy()
  const { frameWidth, frameHeight, spriteColumns } = metrics
  const { spriteUrl, spriteSheetWidth, spriteSheetHeight, spritePath, portraitPath, portraitUrl, portraitSheetWidth, portraitSheetHeight } =
    assetState
  const activeVariantKey = activeVariant?.key ?? 'default'
  const variantSpriteName = activeVariant?.spriteAssetName ?? character.spriteAssetName
  const variantPortraitName = activeVariant?.portraitAssetName ?? character.portraitAssetName
  const [nowMs, setNowMs] = useState(() => performance.now())

  useEffect(() => {
    if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
      return
    }

    let frameId = 0

    const tick = (nextNowMs: number) => {
      setNowMs(nextNowMs)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [spriteSheetHeight, spriteSheetWidth, spriteUrl])

  if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
    return <div className="panel-canvas-empty h-full min-h-90">{copy.spriteMissing}</div>
  }

  const breathSeed = character.internalName.split('').reduce((sum, part) => sum + part.charCodeAt(0), 0)
  const breathingScale = 1 + Math.max(0, Math.ceil(Math.sin(nowMs / 600 + breathSeed)) / 16)
  const breathingLayer = buildActorBreathingLayerDescriptor(
    {
      requestKey: `${character.key}:${activeVariantKey}`,
      textureName: character.textureName,
      spriteTextureName: variantSpriteName,
      portraitTextureName: variantPortraitName,
      spritePath,
      spriteUrl,
      spriteSheetWidth,
      spriteSheetHeight,
      portraitPath,
      portraitUrl,
      portraitSheetWidth,
      portraitSheetHeight,
      farmerAppearance: null,
      characterMetadata: {
        textureName: character.textureName,
        breather: character.breather,
        breathChestRect: character.breathChestRect,
        breathChestPosition: character.breathChestPosition,
        age: character.age,
        gender: character.gender,
        size: { x: character.spriteWidth, y: character.spriteHeight },
      },
    },
    createPreviewActor(character),
    0,
    frameWidth,
    frameHeight,
    spriteColumns,
    nowMs,
    breathingScale,
    null,
  )

  return (
    <div className="panel-canvas relative flex h-full min-h-90 items-center justify-center">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        className="relative flex items-center justify-center"
        style={{
          width: `${frameWidth * (scale + 8)}px`,
          height: `${frameHeight * (scale + 4)}px`,
        }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: `${frameWidth}px`,
            height: `${frameHeight}px`,
            marginLeft: `${-frameWidth / 2}px`,
            marginTop: `${-frameHeight / 2}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <div
            className="absolute top-0 left-0"
            style={buildAbsoluteSpriteLayerStyle({
              url: spriteUrl,
              sheetWidth: spriteSheetWidth,
              sheetHeight: spriteSheetHeight,
              sourceX: 0,
              sourceY: 0,
              width: frameWidth,
              height: frameHeight,
            })}
          />
          {breathingLayer ? (
            <div
              className="absolute"
              style={{
                left: `${breathingLayer.offsetX}px`,
                top: `${breathingLayer.offsetY}px`,
                ...buildAbsoluteSpriteLayerStyle({
                  url: spriteUrl,
                  sheetWidth: spriteSheetWidth,
                  sheetHeight: spriteSheetHeight,
                  sourceX: breathingLayer.sourceX,
                  sourceY: breathingLayer.sourceY,
                  width: breathingLayer.width,
                  height: breathingLayer.height,
                }),
                transform: `scale(${breathingLayer.scaleX ?? 1}, ${breathingLayer.scaleY ?? 1})`,
                transformOrigin: breathingLayer.transformOrigin ?? 'top left',
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})

/** Single static frame, used for list thumbnails. */
export function CharacterSpriteThumbnail({
  assetState,
  metrics,
  scale = 2,
  fallbackText,
}: {
  assetState: CharacterVisualAssetState
  metrics: CharacterSpriteMetrics
  scale?: number
  fallbackText: string
}) {
  const { spriteUrl, spriteSheetWidth, spriteSheetHeight } = assetState

  if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
    return (
      <span
        className="bg-surface-panel-muted text-text-tertiary flex shrink-0 items-center justify-center rounded-lg text-xs font-bold"
        style={{ width: `${metrics.frameWidth * scale}px`, height: `${metrics.frameHeight * scale}px` }}
        aria-hidden="true"
      >
        {fallbackText}
      </span>
    )
  }

  return (
    <span
      className="block shrink-0"
      style={buildSpriteStyle({
        url: spriteUrl,
        sheetWidth: spriteSheetWidth,
        sheetHeight: spriteSheetHeight,
        sourceX: metrics.sourceX,
        sourceY: metrics.sourceY,
        width: metrics.width,
        height: metrics.height,
        scale,
      })}
      aria-hidden="true"
    />
  )
}

/** Alpha bounding box of a single frame region, relative to that frame's top-left. */
type AlphaBounds = { left: number; right: number; top: number; bottom: number } | null

/** Pre-sampled alpha bounds for the frames the width inference algorithm needs. */
export type SpriteFrameInferenceBounds = {
  frame0: AlphaBounds
  frame1: AlphaBounds
}

/**
 * Infers the real frame width by detecting "complementary" frames — sprite art
 * that spans two nominal cells (e.g. Bear, whose `Size.X` is 16 but whose art
 * is 32px wide). When frame0's right edge touches the cell boundary, frame1's
 * left edge starts at 0, and the cells are halves rather than full frames, the
 * art is split across two cells and the frame width is doubled. Pure: callers
 * supply pre-sampled alpha bounds so this is fully testable without a DOM.
 */
export function inferSpriteFrameGrid(
  sheetWidth: number,
  baseWidth: number,
  baseHeight: number,
  bounds: SpriteFrameInferenceBounds,
): { frameWidth: number; frameHeight: number } {
  let frameWidth = baseWidth
  let frameHeight = baseHeight

  // Width: try doubling up to 2 times (covers 16→32, and theoretically 16→48).
  // Stricter than a pure edge touch: the first cell must be the right half
  // (doesn't fill from the left) and the second cell must be the left half
  // (doesn't fill to the right). This avoids treating normal 16px frames as
  // a Bear-style split sprite.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (sheetWidth % (frameWidth * 2) !== 0) break
    const f0 = bounds.frame0
    const f1 = bounds.frame1
    if (!f0 || !f1) break
    const isRightHalf = f0.right === frameWidth - 1 && f0.left >= 1
    const isLeftHalf = f1.left === 0 && f1.right <= frameWidth - 2
    if (!isRightHalf || !isLeftHalf) break
    frameWidth *= 2
  }

  return { frameWidth, frameHeight }
}

/**
 * Samples alpha-channel bounding boxes for the frames the inference algorithm
 * needs. Uses an offscreen canvas; safe because character images load as data
 * URLs which do not taint the canvas. Results are cached per URL+dimensions so
 * the render path only samples once per unique sprite sheet.
 */
const frameInferenceCache = new Map<string, SpriteFrameInferenceBounds>()

function sampleAlphaBounds(image: HTMLImageElement, originX: number, originY: number, w: number, h: number): AlphaBounds {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, originX, originY, w, h, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let left = w
  let right = -1
  let top = h
  let bottom = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return null
  return { left, right, top, bottom }
}

function sampleSpriteFrameInferenceBounds(
  image: HTMLImageElement,
  sheetWidth: number,
  sheetHeight: number,
  baseWidth: number,
  baseHeight: number,
): SpriteFrameInferenceBounds {
  const cacheKey = `${image.src}::${sheetWidth}x${sheetHeight}::${baseWidth}x${baseHeight}`
  const cached = frameInferenceCache.get(cacheKey)
  if (cached) return cached

  const frame0 = sampleAlphaBounds(image, 0, 0, baseWidth, baseHeight)
  const frame1 = sampleAlphaBounds(image, baseWidth, 0, baseWidth, baseHeight)
  const result: SpriteFrameInferenceBounds = { frame0, frame1 }
  frameInferenceCache.set(cacheKey, result)
  return result
}

/**
 * Resolves frame width, height and column count from a sprite sheet, using
 * pixel-based inference when an image is available to detect sprites that span
 * multiple nominal cells (e.g. Bear). Falls back to `Size` when no image is
 * available. Exported so the event stage can share the same inference logic.
 */
export function resolveSpriteFrameGeometry(
  baseWidth: number,
  baseHeight: number,
  sheetWidth: number | null,
  sheetHeight: number | null,
  spriteImage: HTMLImageElement | null | undefined,
): { frameWidth: number; frameHeight: number; spriteColumns: number } {
  let frameWidth = baseWidth
  let frameHeight = baseHeight

  if (spriteImage && sheetWidth && sheetHeight && sheetWidth >= baseWidth && sheetHeight >= baseHeight) {
    const bounds = sampleSpriteFrameInferenceBounds(spriteImage, sheetWidth, sheetHeight, baseWidth, baseHeight)
    const inferred = inferSpriteFrameGrid(sheetWidth, baseWidth, baseHeight, bounds)
    frameWidth = inferred.frameWidth
    frameHeight = inferred.frameHeight
  }

  // If the sheet doesn't divide evenly, pick the smallest standard size that does.
  if (sheetWidth && sheetWidth % frameWidth !== 0) {
    for (const candidate of [16, 24, 32] as const) {
      if (sheetWidth % candidate === 0) {
        frameWidth = candidate
        break
      }
    }
  }

  const spriteColumns = sheetWidth && sheetWidth >= frameWidth ? Math.max(1, Math.floor(sheetWidth / frameWidth)) : 4

  return { frameWidth, frameHeight, spriteColumns }
}

/** Derives frame geometry from an entry and the sheet that actually loaded. */
export function resolveCharacterSpriteMetrics(
  character: Pick<CharacterWorkspaceEntry, 'spriteWidth' | 'spriteHeight'> | null,
  assetState: CharacterVisualAssetState,
  defaultFrameHeight = 32,
): CharacterSpriteMetrics {
  const baseWidth = character?.spriteWidth ?? 16
  const baseHeight = character?.spriteHeight ?? defaultFrameHeight
  const { frameWidth, frameHeight, spriteColumns } = resolveSpriteFrameGeometry(
    baseWidth,
    baseHeight,
    assetState.spriteSheetWidth,
    assetState.spriteSheetHeight,
    assetState.spriteImage,
  )

  return {
    frameWidth,
    frameHeight,
    spriteColumns,
    sourceX: 0,
    sourceY: 0,
    width: frameWidth,
    height: frameHeight,
  }
}
