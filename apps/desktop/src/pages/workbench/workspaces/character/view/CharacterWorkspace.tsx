import { memo, useEffect, useState } from 'react'
import { buildActorBreathingLayerDescriptor, getActorSpriteFrameHeight } from '@entities/event'
import { getActorWalkAnimationState, type EventActorState } from '@entities/event'
import {
  type CharacterAppearanceVariant,
  type CharacterGiftGroup,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '../entities/character'
import { useCharactersCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getScaleUpFrameCount, getScaleUpFramePreviewMetrics } from '@pages/workbench/workspaces/mod'
import { CharacterGiftTasteSection, type GiftTone } from './CharacterGiftTasteSection'
import { buildAbsoluteSpriteLayerStyle, buildSpriteStyle } from './characterSpriteStyles'

type CharacterWorkspaceProps = {
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
}

const WALK_DIRECTIONS = [
  { id: 'down', direction: 2 },
  { id: 'left', direction: 3 },
  { id: 'right', direction: 1 },
  { id: 'up', direction: 0 },
] as const

const WALK_FRAME_DURATION_MS = 180
const BREATHING_PREVIEW_SCALE = 6
const PORTRAIT_PREVIEW_SCALE = 2

function createMockActor(character: CharacterWorkspaceEntry): EventActorState {
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

function WalkCyclePreviewTile({
  frameWidth,
  frameHeight,
  spriteColumns,
  spriteUrl,
  spriteSheetWidth,
  spriteSheetHeight,
  frames,
}: {
  frameWidth: number
  frameHeight: number
  spriteColumns: number
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

const MemoizedWalkCyclePreviewTile = memo(WalkCyclePreviewTile)

const BreathingPreviewCanvas = memo(function BreathingPreviewCanvas({
  character,
  activeVariant,
  assetState,
  frameWidth,
  frameHeight,
  spriteColumns,
}: {
  character: CharacterWorkspaceEntry
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
  frameWidth: number
  frameHeight: number
  spriteColumns: number
}) {
  const copy = useCharactersCopy()
  const spriteUrl = assetState.spriteUrl
  const spriteSheetWidth = assetState.spriteSheetWidth
  const spriteSheetHeight = assetState.spriteSheetHeight
  const spritePath = assetState.spritePath
  const portraitPath = assetState.portraitPath
  const portraitUrl = assetState.portraitUrl
  const portraitSheetWidth = assetState.portraitSheetWidth
  const portraitSheetHeight = assetState.portraitSheetHeight
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

  const breathingLayer = (() => {
    if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
      return null
    }

    const breathSeed = character.internalName.split('').reduce((sum, part) => sum + part.charCodeAt(0), 0)
    const breathingScale = 1 + Math.max(0, Math.ceil(Math.sin(nowMs / 600 + breathSeed)) / 16)

    return buildActorBreathingLayerDescriptor(
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
      createMockActor(character),
      0,
      frameWidth,
      frameHeight,
      spriteColumns,
      nowMs,
      breathingScale,
      null,
    )
  })()

  if (!spriteUrl || !spriteSheetWidth || !spriteSheetHeight) {
    return <div className="panel-canvas-empty h-full min-h-90">{copy.spriteMissing}</div>
  }

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
      <div className="absolute inset-x-6 bottom-6 h-14 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] blur-xl" />
      <div
        className="relative flex items-center justify-center"
        style={{
          width: `${frameWidth * (BREATHING_PREVIEW_SCALE + 8)}px`,
          height: `${frameHeight * (BREATHING_PREVIEW_SCALE + 4)}px`,
        }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: `${frameWidth}px`,
            height: `${frameHeight}px`,
            marginLeft: `${-frameWidth / 2}px`,
            marginTop: `${-frameHeight / 2}px`,
            transform: `scale(${BREATHING_PREVIEW_SCALE})`,
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

export default function CharacterWorkspace({ character, activeVariant, assetState }: CharacterWorkspaceProps) {
  const copy = useCharactersCopy()
  const frameWidth = character?.spriteWidth ?? 16
  const frameHeight = character ? Math.max(character.spriteHeight, getActorSpriteFrameHeight(character.internalName)) : 32
  const spriteColumns =
    assetState.spriteSheetWidth && assetState.spriteSheetWidth >= frameWidth
      ? Math.max(1, Math.floor(assetState.spriteSheetWidth / frameWidth))
      : 4
  const portraitFrameImages = {
    resultImage:
      assetState.portraitSheetWidth && assetState.portraitSheetHeight
        ? {
            width: assetState.portraitSheetWidth,
            height: assetState.portraitSheetHeight,
          }
        : null,
    originalImage:
      assetState.portraitOriginalWidth && assetState.portraitOriginalHeight
        ? {
            width: assetState.portraitOriginalWidth,
            height: assetState.portraitOriginalHeight,
          }
        : null,
  }
  const portraitCount = getScaleUpFrameCount(portraitFrameImages, {
    frameWidth: 64,
    frameHeight: 64,
  })

  if (!character) {
    return (
      <div className="panel-surface panel-surface-flat h-full">
        <div className="panel-canvas-empty h-full border-0 bg-transparent px-6">{copy.inspectorEmpty}</div>
      </div>
    )
  }

  const spriteUrl = assetState.spriteUrl
  const spriteSheetWidth = assetState.spriteSheetWidth
  const spriteSheetHeight = assetState.spriteSheetHeight
  const portraitUrl = assetState.portraitUrl
  const portraitSheetWidth = assetState.portraitSheetWidth
  const portraitSheetHeight = assetState.portraitSheetHeight
  const springObjectsUrl = assetState.springObjectsUrl
  const springObjectsSheetWidth = assetState.springObjectsSheetWidth
  const springObjectsSheetHeight = assetState.springObjectsSheetHeight
  const giftSections: Array<{ title: string; groups: CharacterGiftGroup[]; tone: GiftTone }> = [
    { title: copy.lovedItemsTitle, groups: character.lovedGiftGroups, tone: 'love' },
    { title: copy.likedItemsTitle, groups: character.likedGiftGroups, tone: 'like' },
    { title: copy.neutralItemsTitle, groups: character.neutralGiftGroups, tone: 'neutral' },
    { title: copy.dislikedItemsTitle, groups: character.dislikedGiftGroups, tone: 'dislike' },
    { title: copy.hatedItemsTitle, groups: character.hatedGiftGroups, tone: 'hate' },
  ]
  return (
    <div className="panel-surface h-full">
      <style>{`
        @keyframes gift-bubble-pop {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.18);
          }
          62% {
            opacity: 1;
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(1.1);
          }
          82% {
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(1);
          }
        }

        @keyframes gift-bubble-ripple {
          0% {
            opacity: 0.7;
            transform: scale(0.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.8);
          }
        }

        @keyframes gift-bubble-core {
          0% {
            opacity: 0.45;
            transform: scale(0.4);
          }
          55% {
            opacity: 0.24;
            transform: scale(1.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.6);
          }
        }
      `}</style>
      <div className="panel-header">
        <div>
          <p className="panel-title">{copy.workspaceTitle}</p>
          <p className="panel-subtitle">{character.displayName}</p>
        </div>
        <span className="dock-chip">{activeVariant?.label ?? copy.defaultBadgeShort}</span>
      </div>

      <div className="grid h-[calc(100%-58px)] min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
        <section className="grid min-h-0 gap-3">
          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="grid min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
              <div className="flex min-h-0 flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="panel-title">{copy.breathingTitle}</p>
                    <p className="panel-subtitle">{activeVariant?.spritePathLabel ?? character.spriteAssetName}</p>
                  </div>
                  <span className="dock-chip">{`${frameWidth}x${frameHeight}`}</span>
                </div>
                <div className="flex-1">
                  <BreathingPreviewCanvas
                    character={character}
                    activeVariant={activeVariant}
                    assetState={assetState}
                    frameWidth={frameWidth}
                    frameHeight={frameHeight}
                    spriteColumns={spriteColumns}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="panel-title">{copy.walkingTitle}</p>
                  </div>
                  <span className="dock-chip">{WALK_DIRECTIONS.length}</span>
                </div>
                {spriteUrl && spriteSheetWidth && spriteSheetHeight ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {WALK_DIRECTIONS.map(({ id, direction }) => (
                      <MemoizedWalkCyclePreviewTile
                        key={id}
                        frameWidth={frameWidth}
                        frameHeight={frameHeight}
                        spriteColumns={spriteColumns}
                        spriteUrl={spriteUrl}
                        spriteSheetWidth={spriteSheetWidth}
                        spriteSheetHeight={spriteSheetHeight}
                        frames={getActorWalkAnimationState(character.internalName, direction).frames}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="panel-canvas-empty min-h-55">{copy.spriteMissing}</div>
                )}
              </div>
            </div>
          </div>

          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="panel-header">
              <div>
                <p className="panel-title">{copy.giftTastesTitle}</p>
                <p className="panel-subtitle">{character.displayName}</p>
              </div>
            </div>
            <div className="panel-body min-h-0 overflow-auto p-3">
              <div className="flex flex-col items-stretch gap-3">
                {giftSections.map((section) => (
                  <CharacterGiftTasteSection
                    key={section.tone}
                    title={section.title}
                    groups={section.groups}
                    springObjectsUrl={springObjectsUrl}
                    springObjectsSheetWidth={springObjectsSheetWidth}
                    springObjectsSheetHeight={springObjectsSheetHeight}
                    tone={section.tone}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="panel-surface panel-surface-muted min-h-0">
          <div className="panel-header">
            <div>
              <p className="panel-title">{copy.portraitTitle}</p>
              <p className="panel-subtitle">
                {copy.expressions}: {portraitCount || 0}
              </p>
            </div>
            <span className="dock-chip">{portraitCount || 0}</span>
          </div>
          <div className="panel-body min-h-0 overflow-auto p-3">
            {portraitUrl && portraitSheetWidth && portraitSheetHeight ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: portraitCount }, (_, index) => {
                  const previewMetrics = getScaleUpFramePreviewMetrics(portraitFrameImages, index, {
                    frameWidth: 64,
                    frameHeight: 64,
                    previewScale: PORTRAIT_PREVIEW_SCALE,
                  })

                  return (
                    <div
                      key={`portrait:${index}`}
                      className="rounded-[22px] bg-[color-mix(in_srgb,var(--bg-panel)_78%,transparent)] p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_64%,transparent)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">#{index}</p>
                        {character.shakePortraits.includes(index) ? <span className="dock-chip">{copy.shakeBadge}</span> : null}
                      </div>
                      <div className="mt-2.5 flex justify-center">
                        <div
                          className="panel-canvas-soft relative border-0"
                          style={{
                            width: `${previewMetrics.frameWidth}px`,
                            height: `${previewMetrics.frameHeight}px`,
                          }}
                        >
                          <div
                            className="absolute top-0 left-0"
                            style={{
                              ...buildAbsoluteSpriteLayerStyle({
                                url: portraitUrl,
                                sheetWidth: previewMetrics.sheetWidth,
                                sheetHeight: previewMetrics.sheetHeight,
                                sourceX: previewMetrics.frameX,
                                sourceY: previewMetrics.frameY,
                                width: previewMetrics.frameWidth,
                                height: previewMetrics.frameHeight,
                              }),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="panel-canvas-empty min-h-60">{copy.portraitMissing}</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
