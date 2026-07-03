import {
  buildActorBreathingLayerDescriptor,
  buildSpriteLayerDescriptors,
  getActorRenderState,
  normalizeActorName,
  type ActorAssetState,
  type EventActorState,
} from '@entities/event'

type EventStageActorSpriteProps = {
  actor: EventActorState
  asset: ActorAssetState | undefined
  animationNowMs: number
  frameWidth: number
  frameHeight: number
  spriteColumns: number
  tileWidth: number
  tileHeight: number
  gamePixelScale: number
  viewportZoom: number
  showFallbackLabel?: boolean
}

export function EventStageActorSprite({
  actor,
  asset,
  animationNowMs,
  frameWidth,
  frameHeight,
  spriteColumns,
  tileWidth,
  tileHeight,
  gamePixelScale,
  viewportZoom,
  showFallbackLabel = false,
}: EventStageActorSpriteProps) {
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
  const actorWidth = tileWidth * (frameWidth / 16) * viewportZoom
  const actorHeight = tileHeight * (frameHeight / 16) * viewportZoom
  const pixelX =
    renderState.tileX * tileWidth * viewportZoom +
    renderState.offsetX * gamePixelScale * viewportZoom +
    renderState.shakeOffsetX * viewportZoom
  const pixelY =
    renderState.tileY * tileHeight * viewportZoom +
    (renderState.offsetY + renderState.breathingOffsetY) * gamePixelScale * viewportZoom +
    renderState.shakeOffsetY * viewportZoom -
    tileHeight * (frameHeight / 16 - 1) * viewportZoom
  const spriteScale = Math.max(1, actorWidth / frameWidth)
  const spriteTransform = asset?.farmerAppearance
    ? `scale(${spriteScale}, ${spriteScale})`
    : renderState.flip
      ? `translateX(${actorWidth}px) scale(${-spriteScale}, ${spriteScale})`
      : `scale(${spriteScale}, ${spriteScale})`

  return (
    <div
      className="absolute"
      data-event-stage-actor={normalizeActorName(actor.actorName)}
      style={{
        transform: `translate(${Math.round(pixelX)}px, ${Math.round(pixelY)}px)`,
        width: `${actorWidth}px`,
        height: `${actorHeight}px`,
        zIndex: Math.round(renderState.tileY * 100) + 50,
      }}
    >
      {spriteLayers.length > 0 ? (
        <div className="relative overflow-visible" style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}>
          <div
            className="relative"
            data-event-stage-actor-sprite={normalizeActorName(actor.actorName)}
            style={{
              width: `${frameWidth}px`,
              height: `${frameHeight}px`,
              transform: spriteTransform,
              transformOrigin: 'top left',
            }}
          >
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
                      layer.scaleX != null || layer.scaleY != null ? `scale(${layer.scaleX ?? 1}, ${layer.scaleY ?? 1})` : null,
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
