import { Camera, Code2, Music2, MapPin, OctagonX, UserPlus, UserRound, Volume2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EVENT_STAGE_INITIAL_ZOOM, resolveFadeOverlayAlpha, toActorKey } from '@entities/event'
import type { FadeOverlayState, ScreenFlashState } from '@entities/event'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import { getActorSpriteFrameHeight } from '@entities/event'
import { MapWorldStatePreviewOverlay } from '@entities/map'
import type { PlayerAppearanceProfile } from '@entities/event'
import { useEventStageCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { useEventStageWorkspace } from '../state/useEventStageWorkspace'
import { useEventStageAnimationEffect } from '../state/eventStageAnimationClock'
import { type GameDirectoryInfo, type MapAssetContent } from '@entities/game/api'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import { MapViewport, type MapViewportHandle } from '@entities/map'
import { EventStageActorSprite } from './EventStageActorSprite'
import { EventStageScreenEffectSprite, EventStageWorldEffectSprite } from './EventStageEffectSprite'
import { EventStagePlaybackToolbar } from './EventStagePlaybackToolbar'
import type { TileHoverInfo } from '@entities/map'
import { cx } from '@shared/lib/helper'
import type { EventStageAssetImageLoader } from '@entities/event'

export type EventStageWorkspaceChromeMode = 'workspace' | 'console'

function EventStageFadeOverlay({ fadeOverlay }: { fadeOverlay: FadeOverlayState }) {
  const ref = useRef<HTMLDivElement>(null)
  useEventStageAnimationEffect((nowMs) => {
    if (ref.current) {
      ref.current.style.opacity = String(resolveFadeOverlayAlpha(fadeOverlay, nowMs))
    }
  })
  return <div ref={ref} className="pointer-events-none absolute inset-0" style={{ backgroundColor: fadeOverlay.color }} />
}

function EventStageFlashOverlay({ flashOverlay }: { flashOverlay: ScreenFlashState }) {
  const ref = useRef<HTMLDivElement>(null)
  useEventStageAnimationEffect((nowMs) => {
    const node = ref.current
    if (!node) {
      return
    }
    const elapsedMs = Math.max(0, nowMs - flashOverlay.startedAtMs)
    const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, flashOverlay.durationMs)))
    node.style.opacity = String(flashOverlay.alpha * (1 - progress))
  })
  return <div ref={ref} className="pointer-events-none absolute inset-0" style={{ backgroundColor: flashOverlay.color }} />
}

type EventStageWorkspaceProps = {
  locale: LocaleCode
  directoryInfo: GameDirectoryInfo | null
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  parsedEventAsset: ParsedEventAsset | null
  selectedEvent: EventScript | null
  eventStatusMessage: string
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onSelectTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
  onStageSeekReady: (seekTimelineEntry: (entryId: string) => void) => () => void
  onOpenPlayerAppearanceWindow: () => void
  className?: string
  hideHeader?: boolean
  chromeMode?: EventStageWorkspaceChromeMode
  additionalViewportOverlay?: ReactNode
  hideViewportStatus?: boolean
  onTileClick?: (tileX: number, tileY: number) => void
  onContextMenuAction?: (action: 'addActor' | 'setCamera' | 'addWarp' | 'conditionBuilder', tileX: number, tileY: number) => void
  conditionBuilderLabel?: string
  mapAssetLoader?: (gameRootPath: string, mapPath: string, locale: string) => Promise<MapAssetContent>
  imageResourceLoader?: EventStageAssetImageLoader
  onActorAssetsChange?: (assets: Record<string, { spriteUrl: string | null; portraitUrl: string | null }>) => void
}

export default function EventStageWorkspace({
  locale,
  directoryInfo,
  viewportLabels,
  theme,
  accentColor,
  parsedEventAsset,
  selectedEvent,
  eventStatusMessage,
  playerAppearanceProfile,
  onSelectTimelineEntry,
  onPlaybackCommandChange,
  onStageSeekReady,
  onOpenPlayerAppearanceWindow,
  className,
  hideHeader: _hideHeader,
  chromeMode = 'workspace',
  additionalViewportOverlay,
  hideViewportStatus = false,
  onTileClick,
  onContextMenuAction,
  conditionBuilderLabel,
  mapAssetLoader,
  imageResourceLoader,
  onActorAssetsChange,
}: EventStageWorkspaceProps) {
  const copy = useEventStageCopy()
  const consoleChrome = chromeMode === 'console'
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const mapViewportRef = useRef<MapViewportHandle | null>(null)
  const {
    actorAssets,
    autoPlay,
    currentDialogueActor,
    currentDialogueActorAsset,
    currentDialoguePortrait,
    effectAssets,
    focusWorldPoint,
    handleSelectChoice,
    handleZoomChange,
    labels,
    mapDocument,
    playbackState,
    playbackStatusChips,
    playNextFrame,
    resetPlayback,
    seekTimelineEntry,
    setShowGrid,
    setShowMapPaths,
    showGrid,
    showMapPaths,
    toggleAutoPlayback,
    visibleLayerIds,
    visibleObjectGroupIds,
    viewportZoom,
    worldLighting,
    worldOverlaySprites,
  } = useEventStageWorkspace({
    copy,
    locale,
    directoryInfo,
    viewportLabels,
    parsedEventAsset,
    selectedEvent,
    playerAppearanceProfile,
    onSelectTimelineEntry,
    onPlaybackCommandChange,
    mapAssetLoader,
    imageResourceLoader,
  })
  const noticeSymbolIcon = {
    music: Music2,
    sound: Volume2,
    stop: OctagonX,
  } as const

  useEffect(() => onStageSeekReady(seekTimelineEntry), [onStageSeekReady, seekTimelineEntry])

  useEffect(() => {
    onActorAssetsChange?.(
      Object.fromEntries(
        Object.entries(actorAssets).map(([actorKey, asset]) => [
          actorKey,
          {
            spriteUrl: asset.spriteUrl,
            portraitUrl: asset.portraitUrl,
          },
        ]),
      ),
    )
  }, [actorAssets, onActorAssetsChange])

  const resetStageViewport = useCallback(() => {
    mapViewportRef.current?.fitToScreen()
    mapViewportRef.current?.centerView()
  }, [])

  // Smooth camera pan for `viewport move x y duration`: interpolate per frame
  // and drive the viewport scroll directly; the engine settles focusTile when done.
  useEventStageAnimationEffect((nowMs) => {
    const pan = playbackState.cameraPan
    if (!pan || !mapDocument) {
      return
    }
    const progress = Math.min(1, Math.max(0, (nowMs - pan.startedAtMs) / pan.durationMs))
    const tileX = pan.fromTile.tileX + (pan.toTile.tileX - pan.fromTile.tileX) * progress
    const tileY = pan.fromTile.tileY + (pan.toTile.tileY - pan.fromTile.tileY) * progress
    mapViewportRef.current?.centerOnWorldPoint((tileX + 0.5) * mapDocument.tileWidth, (tileY + 0.5) * mapDocument.tileHeight)
  })

  const worldStageEffects = useMemo(
    () => playbackState.stageEffects.filter((effect) => effect.space === 'world'),
    [playbackState.stageEffects],
  )
  const screenStageEffects = useMemo(
    () => playbackState.stageEffects.filter((effect) => effect.space === 'screen'),
    [playbackState.stageEffects],
  )
  const visibleSortedActors = useMemo(
    () =>
      Object.values(playbackState.actors)
        .filter((actor) => actor.visible)
        .sort((left, right) => left.tileY - right.tileY),
    [playbackState.actors],
  )
  const worldEffectEntries = useMemo(
    () =>
      worldStageEffects.map((effect) => ({
        effect,
        asset: effectAssets[effect.textureName],
      })),
    [effectAssets, worldStageEffects],
  )
  const screenEffectEntries = useMemo(
    () =>
      screenStageEffects.map((effect) => ({
        effect,
        asset: effectAssets[effect.textureName],
      })),
    [effectAssets, screenStageEffects],
  )
  const actorRenderEntries = useMemo(
    () =>
      visibleSortedActors.map((actor) => {
        const asset = actorAssets[toActorKey(actor.actorName)]
        const frameWidth = 16
        const frameHeight = getActorSpriteFrameHeight(actor.actorName)
        const spriteColumns =
          asset?.spriteSheetWidth && asset.spriteSheetWidth >= frameWidth ? Math.max(1, Math.floor(asset.spriteSheetWidth / frameWidth)) : 4

        return {
          actor,
          asset,
          frameWidth,
          frameHeight,
          spriteColumns,
        }
      }),
    [actorAssets, visibleSortedActors],
  )

  const mapOverlay = useMemo(() => {
    if (!mapDocument) {
      return null
    }

    const gamePixelScale = mapDocument.tileWidth / 64

    return (
      <div className="absolute inset-0">
        <MapWorldStatePreviewOverlay
          mapDocument={mapDocument}
          viewportZoom={viewportZoom}
          sprites={worldOverlaySprites}
          textureAssets={effectAssets}
        />
        {worldEffectEntries.map(({ effect, asset }) => (
          <EventStageWorldEffectSprite
            key={effect.id}
            effect={effect}
            asset={asset}
            gamePixelScale={gamePixelScale}
            viewportZoom={viewportZoom}
          />
        ))}
        {actorRenderEntries.map(({ actor, asset, frameWidth, frameHeight, spriteColumns }) => (
          <EventStageActorSprite
            key={actor.id}
            actor={actor}
            asset={asset}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            spriteColumns={spriteColumns}
            tileWidth={mapDocument.tileWidth}
            tileHeight={mapDocument.tileHeight}
            gamePixelScale={gamePixelScale}
            viewportZoom={viewportZoom}
          />
        ))}
      </div>
    )
  }, [actorRenderEntries, effectAssets, mapDocument, viewportZoom, worldEffectEntries, worldOverlaySprites])

  const screenEffectsOverlay = useMemo(() => {
    if (screenEffectEntries.length === 0) {
      return null
    }

    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {screenEffectEntries.map(({ effect, asset }) => (
          <EventStageScreenEffectSprite key={effect.id} effect={effect} asset={asset} />
        ))}
      </div>
    )
  }, [screenEffectEntries])

  const viewportOverlay = (
    <div className="absolute inset-0">
      {playbackState.fadeOverlay ? <EventStageFadeOverlay fadeOverlay={playbackState.fadeOverlay} /> : null}
      {playbackState.flashOverlay ? <EventStageFlashOverlay flashOverlay={playbackState.flashOverlay} /> : null}
      {screenEffectsOverlay}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {!hideViewportStatus ? (
          <div className="flex justify-between gap-3">
            <div className="text-text-primary shadow-panel text-meta-px tracking-ui-wider pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-1 font-semibold uppercase">
              {selectedEvent?.eventId ?? labels.scene}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {playbackStatusChips.map((chip) => (
                <div
                  key={chip.id}
                  className="border-border-subtle text-text-primary shadow-panel text-meta-px pointer-events-none rounded-full border bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-3 py-1"
                >
                  <span className="text-text-secondary tracking-ui-wider font-semibold uppercase">{chip.label}</span>{' '}
                  <span>{chip.value}</span>
                </div>
              ))}
              {playbackState.activeEventKey && selectedEvent && playbackState.activeEventKey !== selectedEvent.key ? (
                <div className="text-text-primary shadow-panel text-meta-px pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-panel))] px-3 py-1">
                  {labels.branch}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <span />
        )}
        <div className="flex justify-start">
          {playbackState.notices.length ? (
            <div className="pointer-events-none flex max-w-md flex-col gap-2">
              {playbackState.notices
                .slice()
                .reverse()
                .map((notice) => {
                  const iconAsset = notice.icon ? effectAssets[notice.icon.textureName] : null
                  const iconScale = notice.icon ? Math.min(32 / notice.icon.sourceWidth, 32 / notice.icon.sourceHeight) : 1
                  const NoticeSymbolIcon = notice.symbol ? noticeSymbolIcon[notice.symbol] : null
                  const toneClassName =
                    notice.tone === 'gain'
                      ? 'border-[color-mix(in_srgb,var(--success)_38%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,var(--bg-panel))]'
                      : notice.tone === 'loss'
                        ? 'border-[color-mix(in_srgb,var(--danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-panel))]'
                        : notice.tone === 'visual'
                          ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-panel))]'
                          : 'border-border-subtle bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)]'

                  return (
                    <div
                      key={notice.id}
                      className={`panel-list-card shadow-panel flex items-center gap-3 px-3 py-2 backdrop-blur ${toneClassName}`}
                    >
                      <div className="border-border-subtle bg-surface-elevated relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border">
                        {notice.icon && iconAsset?.loading ? (
                          <ImageSkeleton overlay rounded={false} />
                        ) : notice.icon && iconAsset?.url ? (
                          <div
                            className="absolute top-1/2 left-1/2"
                            style={{
                              width: `${notice.icon.sourceWidth}px`,
                              height: `${notice.icon.sourceHeight}px`,
                              transform: `translate(-50%, -50%) scale(${iconScale})`,
                              transformOrigin: 'center',
                              backgroundImage: `url("${iconAsset.url}")`,
                              backgroundPosition: `-${notice.icon.sourceX}px -${notice.icon.sourceY}px`,
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'pixelated',
                            }}
                          />
                        ) : NoticeSymbolIcon ? (
                          <span className="text-text-secondary flex h-full items-center justify-center">
                            <NoticeSymbolIcon className="h-5 w-5" />
                          </span>
                        ) : (
                          <span className="text-text-secondary text-caption-px tracking-ui-wider flex h-full items-center justify-center font-semibold uppercase">
                            HUD
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-text-secondary tracking-ui-wider truncate text-xs font-semibold uppercase">{notice.title}</p>
                        <p className="text-text-primary truncate text-sm">{notice.detail}</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
        {playbackState.pendingChoice ? (
          <div className="panel-overlay-card pointer-events-auto w-full max-w-3xl">
            <p className="panel-section-title">{labels.choose}</p>
            <p className="text-text-primary mt-2 text-base font-semibold">{playbackState.pendingChoice.question}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {playbackState.pendingChoice.choices.map((choice, index) => (
                <button
                  key={`${choice.id}:${index}`}
                  type="button"
                  className="event-stage-choice-button panel-list-card panel-list-card-interactive text-text-primary px-4 py-3 text-left text-sm"
                  onClick={() => handleSelectChoice(index)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : playbackState.currentEntry &&
          (playbackState.currentEntry.tone === 'dialogue' || playbackState.currentEntry.tone === 'message') ? (
          <div className="panel-overlay-card pointer-events-none flex w-full max-w-4xl items-end gap-4">
            <div className="border-border-subtle bg-surface-panel relative hidden h-64 w-64 shrink-0 overflow-hidden rounded-2xl border sm:block">
              {currentDialogueActorAsset?.loading ? (
                <ImageSkeleton overlay rounded={false} />
              ) : currentDialogueActorAsset?.portraitUrl ? (
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    aria-label={currentDialogueActor?.actorName ?? playbackState.currentEntry.title}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      // The game draws the full 64x64 portrait frame (head and
                      // shoulders) at an integer 4x scale inside the dialogue
                      // box; scaling the sheet with backgroundSize keeps pixels crisp.
                      width: `${currentDialoguePortrait.frameWidth * 4}px`,
                      height: `${currentDialoguePortrait.frameHeight * 4}px`,
                      backgroundImage: `url("${currentDialogueActorAsset.portraitUrl}")`,
                      backgroundPosition: `-${currentDialoguePortrait.frameX * 4}px -${currentDialoguePortrait.frameY * 4}px`,
                      backgroundSize: `${(currentDialogueActorAsset.portraitSheetWidth ?? 0) * 4}px ${(currentDialogueActorAsset.portraitSheetHeight ?? 0) * 4}px`,
                      backgroundRepeat: 'no-repeat',
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>
              ) : (
                <div className="text-text-secondary text-meta-px tracking-ui-wider flex h-full items-center justify-center text-center font-semibold uppercase">
                  {playbackState.currentEntry.title}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="panel-section-title">{playbackState.currentEntry.title}</p>
              <p className="text-text-primary mt-2 text-base leading-7">{playbackState.currentEntry.detail}</p>
            </div>
          </div>
        ) : consoleChrome ? null : (
          <div className="border-border-subtle text-text-secondary shadow-panel pointer-events-none rounded-full border bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-4 py-2 text-sm">
            {labels.sceneIdle}
          </div>
        )}
      </div>
      {additionalViewportOverlay}
    </div>
  )

  if (!parsedEventAsset) {
    return (
      <div className={cx('bg-surface-panel rounded-panel h-full', className)}>
        <div className="text-text-secondary flex h-full items-center justify-center p-8 text-center text-sm">
          <div className="space-y-3">
            <p className="text-text-primary text-base font-semibold">{labels.empty}</p>
            <p>{eventStatusMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cx('bg-surface-panel rounded-panel h-full', consoleChrome && 'event-stage-console-surface', className)}>
      <div className={cx('event-stage-body min-h-0 h-full overflow-hidden', !consoleChrome && 'p-3')}>
        <div className="event-stage-viewport-shell relative h-full">
          <MapViewport
            ref={mapViewportRef}
            key={
              mapDocument
                ? `${mapDocument.sourcePath}:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
                : `empty:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
            }
            locale={locale}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            theme={theme}
            accentColor={accentColor}
            showGrid={showGrid}
            showStatsChips={false}
            initialZoom={EVENT_STAGE_INITIAL_ZOOM}
            mapOverlay={mapOverlay}
            viewportOverlay={viewportOverlay}
            worldLighting={worldLighting}
            focusWorldPoint={focusWorldPoint}
            onZoomChange={handleZoomChange}
            onHoverChange={setHoverInfo}
            onTileClick={onTileClick}
            contextMenuEnabled={Boolean(onContextMenuAction)}
            contextMenuExtraItems={
              onContextMenuAction && hoverInfo ? (
                <>
                  <ContextMenu.Separator className="context-menu-separator" />
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('conditionBuilder', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <Code2 className="mr-1.5 inline h-3.5 w-3.5" />
                    {conditionBuilderLabel ?? labels.scene}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="context-menu-separator" />
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('addActor', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <UserPlus className="mr-1.5 inline h-3.5 w-3.5" />
                    {labels.addActorHere(hoverInfo.tileX, hoverInfo.tileY)}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('setCamera', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <Camera className="mr-1.5 inline h-3.5 w-3.5" />
                    {labels.setCameraHere(hoverInfo.tileX, hoverInfo.tileY)}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('addWarp', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <MapPin className="mr-1.5 inline h-3.5 w-3.5" />
                    {labels.addWarpHere(hoverInfo.tileX, hoverInfo.tileY)}
                  </ContextMenu.Item>
                </>
              ) : null
            }
          />
          {!mapDocument && additionalViewportOverlay ? (
            <div className="pointer-events-none absolute inset-0 z-18">{additionalViewportOverlay}</div>
          ) : null}
          <EventStagePlaybackToolbar
            autoPlay={autoPlay}
            canPlay={Boolean(selectedEvent)}
            showGrid={showGrid}
            showPaths={showMapPaths}
            gridDisabled={!mapDocument}
            pathsDisabled={!mapDocument}
            onStep={playNextFrame}
            onTogglePlay={toggleAutoPlayback}
            onReset={resetPlayback}
            onResetView={resetStageViewport}
            onToggleGrid={() => setShowGrid((current) => !current)}
            onTogglePaths={() => setShowMapPaths((current) => !current)}
            extraControls={
              <button
                type="button"
                className="workspace-viewport-toolbar-menu-item"
                title={labels.configurePlayerAppearance}
                aria-label={labels.configurePlayerAppearance}
                onClick={onOpenPlayerAppearanceWindow}
              >
                <UserRound className="h-4 w-4" />
                <span>{labels.configurePlayerAppearance}</span>
              </button>
            }
          />
        </div>
      </div>
    </div>
  )
}
