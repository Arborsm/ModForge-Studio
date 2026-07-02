import { Camera, Code2, Music2, MapPin, OctagonX, UserPlus, UserRound, Volume2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EFFECT_VIEWPORT_BASE_HEIGHT, EFFECT_VIEWPORT_BASE_WIDTH, EVENT_STAGE_INITIAL_ZOOM, toActorKey } from '@entities/event'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import { getActorSpriteFrameHeight, getStageEffectPlayback, getStageEffectSortValue } from '@entities/event'
import { MapWorldStatePreviewOverlay } from '@entities/map'
import type { PlayerAppearanceProfile } from '@entities/event'
import { useEventStageCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { useEventStageWorkspace } from '../state/useEventStageWorkspace'
import { type GameDirectoryInfo, type MapAssetContent } from '@entities/game/api'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import { MapViewport, type MapViewportHandle } from '@entities/map'
import { EventStageActorSprite } from './EventStageActorSprite'
import { EventStagePlaybackToolbar } from './EventStagePlaybackToolbar'
import type { TileHoverInfo } from '@entities/map'
import { cx } from '@shared/lib/helper'

export type EventStageWorkspaceChromeMode = 'workspace' | 'console'

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
  hideHeader = false,
  chromeMode = 'workspace',
  additionalViewportOverlay,
  hideViewportStatus = false,
  onTileClick,
  onContextMenuAction,
  conditionBuilderLabel,
  mapAssetLoader,
  onActorAssetsChange,
}: EventStageWorkspaceProps) {
  const copy = useEventStageCopy()
  const consoleChrome = chromeMode === 'console'
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const mapViewportRef = useRef<MapViewportHandle | null>(null)
  const {
    actorAssets,
    animationNowMs,
    autoPlay,
    currentDialogueActor,
    currentDialogueActorAsset,
    currentDialoguePortrait,
    effectAssets,
    fadeOverlayOpacity,
    flashOverlayOpacity,
    focusWorldPoint,
    handleSelectChoice,
    handleZoomChange,
    labels,
    mapDocument,
    mapMessage,
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
    const worldEffects = worldEffectEntries
      .map(({ effect, asset }) => {
        const playback = getStageEffectPlayback(effect, animationNowMs)
        const isLoading = asset?.loading

        if (isLoading) {
          const pixelX = (effect.baseX + playback.offsetX) * gamePixelScale * viewportZoom
          const pixelY = (effect.baseY + playback.offsetY) * gamePixelScale * viewportZoom
          const width = effect.sourceWidth * playback.scale * gamePixelScale * viewportZoom
          const height = effect.sourceHeight * playback.scale * gamePixelScale * viewportZoom

          return (
            <div
              key={effect.id}
              className="absolute"
              style={{
                transform: `translate(${pixelX}px, ${pixelY}px)`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: getStageEffectSortValue(effect),
              }}
            >
              <ImageSkeleton overlay rounded={false} />
            </div>
          )
        }

        if (!playback.visible || !asset?.url) {
          return null
        }

        const frameX = effect.sourceX + playback.frameIndex * effect.sourceWidth
        const pixelX = (effect.baseX + playback.offsetX) * gamePixelScale * viewportZoom
        const pixelY = (effect.baseY + playback.offsetY) * gamePixelScale * viewportZoom
        const width = effect.sourceWidth * playback.scale * gamePixelScale * viewportZoom
        const height = effect.sourceHeight * playback.scale * gamePixelScale * viewportZoom
        const flipScale = effect.flip ? -1 : 1

        return (
          <div
            key={effect.id}
            className="absolute"
            style={{
              transform: `translate(${pixelX}px, ${pixelY}px)`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: getStageEffectSortValue(effect),
              opacity: playback.opacity,
            }}
          >
            <div
              style={{
                width: `${effect.sourceWidth}px`,
                height: `${effect.sourceHeight}px`,
                transform: effect.flip
                  ? `translateX(${width}px) scale(${flipScale * (width / effect.sourceWidth)}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
                  : `scale(${width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`,
                transformOrigin: 'top left',
                backgroundImage: `url("${asset.url}")`,
                backgroundPosition: `-${frameX}px -${effect.sourceY}px`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                filter: effect.color ? `drop-shadow(0 0 10px ${effect.color})` : undefined,
              }}
            />
          </div>
        )
      })
      .filter((item) => item !== null)
    return (
      <div className="absolute inset-0">
        <MapWorldStatePreviewOverlay
          mapDocument={mapDocument}
          viewportZoom={viewportZoom}
          sprites={worldOverlaySprites}
          textureAssets={effectAssets}
        />
        {worldEffects}
        {actorRenderEntries.map(({ actor, asset, frameWidth, frameHeight, spriteColumns }) => (
          <EventStageActorSprite
            key={actor.id}
            actor={actor}
            asset={asset}
            animationNowMs={animationNowMs}
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
  }, [actorRenderEntries, animationNowMs, effectAssets, mapDocument, viewportZoom, worldEffectEntries, worldOverlaySprites])

  const screenEffectsOverlay = useMemo(() => {
    const effects = screenEffectEntries
      .map(({ effect, asset }) => {
        const playback = getStageEffectPlayback(effect, animationNowMs)
        const isLoading = asset?.loading

        if (isLoading) {
          const width = effect.sourceWidth * playback.scale
          const height = effect.sourceHeight * playback.scale
          const leftPercent = ((effect.baseX + playback.offsetX) / EFFECT_VIEWPORT_BASE_WIDTH) * 100
          const topPercent = ((effect.baseY + playback.offsetY) / EFFECT_VIEWPORT_BASE_HEIGHT) * 100

          return (
            <div
              key={effect.id}
              className="absolute"
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: getStageEffectSortValue(effect),
              }}
            >
              <ImageSkeleton overlay rounded={false} />
            </div>
          )
        }

        if (!playback.visible || !asset?.url) {
          return null
        }

        const frameX = effect.sourceX + playback.frameIndex * effect.sourceWidth
        const width = effect.sourceWidth * playback.scale
        const height = effect.sourceHeight * playback.scale
        const leftPercent = ((effect.baseX + playback.offsetX) / EFFECT_VIEWPORT_BASE_WIDTH) * 100
        const topPercent = ((effect.baseY + playback.offsetY) / EFFECT_VIEWPORT_BASE_HEIGHT) * 100
        const flipScale = effect.flip ? -1 : 1

        return (
          <div
            key={effect.id}
            className="absolute"
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: getStageEffectSortValue(effect),
              opacity: playback.opacity,
            }}
          >
            <div
              style={{
                width: `${effect.sourceWidth}px`,
                height: `${effect.sourceHeight}px`,
                transform: effect.flip
                  ? `translateX(${width}px) scale(${flipScale * (width / effect.sourceWidth)}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`
                  : `scale(${width / effect.sourceWidth}, ${height / effect.sourceHeight}) rotate(${playback.rotation}rad)`,
                transformOrigin: 'top left',
                backgroundImage: `url("${asset.url}")`,
                backgroundPosition: `-${frameX}px -${effect.sourceY}px`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                filter: effect.color ? `drop-shadow(0 0 12px ${effect.color})` : undefined,
              }}
            />
          </div>
        )
      })
      .filter((item) => item !== null)

    if (effects.length === 0) {
      return null
    }

    return <div className="pointer-events-none absolute inset-0 overflow-hidden">{effects}</div>
  }, [animationNowMs, screenEffectEntries])

  const viewportOverlay = (
    <div className="absolute inset-0">
      {playbackState.ambientOverlayColor ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: playbackState.ambientOverlayColor, opacity: 0.14, mixBlendMode: 'screen' }}
        />
      ) : null}
      {playbackState.fadeOverlay ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: playbackState.fadeOverlay.color, opacity: fadeOverlayOpacity }}
        />
      ) : null}
      {flashOverlayOpacity > 0 && playbackState.flashOverlay ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: playbackState.flashOverlay.color, opacity: flashOverlayOpacity }}
        />
      ) : null}
      {screenEffectsOverlay}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {!hideViewportStatus ? (
          <div className="flex justify-between gap-3">
            <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-(--text-primary) uppercase shadow-(--shadow-panel)">
              {selectedEvent?.eventId ?? labels.scene}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {playbackStatusChips.map((chip) => (
                <div
                  key={chip.id}
                  className="pointer-events-none rounded-full border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-3 py-1 text-[11px] text-(--text-primary) shadow-(--shadow-panel)"
                >
                  <span className="font-semibold tracking-[0.14em] text-(--text-secondary) uppercase">{chip.label}</span>{' '}
                  <span>{chip.value}</span>
                </div>
              ))}
              {playbackState.activeEventKey && selectedEvent && playbackState.activeEventKey !== selectedEvent.key ? (
                <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-panel))] px-3 py-1 text-[11px] text-(--text-primary) shadow-(--shadow-panel)">
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
                          : 'border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)]'

                  return (
                    <div
                      key={notice.id}
                      className={`panel-list-card flex items-center gap-3 px-3 py-2 shadow-(--shadow-panel) backdrop-blur ${toneClassName}`}
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-elevated)">
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
                          <span className="flex h-full items-center justify-center text-(--text-secondary)">
                            <NoticeSymbolIcon className="h-5 w-5" />
                          </span>
                        ) : (
                          <span className="flex h-full items-center justify-center text-[10px] font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">
                            HUD
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">{notice.title}</p>
                        <p className="truncate text-sm text-(--text-primary)">{notice.detail}</p>
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
            <p className="mt-2 text-base font-semibold text-(--text-primary)">{playbackState.pendingChoice.question}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {playbackState.pendingChoice.choices.map((choice, index) => (
                <button
                  key={`${choice.id}:${index}`}
                  type="button"
                  className="panel-list-card panel-list-card-interactive px-4 py-3 text-left text-sm text-(--text-primary)"
                  onClick={() => handleSelectChoice(index)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : playbackState.currentEntry ? (
          <div className="panel-overlay-card pointer-events-none flex w-full max-w-4xl items-end gap-4">
            <div className="relative hidden h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-(--border-color) bg-(--bg-panel) sm:block">
              {currentDialogueActorAsset?.loading ? (
                <ImageSkeleton overlay rounded={false} />
              ) : currentDialogueActorAsset?.portraitUrl ? (
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    aria-label={currentDialogueActor?.actorName ?? playbackState.currentEntry.title}
                    style={{
                      width: `${currentDialoguePortrait.frameWidth}px`,
                      height: `${currentDialoguePortrait.frameHeight}px`,
                      transform: `scale(${96 / currentDialoguePortrait.frameWidth})`,
                      transformOrigin: 'top left',
                      backgroundImage: `url("${currentDialogueActorAsset.portraitUrl}")`,
                      backgroundPosition: `-${currentDialoguePortrait.frameX}px -${currentDialoguePortrait.frameY}px`,
                      backgroundRepeat: 'no-repeat',
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-[11px] font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">
                  {playbackState.currentEntry.title}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="panel-section-title">{playbackState.currentEntry.title}</p>
              <p className="mt-2 text-base leading-7 text-(--text-primary)">{playbackState.currentEntry.detail}</p>
            </div>
          </div>
        ) : consoleChrome ? null : (
          <div className="pointer-events-none rounded-full border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-4 py-2 text-sm text-(--text-secondary) shadow-(--shadow-panel)">
            {labels.sceneIdle}
          </div>
        )}
      </div>
      {additionalViewportOverlay}
    </div>
  )

  if (!parsedEventAsset) {
    return (
      <div className={`panel-surface panel-surface-flat h-full ${className ?? ''}`}>
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-(--text-secondary)">
          <div className="space-y-3">
            <p className="text-base font-semibold text-(--text-primary)">{labels.empty}</p>
            <p>{eventStatusMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cx('panel-surface h-full', consoleChrome && 'event-stage-console-surface', className)}>
      {!hideHeader ? (
        <div className="panel-header">
          <div>
            <p className="panel-title">{labels.scene}</p>
            <p className="panel-subtitle">{mapMessage || eventStatusMessage}</p>
          </div>
        </div>
      ) : null}
      <div className={cx('panel-body min-h-0', hideHeader ? 'h-full' : 'h-[calc(100%-58px)]', !consoleChrome && 'p-3')}>
        <div className="relative h-full">
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
                    Add Actor Here ({hoverInfo.tileX}, {hoverInfo.tileY})
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('setCamera', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <Camera className="mr-1.5 inline h-3.5 w-3.5" />
                    Set Camera Here ({hoverInfo.tileX}, {hoverInfo.tileY})
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => onContextMenuAction('addWarp', hoverInfo.tileX, hoverInfo.tileY)}
                  >
                    <MapPin className="mr-1.5 inline h-3.5 w-3.5" />
                    Add Warp Here ({hoverInfo.tileX}, {hoverInfo.tileY})
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
