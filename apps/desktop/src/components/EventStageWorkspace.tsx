import { Grid2x2, Pause, Play, RotateCcw, Route, SkipForward, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import {
  EFFECT_VIEWPORT_BASE_HEIGHT,
  EFFECT_VIEWPORT_BASE_WIDTH,
  EVENT_STAGE_INITIAL_ZOOM,
  toActorKey,
} from '../lib/app/eventStageShared'
import {
  buildActorBreathingLayerDescriptor,
  buildSpriteLayerDescriptors,
  getActorRenderState,
  getActorSpriteFrameHeight,
  getStageEffectPlayback,
  getStageEffectSortValue,
} from '../lib/app/eventStageAssets'
import MapWorldStatePreviewOverlay from './MapWorldStatePreviewOverlay'
import type { PlayerAppearanceProfile } from '../lib/app/playerAppearance'
import { useEventStageCopy } from '../lib/app/localeContext'
import { useEventStageWorkspace } from '../lib/app/useEventStageWorkspace'
import { type GameDirectoryInfo } from '../lib/desktop'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../lib/editor-shell'
import type { EventScript, ParsedEventAsset } from '../lib/events/types'
import { cx } from '../lib/cx'
import { MapViewport } from './MapViewport'

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
  timelineJumpRequestId: string | null
  onTimelineJumpHandled: () => void
  onSelectTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
  onOpenPlayerAppearanceWindow: () => void
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
  timelineJumpRequestId,
  onTimelineJumpHandled,
  onSelectTimelineEntry,
  onPlaybackCommandChange,
  onOpenPlayerAppearanceWindow,
}: EventStageWorkspaceProps) {
  const copy = useEventStageCopy()
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
    timelineJumpRequestId,
    onTimelineJumpHandled,
    onSelectTimelineEntry,
    onPlaybackCommandChange,
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
          asset?.spriteSheetWidth && asset.spriteSheetWidth >= frameWidth
            ? Math.max(1, Math.floor(asset.spriteSheetWidth / frameWidth))
            : 4

        return {
          actor,
          asset,
          frameWidth,
          frameHeight,
          spriteColumns,
          actorHeightTiles: frameHeight / 16,
          actorWidthTiles: frameWidth / 16,
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
        {actorRenderEntries.map(({ actor, asset, frameWidth, frameHeight, spriteColumns, actorHeightTiles, actorWidthTiles }) => {
            const renderState = getActorRenderState(actor, animationNowMs)
            const spriteLayers = buildSpriteLayerDescriptors(
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
            const breathingLayer = buildActorBreathingLayerDescriptor(
              asset,
              actor,
              renderState.frame,
              frameWidth,
              frameHeight,
              spriteColumns,
              animationNowMs,
              renderState.breathingScale,
              renderState.farmerRenderState,
            )
            const pixelX =
              renderState.tileX * mapDocument.tileWidth * viewportZoom +
              renderState.offsetX * gamePixelScale * viewportZoom +
              renderState.shakeOffsetX * viewportZoom
            const actorHeight = mapDocument.tileHeight * actorHeightTiles * viewportZoom
            const actorWidth = mapDocument.tileWidth * actorWidthTiles * viewportZoom
            const pixelY =
              renderState.tileY * mapDocument.tileHeight * viewportZoom +
              (renderState.offsetY + renderState.breathingOffsetY) * gamePixelScale * viewportZoom +
              renderState.shakeOffsetY * viewportZoom
            const spriteScale = Math.max(1, actorWidth / frameWidth)
            const spriteTransform =
              asset?.farmerAppearance
                ? `scale(${spriteScale}, ${spriteScale})`
                : renderState.flip
                  ? `translateX(${actorWidth}px) scale(${-spriteScale}, ${spriteScale})`
                  : `scale(${spriteScale}, ${spriteScale})`

            return (
              <div
                key={actor.id}
                className="absolute"
                style={{
                  transform: `translate(${Math.round(pixelX)}px, ${Math.round(pixelY)}px)`,
                  width: `${actorWidth}px`,
                  height: `${actorHeight}px`,
                  zIndex: Math.round(renderState.tileY * 100) + 50,
                }}
              >
                {spriteLayers.length > 0 ? (
                  <div className="relative overflow-visible" style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}>
                    <div className="relative" style={{ width: `${frameWidth}px`, height: `${frameHeight}px`, transform: spriteTransform, transformOrigin: 'left bottom' }}>
                      {spriteLayers.map((layer) => (
                        <div
                          key={`${actor.id}:${layer.key}`}
                          className="absolute"
                          style={{
                            left: `${layer.offsetX}px`,
                            top: `${layer.offsetY}px`,
                            width: `${layer.width}px`,
                            height: `${layer.height}px`,
                            transform:
                              [
                                layer.flip ? `translateX(${layer.width}px) scaleX(-1)` : null,
                                layer.scaleX != null || layer.scaleY != null
                                  ? `scale(${layer.scaleX ?? 1}, ${layer.scaleY ?? 1})`
                                  : null,
                                layer.rotation != null ? `rotate(${layer.rotation}rad)` : null,
                              ]
                                .filter(Boolean)
                                .join(' ') || undefined,
                            transformOrigin: layer.transformOrigin ?? 'top left',
                            backgroundImage: layer.url ? `url("${layer.url}")` : undefined,
                            backgroundColor: layer.backgroundColor ?? undefined,
                            backgroundPosition: `-${layer.sourceX}px -${layer.sourceY}px`,
                            backgroundRepeat: 'no-repeat',
                            imageRendering: 'pixelated',
                            opacity: layer.opacity,
                          }}
                        />
                      ))}
                      {breathingLayer ? (
                        <div
                          key={`${actor.id}:breathing`}
                          className="absolute"
                          style={{
                            left: `${breathingLayer.offsetX}px`,
                            top: `${breathingLayer.offsetY}px`,
                            width: `${breathingLayer.width}px`,
                            height: `${breathingLayer.height}px`,
                            transform: `scale(${breathingLayer.scaleX ?? 1}, ${breathingLayer.scaleY ?? 1})`,
                            transformOrigin: breathingLayer.transformOrigin ?? 'top left',
                            backgroundImage: breathingLayer.url ? `url("${breathingLayer.url}")` : undefined,
                            backgroundPosition: `-${breathingLayer.sourceX}px -${breathingLayer.sourceY}px`,
                            backgroundRepeat: 'no-repeat',
                            imageRendering: 'pixelated',
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            )
          })}
      </div>
    )
  }, [actorRenderEntries, animationNowMs, effectAssets, mapDocument, viewportZoom, worldEffectEntries, worldOverlaySprites])

  const screenEffectsOverlay = useMemo(() => {
    const effects = screenEffectEntries
      .map(({ effect, asset }) => {
        const playback = getStageEffectPlayback(effect, animationNowMs)
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
        <div className="flex justify-between gap-3">
          <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
            {selectedEvent?.eventId ?? labels.scene}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {playbackStatusChips.map((chip) => (
              <div
                key={chip.id}
                className="pointer-events-none rounded-full border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-3 py-1 text-[11px] text-[var(--text-primary)] shadow-[var(--shadow-panel)]"
              >
                <span className="font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{chip.label}</span>{' '}
                <span>{chip.value}</span>
              </div>
            ))}
            {playbackState.activeEventKey && selectedEvent && playbackState.activeEventKey !== selectedEvent.key ? (
              <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-panel))] px-3 py-1 text-[11px] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
                {labels.branch}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex justify-start">
          {playbackState.notices.length ? (
            <div className="pointer-events-none flex max-w-md flex-col gap-2">
              {playbackState.notices
                .slice()
                .reverse()
                .map((notice) => {
                  const iconAsset = notice.icon ? effectAssets[notice.icon.textureName] : null
                  const toneClassName =
                    notice.tone === 'gain'
                      ? 'border-[color-mix(in_srgb,var(--success)_38%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,var(--bg-panel))]'
                      : notice.tone === 'loss'
                        ? 'border-[color-mix(in_srgb,var(--danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-panel))]'
                        : notice.tone === 'visual'
                          ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-panel))]'
                          : 'border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)]'

                  return (
                    <div key={notice.id} className={`panel-list-card flex items-center gap-3 px-3 py-2 shadow-[var(--shadow-panel)] backdrop-blur ${toneClassName}`}>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                        {notice.icon && iconAsset?.url ? (
                          <div
                            style={{
                              width: `${notice.icon.sourceWidth}px`,
                              height: `${notice.icon.sourceHeight}px`,
                              transform: `scale(${40 / notice.icon.sourceWidth})`,
                              transformOrigin: 'top left',
                              backgroundImage: `url("${iconAsset.url}")`,
                              backgroundPosition: `-${notice.icon.sourceX}px -${notice.icon.sourceY}px`,
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'pixelated',
                            }}
                          />
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            HUD
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{notice.title}</p>
                        <p className="truncate text-sm text-[var(--text-primary)]">{notice.detail}</p>
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
            <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{playbackState.pendingChoice.question}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {playbackState.pendingChoice.choices.map((choice, index) => (
                <button
                  key={`${choice.id}:${index}`}
                  type="button"
                  className="panel-list-card panel-list-card-interactive px-4 py-3 text-left text-sm text-[var(--text-primary)]"
                  onClick={() => handleSelectChoice(index)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : playbackState.currentEntry ? (
          <div className="panel-overlay-card pointer-events-none flex w-full max-w-4xl items-end gap-4">
            <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] sm:block">
              {currentDialogueActorAsset?.portraitUrl ? (
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
                <div className="flex h-full items-center justify-center text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {playbackState.currentEntry.title}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="panel-section-title">
                {playbackState.currentEntry.title}
              </p>
              <p className="mt-2 text-base leading-7 text-[var(--text-primary)]">{playbackState.currentEntry.detail}</p>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none rounded-full border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_84%,transparent)] px-4 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-panel)]">
            {labels.sceneIdle}
          </div>
        )}
      </div>
    </div>
  )


  if (!parsedEventAsset) {
    return (
      <div className="panel-surface panel-surface-flat h-full">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--text-secondary)]">
          <div className="space-y-3">
            <p className="text-base font-semibold text-[var(--text-primary)]">{labels.empty}</p>
            <p>{eventStatusMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-surface h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{labels.scene}</p>
          <p className="panel-subtitle">{mapMessage || eventStatusMessage}</p>
        </div>
      </div>
      <div className="panel-body h-[calc(100%-58px)] min-h-0 p-3">
        <div className="relative h-full">
          <MapViewport
            key={
              mapDocument
                ? `${mapDocument.sourcePath}:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
                : `empty:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
            }
            locale={locale}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            labels={viewportLabels}
            theme={theme}
            accentColor={accentColor}
            showGrid={showGrid}
            showStatsChips={false}
            contextMenuEnabled={false}
            initialZoom={EVENT_STAGE_INITIAL_ZOOM}
            mapOverlay={mapOverlay}
            viewportOverlay={viewportOverlay}
            focusWorldPoint={focusWorldPoint}
            onZoomChange={handleZoomChange}
          />
          <div className="workspace-viewport-toolbar" role="toolbar" aria-label={labels.scene}>
            <div className="workspace-viewport-toolbar-group">
              <button
                type="button"
                className="workspace-viewport-toolbar-icon-button"
                onClick={playNextFrame}
                title={labels.step}
                aria-label={labels.step}
                disabled={!selectedEvent}
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cx('workspace-viewport-toolbar-icon-button', autoPlay && 'workspace-viewport-toolbar-button-active')}
                onClick={toggleAutoPlayback}
                title={autoPlay ? labels.pause : labels.play}
                aria-label={autoPlay ? labels.pause : labels.play}
                aria-pressed={autoPlay}
                disabled={!selectedEvent}
              >
                {autoPlay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="workspace-viewport-toolbar-icon-button"
                onClick={resetPlayback}
                title={labels.reset}
                aria-label={labels.reset}
                disabled={!selectedEvent}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="workspace-viewport-toolbar-group workspace-viewport-toolbar-group-push">
              <button
                type="button"
                className={cx('workspace-viewport-toolbar-icon-button', showGrid && 'workspace-viewport-toolbar-button-active')}
                title={labels.toggleGrid}
                aria-label={labels.toggleGrid}
                aria-pressed={showGrid}
                disabled={!mapDocument}
                onClick={() => setShowGrid((current) => !current)}
              >
                <Grid2x2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cx('workspace-viewport-toolbar-icon-button', showMapPaths && 'workspace-viewport-toolbar-button-active')}
                title={labels.showPathsLayer}
                aria-label={labels.showPathsLayer}
                aria-pressed={showMapPaths}
                disabled={!mapDocument}
                onClick={() => setShowMapPaths((current) => !current)}
              >
                <Route className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="workspace-viewport-toolbar-icon-button"
                title={labels.configurePlayerAppearance}
                aria-label={labels.configurePlayerAppearance}
                onClick={onOpenPlayerAppearanceWindow}
              >
                <UserRound className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

