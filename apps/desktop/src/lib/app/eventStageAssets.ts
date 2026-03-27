import {
  bakeFarmerBaseTexture,
  bakeFarmerHairTexture,
  bakeFarmerPantsTexture,
  bakeFarmerShirtTexture,
  buildFarmerSpriteLayerDescriptors,
} from './farmerAppearanceRenderer'
import { loadImageDataUrl } from '../desktop'
import { toAssetUrl } from '../maps/assets'
import type { PlayerAppearanceProfile } from './playerAppearance'
import {
  DEFAULT_FARMER_HAIR_STYLE_INDEX,
  DEFAULT_FARMER_PANTS_SPRITE_INDEX,
  DEFAULT_FARMER_SHIRT_SPRITE_INDEX,
  MANUAL_TEXTURE_NAME_ALIASES,
  getActorWalkAnimationState,
  isFarmerActor,
  loadHatMetadataIndex,
  normalizeActorName,
  toLookupTokens,
  type ActorAssetRequest,
  type ActorAssetState,
  type ActorMovementState,
  type CharacterDataEntry,
  type CharacterTextureIndex,
  type EffectAssetState,
  type EventActorState,
  type FarmerAppearanceAssetState,
  type HatMetadataEntry,
  type ResolvedAssetCandidate,
  type SpriteLayerDescriptor,
  type StageEffectState,
} from './eventStageShared'

function buildCharacterTextureIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, CharacterDataEntry>
  const index: CharacterTextureIndex = {}

  for (const [characterName, entry] of Object.entries(parsed)) {
    const textureName = entry.TextureName?.trim() || characterName
    for (const token of toLookupTokens(characterName)) {
      index[token] = textureName
    }
    for (const alias of entry.FormerCharacterNames ?? []) {
      for (const token of toLookupTokens(alias)) {
        index[token] = textureName
      }
    }
  }

  return index
}

function getTextureCandidates(actorName: string, textureIndex: CharacterTextureIndex) {
  const normalized = normalizeActorName(actorName)
  if (!normalized || normalized === 'player' || normalized === 'spouse') {
    return []
  }

  if (normalized === 'farmer' || isFarmerActor(normalized)) {
    return ['Farmer\\farmer_base', 'Farmer\\farmer_girl_base']
  }

  const candidates: string[] = []
  for (const token of toLookupTokens(normalized)) {
    for (const alias of MANUAL_TEXTURE_NAME_ALIASES[token] ?? []) {
      candidates.push(alias)
    }

    const textureName = textureIndex[token]
    if (textureName) {
      candidates.push(textureName)
    }
  }

  candidates.push(normalized)
  if (normalized.includes(' ')) {
    candidates.push(normalized.replace(/\s+/gu, ''))
  }

  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)))
}

function getActorSpriteFrameHeight(actorName: string) {
  const normalized = normalizeActorName(actorName)

  if (normalized === 'Junimo') {
    return 16
  }

  if (normalized.includes('Dwarf') || normalized === 'Krobus') {
    return 24
  }

  return 32
}

function buildSpriteLayerDescriptors(
  asset: ActorAssetState | undefined,
  frame: number,
  facingDirection: number,
  frameWidth: number,
  frameHeight: number,
  spriteColumns: number,
  directionalFlip: boolean,
): SpriteLayerDescriptor[] {
  if (!asset?.spriteUrl) {
    return []
  }

  if (asset.farmerAppearance && frameWidth === 16 && frameHeight === 32) {
    return buildFarmerSpriteLayerDescriptors(asset.farmerAppearance, frame, facingDirection, asset.spriteUrl, directionalFlip)
  }

  const frameX = (frame % spriteColumns) * frameWidth
  const frameY = Math.floor(frame / spriteColumns) * frameHeight
  const recoloredBaseUrl = asset.farmerAppearance?.recoloredBaseTextureUrl ?? asset.spriteUrl
  return [
    {
      key: 'base',
      url: recoloredBaseUrl,
      width: frameWidth,
      height: frameHeight,
      offsetX: 0,
      offsetY: 0,
      sourceX: frameX,
      sourceY: frameY,
      flip: false,
    },
  ]
}

function getPortraitFrameBounds(asset: ActorAssetState | null, portraitIndex: number) {
  const frameWidth = 64
  const frameHeight = 64
  const sheetWidth = asset?.portraitSheetWidth ?? 0
  const sheetHeight = asset?.portraitSheetHeight ?? 0

  if (sheetWidth < frameWidth || sheetHeight < frameHeight) {
    return { frameWidth: Math.max(sheetWidth, frameWidth), frameHeight: Math.max(sheetHeight, frameHeight), frameX: 0, frameY: 0 }
  }

  const columns = Math.max(1, Math.floor(sheetWidth / frameWidth))
  const rows = Math.max(1, Math.floor(sheetHeight / frameHeight))
  const frameCount = Math.max(1, columns * rows)
  const clampedPortraitIndex = Math.max(0, Math.min(frameCount - 1, portraitIndex))

  return {
    frameWidth,
    frameHeight,
    frameX: (clampedPortraitIndex % columns) * frameWidth,
    frameY: Math.floor(clampedPortraitIndex / columns) * frameHeight,
  }
}

function getActorBreathSeed(actorName: string) {
  return normalizeActorName(actorName)
    .split('')
    .reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0)
}

function getAnimatedFrame(actor: EventActorState, nowMs: number) {
  const animation = actor.animation
  if (!animation || animation.frames.length === 0 || animation.frameDurationMs <= 0) {
    return { frame: actor.frame, flip: false, complete: true }
  }

  const elapsedMs = Math.max(0, nowMs - animation.startedAtMs)
  const rawIndex = Math.floor(elapsedMs / animation.frameDurationMs)

  if (animation.loop) {
    return {
      frame: animation.frames[rawIndex % animation.frames.length] ?? actor.frame,
      flip: animation.flip,
      complete: false,
    }
  }

  const clampedIndex = Math.min(animation.frames.length - 1, rawIndex)
  return {
    frame: animation.frames[clampedIndex] ?? actor.frame,
    flip: animation.flip,
    complete: rawIndex >= animation.frames.length - 1,
  }
}

function getMovementFacingDirection(movement: ActorMovementState, fallbackDirection: number) {
  const deltaTileX = movement.toTileX - movement.fromTileX
  const deltaTileY = movement.toTileY - movement.fromTileY

  if (Math.abs(deltaTileX) >= Math.abs(deltaTileY) && deltaTileX !== 0) {
    return deltaTileX > 0 ? 1 : 3
  }

  if (deltaTileY !== 0) {
    return deltaTileY > 0 ? 2 : 0
  }

  const deltaOffsetX = movement.toOffsetX - movement.fromOffsetX
  const deltaOffsetY = movement.toOffsetY - movement.fromOffsetY

  if (Math.abs(deltaOffsetX) >= Math.abs(deltaOffsetY) && deltaOffsetX !== 0) {
    return deltaOffsetX > 0 ? 1 : 3
  }

  if (deltaOffsetY !== 0) {
    return deltaOffsetY > 0 ? 2 : 0
  }

  return fallbackDirection
}

function getActorRenderState(actor: EventActorState, nowMs: number) {
  if (actor.animation) {
    const animatedFrame = getAnimatedFrame(actor, nowMs)
    return {
      tileX: actor.tileX,
      tileY: actor.tileY,
      offsetX: actor.offsetX,
      offsetY: actor.offsetY,
      frame: animatedFrame.frame,
      facingDirection: actor.facingDirection,
      flip: animatedFrame.flip,
      directionalFlip: actor.directionalFlip,
      breathingOffsetY: 0,
      breathingScale: 1,
      moving: false,
    }
  }

  if (actor.movement) {
    const progress = Math.max(0, Math.min(1, (nowMs - actor.movement.startedAtMs) / Math.max(1, actor.movement.durationMs)))
    const movementFacingDirection = getMovementFacingDirection(actor.movement, actor.facingDirection)
    const walkAnimation = getActorWalkAnimationState(actor.actorName, movementFacingDirection)
    const frameIndex = Math.floor((nowMs - actor.movement.startedAtMs) / 95) % walkAnimation.frames.length
    return {
      tileX: actor.movement.fromTileX + (actor.movement.toTileX - actor.movement.fromTileX) * progress,
      tileY: actor.movement.fromTileY + (actor.movement.toTileY - actor.movement.fromTileY) * progress,
      offsetX: actor.movement.fromOffsetX + (actor.movement.toOffsetX - actor.movement.fromOffsetX) * progress,
      offsetY: actor.movement.fromOffsetY + (actor.movement.toOffsetY - actor.movement.fromOffsetY) * progress,
      frame: walkAnimation.frames[frameIndex] ?? actor.frame,
      facingDirection: movementFacingDirection,
      flip: false,
      directionalFlip: walkAnimation.directionalFlip,
      breathingOffsetY: 0,
      breathingScale: 1,
      moving: progress < 1,
    }
  }

  const breathSeed = getActorBreathSeed(actor.actorName)
  const breathPhase = nowMs / 820 + breathSeed * 0.07
  return {
    tileX: actor.tileX,
    tileY: actor.tileY,
    offsetX: actor.offsetX,
    offsetY: actor.offsetY,
    frame: actor.frame,
    facingDirection: actor.facingDirection,
    flip: false,
    directionalFlip: actor.directionalFlip,
    breathingOffsetY: Math.sin(breathPhase) * 2.2,
    breathingScale: 1 + Math.sin(breathPhase + 0.8) * 0.028,
    moving: false,
  }
}

function getStageEffectPlayback(effect: StageEffectState, nowMs: number) {
  const elapsedMs = Math.max(0, nowMs - effect.startedAtMs - effect.delayBeforeStartMs)
  const active = nowMs - effect.startedAtMs >= effect.delayBeforeStartMs
  if (!active) {
    return {
      active: false,
      visible: false,
      frameIndex: 0,
      offsetX: 0,
      offsetY: 0,
      scale: effect.scale,
      opacity: effect.alpha,
      rotation: effect.rotation,
      finished: false,
    }
  }

  const frameDurationMs = effect.animationIntervalMs > 0 ? effect.animationIntervalMs : 99999
  const frameUnits = Math.max(0, Math.floor(elapsedMs / frameDurationMs))
  const cycleLength = effect.pingPong ? Math.max(1, effect.animationLength * 2 - 2) : effect.animationLength
  const totalFrames = Math.max(1, cycleLength)
  const finiteLoops = effect.loops > 0
  const totalUnits = finiteLoops ? totalFrames * effect.loops : Number.POSITIVE_INFINITY
  const finished = finiteLoops && frameUnits >= totalUnits

  if (finished && !effect.holdLastFrame) {
    return {
      active: true,
      visible: false,
      frameIndex: effect.animationLength - 1,
      offsetX: 0,
      offsetY: 0,
      scale: effect.scale,
      opacity: 0,
      rotation: effect.rotation,
      finished: true,
    }
  }

  const clampedUnits = finished ? Math.max(0, totalUnits - 1) : frameUnits
  const cycleIndex = totalFrames === 1 ? 0 : clampedUnits % totalFrames
  const frameIndex =
    effect.pingPong && effect.animationLength > 1
      ? cycleIndex < effect.animationLength
        ? cycleIndex
        : totalFrames - cycleIndex
      : Math.min(effect.animationLength - 1, cycleIndex)
  const framesElapsed = elapsedMs / 16.6667
  const periodicX =
    effect.xPeriodic && effect.xPeriodicLoopTimeMs > 0
      ? Math.sin((elapsedMs / effect.xPeriodicLoopTimeMs) * Math.PI * 2) * effect.xPeriodicRange
      : 0
  const periodicY =
    effect.yPeriodic && effect.yPeriodicLoopTimeMs > 0
      ? Math.sin((elapsedMs / effect.yPeriodicLoopTimeMs) * Math.PI * 2) * effect.yPeriodicRange
      : 0
  const pulseScale =
    effect.pulse && effect.pulseTimeMs > 0 ? 1 + (Math.sin((elapsedMs / effect.pulseTimeMs) * Math.PI * 2) + 1) * 0.5 * (effect.pulseAmount - 1) : 1
  const opacity = Math.max(0, effect.alpha - effect.alphaFade * framesElapsed)
  const shakeOffsetX = effect.shakeIntensity > 0 ? Math.sin(elapsedMs / 30) * effect.shakeIntensity * 4 : 0
  const shakeOffsetY = effect.shakeIntensity > 0 ? Math.cos(elapsedMs / 24) * effect.shakeIntensity * 2 : 0

  return {
    active: true,
    visible: opacity > 0.001,
    frameIndex: Math.max(0, frameIndex),
    offsetX: effect.motionX * framesElapsed + 0.5 * effect.accelerationX * framesElapsed * framesElapsed + periodicX + shakeOffsetX,
    offsetY: effect.motionY * framesElapsed + 0.5 * effect.accelerationY * framesElapsed * framesElapsed + periodicY + shakeOffsetY,
    scale: Math.max(0.01, (effect.scale + effect.scaleChange * framesElapsed) * pulseScale),
    opacity,
    rotation: effect.rotation + effect.rotationChange * framesElapsed,
    finished,
  }
}

function getStageEffectSortValue(effect: StageEffectState) {
  if (Number.isFinite(effect.layerDepth) && effect.layerDepth > 0) {
    return Math.round(effect.layerDepth * 10000)
  }

  return Math.round(effect.baseY)
}

function buildAssetPath(rootPath: string, folderName: 'Characters' | 'Portraits', textureName: string) {
  return `${rootPath}\\Content (unpacked)\\${folderName}\\${textureName}.png`
}

function buildContentImagePath(rootPath: string, textureName: string) {
  return `${rootPath}\\Content (unpacked)\\${textureName.replaceAll('/', '\\')}.png`
}

function preloadImage(path: string) {
  return new Promise<{ image: HTMLImageElement; url: string; width: number; height: number } | null>((resolve) => {
    const image = new Image()
    const fallbackUrl = toAssetUrl(path)

    const loadWithUrl = (url: string) => {
      image.onload = () =>
        resolve({
          image,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
      image.onerror = () => resolve(null)
      image.src = url
    }

    loadImageDataUrl(path)
      .then((dataUrl: string) => loadWithUrl(dataUrl || fallbackUrl))
      .catch(() => loadWithUrl(fallbackUrl))
  })
}

async function resolveContentImage(rootPath: string, textureName: string) {
  const path = buildContentImagePath(rootPath, textureName)
  const image = await preloadImage(path)
  if (!image) {
    return null
  }

  return {
    textureName,
    path,
    url: image.url,
    width: image.width,
    height: image.height,
    image: image.image,
  }
}

async function resolveFirstExistingImage(
  rootPath: string,
  folderName: 'Characters' | 'Portraits',
  textureCandidates: string[],
): Promise<ResolvedAssetCandidate | null> {
  for (const textureName of textureCandidates) {
    const path = buildAssetPath(rootPath, folderName, textureName)
    const image = await preloadImage(path)
    if (image) {
      return { textureName, path, url: image.url, width: image.width, height: image.height, image: image.image }
    }
  }

  return null
}

async function resolveEffectAsset(textureName: string, rootPath: string | null): Promise<EffectAssetState> {
  if (!rootPath) {
    return {
      requestKey: `${rootPath ?? ''}::${textureName}`,
      textureName,
      path: null,
      url: null,
      width: null,
      height: null,
    }
  }

  const path = buildContentImagePath(rootPath, textureName)
  const image = await preloadImage(path)

  return {
    requestKey: `${rootPath}::${textureName}`,
    textureName,
    path: image ? path : null,
    url: image?.url ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
  }
}

async function resolveFarmerAppearanceAssets(
  rootPath: string,
  spriteAsset: ResolvedAssetCandidate | null,
  profile: PlayerAppearanceProfile | null,
): Promise<FarmerAppearanceAssetState | null> {
  const isFemale = profile?.isFemale ?? (spriteAsset?.textureName?.includes('girl') ?? false)
  const [hairAsset, shirtsAsset, pantsAsset, accessoriesAsset, hatsAsset, skinColorsAsset, shoeColorsAsset] = await Promise.all([
    resolveContentImage(rootPath, 'Characters/Farmer/hairstyles'),
    resolveContentImage(rootPath, 'Characters/Farmer/shirts'),
    resolveContentImage(rootPath, 'Characters/Farmer/pants'),
    resolveContentImage(rootPath, 'Characters/Farmer/accessories'),
    resolveContentImage(rootPath, 'Characters/Farmer/hats'),
    resolveContentImage(rootPath, 'Characters/Farmer/skinColors'),
    resolveContentImage(rootPath, 'Characters/Farmer/shoeColors'),
  ])

  if (!spriteAsset && !hairAsset && !shirtsAsset && !pantsAsset && !accessoriesAsset && !hatsAsset) {
    return null
  }

  const hatMetadataIndex: Record<string, HatMetadataEntry> = profile?.hatItemId ? await loadHatMetadataIndex(rootPath) : {}
  const hatMetadata = profile?.hatItemId ? hatMetadataIndex[profile.hatItemId] : undefined

  return {
    isFemale,
    hairStyleIndex: profile?.hairStyleIndex ?? DEFAULT_FARMER_HAIR_STYLE_INDEX,
    shirtSpriteIndex: profile?.shirtSpriteIndex ?? DEFAULT_FARMER_SHIRT_SPRITE_INDEX,
    pantsSpriteIndex: profile?.pantsSpriteIndex ?? DEFAULT_FARMER_PANTS_SPRITE_INDEX,
    accessoryIndex: profile?.accessoryIndex ?? -1,
    hatSpriteIndex: profile?.hatSpriteIndex ?? null,
    hatHairDrawMode: hatMetadata?.hairDrawMode ?? 'normal',
    hatIgnoreHairstyleOffset: hatMetadata?.ignoreHairstyleOffset ?? false,
    recoloredBaseTextureUrl: bakeFarmerBaseTexture(profile, spriteAsset, shirtsAsset, skinColorsAsset, shoeColorsAsset),
    hairTextureUrl: hairAsset?.url ?? null,
    bakedHairTextureUrl: bakeFarmerHairTexture(profile, hairAsset),
    shirtsTextureUrl: shirtsAsset?.url ?? null,
    bakedShirtTextureUrl: bakeFarmerShirtTexture(profile, shirtsAsset),
    pantsTextureUrl: pantsAsset?.url ?? null,
    bakedPantsTextureUrl: bakeFarmerPantsTexture(profile, pantsAsset),
    accessoriesTextureUrl: accessoriesAsset?.url ?? null,
    hatsTextureUrl: hatsAsset?.url ?? null,
    accessoriesTextureWidth: accessoriesAsset?.width ?? null,
    hatsTextureWidth: hatsAsset?.width ?? null,
  }
}

async function resolveActorAssets(request: ActorAssetRequest, rootPath: string | null): Promise<ActorAssetState> {
  if (!rootPath || request.spriteTextureCandidates.length === 0) {
    return {
      requestKey: request.requestKey,
      textureName: null,
      spriteTextureName: null,
      portraitTextureName: null,
      spritePath: null,
      spriteUrl: null,
      spriteSheetWidth: null,
      spriteSheetHeight: null,
      portraitPath: null,
      portraitUrl: null,
      portraitSheetWidth: null,
      portraitSheetHeight: null,
      farmerAppearance: null,
    }
  }

  const [spriteAsset, portraitAsset] = await Promise.all([
    resolveFirstExistingImage(rootPath, 'Characters', request.spriteTextureCandidates),
    resolveFirstExistingImage(rootPath, 'Portraits', request.portraitTextureCandidates),
  ])
  const normalizedActorName = normalizeActorName(request.actorName)
  const farmerAppearance =
    normalizedActorName === 'farmer' || isFarmerActor(normalizedActorName)
      ? await resolveFarmerAppearanceAssets(
          rootPath,
          spriteAsset,
          request.farmerAppearanceProfile,
        )
      : null

  return {
    requestKey: request.requestKey,
    textureName:
      spriteAsset?.textureName ?? portraitAsset?.textureName ?? request.portraitTextureCandidates[0] ?? request.spriteTextureCandidates[0] ?? null,
    spriteTextureName: spriteAsset?.textureName ?? null,
    portraitTextureName: portraitAsset?.textureName ?? null,
    spritePath: spriteAsset?.path ?? null,
    spriteUrl: spriteAsset?.url ?? null,
    spriteSheetWidth: spriteAsset?.width ?? null,
    spriteSheetHeight: spriteAsset?.height ?? null,
    portraitPath: portraitAsset?.path ?? null,
    portraitUrl: portraitAsset?.url ?? null,
    portraitSheetWidth: portraitAsset?.width ?? null,
    portraitSheetHeight: portraitAsset?.height ?? null,
    farmerAppearance,
  }
}

function areAssetMapsEqual(left: Record<string, ActorAssetState>, right: Record<string, ActorAssetState>) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key] === right[key])
}


export {
  areAssetMapsEqual,
  buildCharacterTextureIndex,
  buildSpriteLayerDescriptors,
  getActorRenderState,
  getActorSpriteFrameHeight,
  getAnimatedFrame,
  getPortraitFrameBounds,
  getStageEffectPlayback,
  getStageEffectSortValue,
  getTextureCandidates,
  resolveActorAssets,
  resolveEffectAsset,
}

