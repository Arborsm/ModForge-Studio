import {
  CharacterBreathingCanvas,
  CharacterWalkCycleGrid,
  CHARACTER_WALK_DIRECTIONS,
  resolveCharacterSpriteMetrics,
  type CharacterAppearanceVariant,
  type CharacterGiftGroup,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import { getActorSpriteFrameHeight } from '@entities/event'
import { useCharactersCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { getScaleUpFrameCount, getScaleUpFramePreviewMetrics } from '@pages/workbench/workspaces/mod'
import { CharacterGiftTasteSection, type GiftTone } from './CharacterGiftTasteSection'
import { buildAbsoluteSpriteLayerStyle } from '@entities/character'

const PORTRAIT_PREVIEW_SCALE = 2

type CharacterWorkspaceProps = {
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
  assetLoading?: boolean
}

export default function CharacterWorkspace({ character, activeVariant, assetState, assetLoading = false }: CharacterWorkspaceProps) {
  const copy = useCharactersCopy()
  const isAssetLoading = assetLoading
  const metrics = resolveCharacterSpriteMetrics(character, assetState, character ? getActorSpriteFrameHeight(character.internalName) : 32)
  const { frameWidth, frameHeight } = metrics
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
                <div className="relative flex-1">
                  <CharacterBreathingCanvas character={character} activeVariant={activeVariant} assetState={assetState} metrics={metrics} />
                  {isAssetLoading ? <ImageSkeleton overlay className="character-breathing-skeleton" /> : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="panel-title">{copy.walkingTitle}</p>
                  </div>
                  <span className="dock-chip">{CHARACTER_WALK_DIRECTIONS.length}</span>
                </div>
                <div className="relative">
                  <CharacterWalkCycleGrid character={character} assetState={assetState} metrics={metrics} />
                  {isAssetLoading ? <ImageSkeleton overlay className="character-walking-skeleton" /> : null}
                </div>
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
          <div className="panel-body relative min-h-0 overflow-auto p-3">
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
                        <p className="text-text-secondary text-meta-px tracking-ui-wider font-semibold uppercase">#{index}</p>
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
            {isAssetLoading ? <ImageSkeleton overlay className="character-portrait-skeleton" /> : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
