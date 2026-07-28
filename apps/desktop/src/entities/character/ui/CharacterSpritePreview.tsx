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
  const sourceX = (currentFrame % spriteColumns) * frameWidth
  const sourceY = Math.floor(currentFrame / spriteColumns) * frameHeight

  return (
    <div className="rounded-3xl bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] p-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_72%,transparent)]">
      <div className="panel-canvas-soft flex min-h-34 items-center justify-center border-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_82%,transparent),color-mix(in_srgb,var(--bg-panel-muted)_96%,var(--bg-panel)))]">
        <div
          style={buildSpriteStyle({
            url: spriteUrl,
            sheetWidth: spriteSheetWidth,
            sheetHeight: spriteSheetHeight,
            sourceX,
            sourceY,
            width: frameWidth,
            height: frameHeight,
          })}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {frames.map((frame, index) => (
          <span
            key={`${frame}:${index}`}
            className={cx('h-1.5 w-5 rounded-full transition-colors', index === frameIndex ? 'bg-(--accent)' : 'bg-(--border-color)')}
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
        className="flex shrink-0 items-center justify-center rounded-lg bg-(--bg-panel-muted) text-xs font-bold text-(--text-tertiary)"
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
        sourceX: 0,
        sourceY: 0,
        width: metrics.frameWidth,
        height: metrics.frameHeight,
        scale,
      })}
      aria-hidden="true"
    />
  )
}

/** Derives frame geometry from an entry and the sheet that actually loaded. */
export function resolveCharacterSpriteMetrics(
  character: Pick<CharacterWorkspaceEntry, 'spriteWidth' | 'spriteHeight'> | null,
  assetState: CharacterVisualAssetState,
  minFrameHeight = 32,
): CharacterSpriteMetrics {
  const frameWidth = character?.spriteWidth ?? 16
  const frameHeight = character ? Math.max(character.spriteHeight, minFrameHeight) : minFrameHeight
  const spriteColumns =
    assetState.spriteSheetWidth && assetState.spriteSheetWidth >= frameWidth
      ? Math.max(1, Math.floor(assetState.spriteSheetWidth / frameWidth))
      : 4
  return { frameWidth, frameHeight, spriteColumns }
}
