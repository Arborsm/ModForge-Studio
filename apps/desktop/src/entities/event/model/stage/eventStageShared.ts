import { loadTextAsset } from '@entities/game/api'
import type { LocaleCode } from '@locales/editor-shell'
import {
  getFarmerDirectionalFrame,
  getFarmerWalkAnimation,
  type FarmerAppearanceCompositeAssets,
  type FarmerHairMetadataEntry,
  type FarmerSpriteLayerDescriptor,
} from './farmerAppearanceRenderer'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { EventCommand, EventDialoguePage, EventSceneActor, EventScript } from '@entities/event'


type PlaybackLogEntry = {
  id: string
  tone: 'dialogue' | 'message' | 'choice' | 'command' | 'system'
  title: string
  detail: string
  actorName?: string
  portraitIndex?: number
}

type PlaybackChoiceState = {
  command: EventCommand
  question: string
  choices: NonNullable<EventCommand['choices']>
}

type PlaybackNoticeTone = 'system' | 'info' | 'gain' | 'loss' | 'visual'

type PlaybackNoticeIcon = {
  textureName: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
}

type PlaybackNotice = {
  id: string
  title: string
  detail: string
  tone: PlaybackNoticeTone
  startedAtMs: number
  durationMs: number
  icon?: PlaybackNoticeIcon | null
}

type ScreenFlashState = {
  color: string
  alpha: number
  startedAtMs: number
  durationMs: number
}

type FadeOverlayState = {
  color: string
  alpha: number
  startAlpha: number
  targetAlpha: number
  startedAtMs: number
  durationMs: number
  nextTargetAlpha: number | null
  nextDurationMs: number | null
}

type ActorAnimationFrameState = {
  frame: number
  durationMs: number
  flip: boolean
  positionOffset: number
  xOffset: number
  armOffset: number
}

type ActorAnimationState = {
  frames: ActorAnimationFrameState[]
  loop: boolean
  startedAtMs: number
  pauseForSingleAnimation: boolean
}

type ActorMovementState = {
  fromTileX: number
  fromTileY: number
  toTileX: number
  toTileY: number
  fromOffsetX: number
  fromOffsetY: number
  toOffsetX: number
  toOffsetY: number
  startedAtMs: number
  durationMs: number
}

type StageEffectSpace = 'world' | 'screen'

type StageEffectState = {
  id: string
  effectNumericId: number | null
  commandId: string
  textureName: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  baseX: number
  baseY: number
  space: StageEffectSpace
  animationIntervalMs: number
  animationLength: number
  loops: number
  flip: boolean
  layerDepth: number
  alpha: number
  alphaFade: number
  scale: number
  scaleChange: number
  rotation: number
  rotationChange: number
  motionX: number
  motionY: number
  accelerationX: number
  accelerationY: number
  holdLastFrame: boolean
  pingPong: boolean
  startedAtMs: number
  delayBeforeStartMs: number
  color: string | null
  xPeriodic: boolean
  yPeriodic: boolean
  xPeriodicLoopTimeMs: number
  yPeriodicLoopTimeMs: number
  xPeriodicRange: number
  yPeriodicRange: number
  pulse: boolean
  pulseTimeMs: number
  pulseAmount: number
  shakeIntensity: number
}

type EventActorState = {
  id: string
  actorName: string
  tileX: number
  tileY: number
  offsetX: number
  offsetY: number
  visible: boolean
  facingDirection: number
  frame: number
  directionalFlip: boolean
  portraitOverrideSuffix: string | null
  spriteOverrideSuffix: string | null
  animation: ActorAnimationState | null
  movement: ActorMovementState | null
  breatherOverride: boolean | null
  shakeStartedAtMs: number | null
  shakeDurationMs: number
  farmerPassesThrough: boolean
  farmerRenderState: FarmerRenderState | null
}

type FarmerRenderState = {
  currentEyes: number
  blinkTimerMs: number
  eyesSetAtMs: number
  swimming: boolean
  bathingClothes: boolean
  isInBed: boolean
  timeWentToBed: number
  timeOfDay: number
  pauseForSingleAnimation: boolean
  usingTool: boolean
  toolKind: 'none' | 'fishingRod' | 'slingshot' | 'other'
  fishingRodIsCasting: boolean
  armOffset: number
  slingshotAimRadians: number | null
  slingshotBackArmDistance: number
  lastMovementEndedAtMs: number
}

type ActiveDialogueState = {
  commandId: string
  actorName: string
  pages: EventDialoguePage[]
  pageIndex: number
}

type PlaybackState = {
  rootEventKey: string | null
  activeEventKey: string | null
  currentMapName: string | null
  commands: EventCommand[]
  pointer: number
  forkFlag: boolean
  actors: Record<string, EventActorState>
  stageEffects: StageEffectState[]
  currentEntry: PlaybackLogEntry | null
  currentCommandId: string | null
  activeDialogue: ActiveDialogueState | null
  pendingChoice: PlaybackChoiceState | null
  waitingMs: number | null
  waitingStartedAtMs: number | null
  blockingMovement: boolean
  focusTile: { tileX: number; tileY: number } | null
  notices: PlaybackNotice[]
  ambientOverlayColor: string | null
  fadeOverlay: FadeOverlayState | null
  flashOverlay: ScreenFlashState | null
  activeMusicCue: string | null
  activeSoundCue: string | null
  ended: boolean
}

type StagePoint = {
  X: number
  Y: number
}

type StageRectangle = {
  X: number
  Y: number
  Width: number
  Height: number
}

type CharacterDataEntry = {
  TextureName?: string | null
  FormerCharacterNames?: string[] | null
  Breather?: boolean | null
  BreathChestRect?: StageRectangle | null
  BreathChestPosition?: StagePoint | null
  Age?: string | null
  Gender?: string | null
}

type ObjectDataEntry = {
  IsDrink?: boolean | null
}

type CharacterVisualMetadata = {
  textureName: string
  breather: boolean
  breathChestRect: StageRectangle | null
  breathChestPosition: StagePoint | null
  age: string | null
  gender: string | null
}

type CharacterTextureIndex = Record<string, CharacterVisualMetadata>

type ActorAssetRequest = {
  actorKey: string
  actorName: string
  requestKey: string
  spriteTextureCandidates: string[]
  portraitTextureCandidates: string[]
  farmerAppearanceProfile: PlayerAppearanceProfile | null
  characterMetadata: CharacterVisualMetadata | null
}

type ActorAssetState = {
  requestKey: string
  textureName: string | null
  spriteTextureName: string | null
  portraitTextureName: string | null
  spritePath: string | null
  spriteUrl: string | null
  spriteSheetWidth: number | null
  spriteSheetHeight: number | null
  portraitPath: string | null
  portraitUrl: string | null
  portraitSheetWidth: number | null
  portraitSheetHeight: number | null
  farmerAppearance: FarmerAppearanceAssetState | null
  characterMetadata: CharacterVisualMetadata | null
}

type FarmerAppearanceAssetState = FarmerAppearanceCompositeAssets

type ResolvedAssetCandidate = {
  textureName: string
  path: string
  url: string
  width: number
  height: number
  image: HTMLImageElement
}

type EffectAssetState = {
  requestKey: string
  textureName: string
  path: string | null
  url: string | null
  width: number | null
  height: number | null
}

type SpecificTemporarySpriteResolution = {
  effects: StageEffectState[]
  mode:
    | 'append'
    | 'remove-by-id'
    | 'update-boombox-start'
    | 'update-boombox-stop'
    | 'replace-jas-gift'
    | 'update-shake'
    | 'update-replace-source'
    | 'update-remove-all-id-1'
    | 'update-curtain'
    | 'update-secret-gift'
    | 'update-grandpa-spirit'
    | 'update-leah-painting-hold'
    | 'update-leah-painting-release'
    | 'update-farmer-hold-painting'
    | 'update-candle-boat'
    | 'update-parrot-perch-squawk'
    | 'update-frog-jump'
    | 'update-raccoon-dance'
  effectNumericId?: number | null
  shakeIntensity?: number
  sourceRect?: { x: number; y: number; width: number; height: number }
}

const FARMER_NAME_PATTERN = /^farmer\d*$/iu
const DEFAULT_FARMER_HAIR_STYLE_INDEX = 0
const DEFAULT_FARMER_SHIRT_SPRITE_INDEX = 0
const DEFAULT_FARMER_PANTS_SPRITE_INDEX = 0
const EVENT_STAGE_INITIAL_ZOOM = 2.5
type SpriteLayerDescriptor = FarmerSpriteLayerDescriptor
const CHARACTER_DATA_PATH = 'Content\\Data\\Characters.xnb'
const OBJECT_DATA_PATH = 'Content\\Data\\Objects.xnb'
const HAIR_DATA_PATH = 'Content\\Data\\HairData.xnb'
const HAT_DATA_PATH = 'Content\\Data\\hats.xnb'
const EFFECT_VIEWPORT_BASE_WIDTH = 1280
const EFFECT_VIEWPORT_BASE_HEIGHT = 720
type HatMetadataEntry = {
  hairDrawMode: 'normal' | 'hide' | 'cover'
  ignoreHairstyleOffset: boolean
  isMask: boolean
}
const MANUAL_TEXTURE_NAME_ALIASES: Record<string, string[]> = {
  leahex: ['LeahExFemale', 'LeahExMale', 'LeahEx'],
}
const NAMED_EFFECT_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  orange: '#ffa500',
  pink: '#ff7ab8',
  lime: '#7cff00',
  deepskyblue: '#00bfff',
}
const hatMetadataCache = new Map<string, Promise<Record<string, HatMetadataEntry>>>()
const hairMetadataCache = new Map<string, Promise<Record<string, FarmerHairMetadataEntry>>>()

export function clearLocalizedStageMetadataCache(locale: LocaleCode) {
  const suffix = `::${locale}`
  for (const key of hatMetadataCache.keys()) {
    if (key.endsWith(suffix)) {
      hatMetadataCache.delete(key)
    }
  }
  for (const key of hairMetadataCache.keys()) {
    if (key.endsWith(suffix)) {
      hairMetadataCache.delete(key)
    }
  }
}

export function getStageMetadataCacheStats() {
  return {
    hat: hatMetadataCache.size,
    hair: hairMetadataCache.size,
  }
}

function normalizeActorName(value: string) {
  return value.trim().replace(/\?$/u, '')
}

function toActorKey(actorName: string) {
  return normalizeActorName(actorName).toLowerCase()
}

function toLookupTokens(value: string) {
  const normalized = normalizeActorName(value).toLowerCase()
  const compact = normalized.replace(/[\s'"._-]+/gu, '')

  return Array.from(new Set([normalized, compact].filter(Boolean)))
}

function isFarmerActor(actorName: string) {
  return FARMER_NAME_PATTERN.test(normalizeActorName(actorName))
}

function getDefaultFrame(direction: number) {
  switch (direction) {
    case 0:
      return 8
    case 1:
      return 4
    case 3:
      return 12
    default:
      return 0
  }
}

function getActorDefaultFrameState(actorName: string, direction: number) {
  return isFarmerActor(actorName) ? getFarmerDirectionalFrame(direction) : { frame: getDefaultFrame(direction), directionalFlip: false }
}

function getActorWalkAnimationState(actorName: string, direction: number) {
  if (isFarmerActor(actorName)) {
    return getFarmerWalkAnimation(direction)
  }

  const baseFrame = getDefaultFrame(direction)
  return {
    frames: [baseFrame + 1, baseFrame, baseFrame + 2, baseFrame],
    directionalFlip: false,
  }
}

function getInitialActorOffset() {
  return { offsetX: 0, offsetY: 0 }
}

function deriveEventTimeOfDay(event: EventScript | null) {
  if (!event) {
    return 1200
  }

  for (const precondition of event.preconditions.slice(1)) {
    const match = /^t\s+(\d+)/iu.exec(precondition.trim())
    if (match) {
      const timeOfDay = Number.parseInt(match[1] ?? '', 10)
      if (Number.isFinite(timeOfDay)) {
        return timeOfDay
      }
    }
  }

  return 1200
}

function createFarmerRenderState(nowMs = performance.now()): FarmerRenderState {
  return {
    currentEyes: 0,
    blinkTimerMs: 0,
    eyesSetAtMs: nowMs,
    swimming: false,
    bathingClothes: false,
    isInBed: false,
    timeWentToBed: 0,
    timeOfDay: 1200,
    pauseForSingleAnimation: false,
    usingTool: false,
    toolKind: 'none',
    fishingRodIsCasting: true,
    armOffset: 6,
    slingshotAimRadians: null,
    slingshotBackArmDistance: 8,
    lastMovementEndedAtMs: nowMs,
  }
}

function getFadeDurationMsFromSpeed(speed: number, startAlpha: number, targetAlpha: number) {
  const alphaDelta = Math.abs(targetAlpha - startAlpha)
  const normalizedSpeed = Math.max(0.0001, Math.abs(speed))
  return Math.max(1, Math.round((alphaDelta / normalizedSpeed) * 16.6667))
}

function createFadeOverlayState({
  color,
  startAlpha,
  targetAlpha,
  startedAtMs = performance.now(),
  durationMs,
  nextTargetAlpha = null,
  nextDurationMs = null,
}: {
  color: string
  startAlpha: number
  targetAlpha: number
  startedAtMs?: number
  durationMs: number
  nextTargetAlpha?: number | null
  nextDurationMs?: number | null
}): FadeOverlayState {
  const clampedStartAlpha = Math.max(0, Math.min(1, startAlpha))
  const clampedTargetAlpha = Math.max(0, Math.min(1, targetAlpha))

  return {
    color,
    alpha: clampedStartAlpha,
    startAlpha: clampedStartAlpha,
    targetAlpha: clampedTargetAlpha,
    startedAtMs,
    durationMs: Math.max(0, durationMs),
    nextTargetAlpha,
    nextDurationMs,
  }
}

function resolveFadeOverlayAlpha(fadeOverlay: FadeOverlayState | null, nowMs: number) {
  if (!fadeOverlay) {
    return 0
  }

  if (fadeOverlay.durationMs <= 0) {
    return fadeOverlay.targetAlpha
  }

  const progress = Math.max(0, Math.min(1, (nowMs - fadeOverlay.startedAtMs) / fadeOverlay.durationMs))
  return fadeOverlay.startAlpha + (fadeOverlay.targetAlpha - fadeOverlay.startAlpha) * progress
}

function isFadeOverlayAnimating(fadeOverlay: FadeOverlayState | null, nowMs: number) {
  return Boolean(fadeOverlay && fadeOverlay.durationMs > 0 && nowMs < fadeOverlay.startedAtMs + fadeOverlay.durationMs)
}

function advanceFadeOverlayState(fadeOverlay: FadeOverlayState | null, nowMs: number) {
  if (!fadeOverlay) {
    return fadeOverlay
  }

  if (fadeOverlay.durationMs > 0 && nowMs < fadeOverlay.startedAtMs + fadeOverlay.durationMs) {
    return fadeOverlay
  }

  const settledAlpha = fadeOverlay.targetAlpha
  if (fadeOverlay.nextTargetAlpha != null) {
    return createFadeOverlayState({
      color: fadeOverlay.color,
      startAlpha: settledAlpha,
      targetAlpha: fadeOverlay.nextTargetAlpha,
      startedAtMs: nowMs,
      durationMs: fadeOverlay.nextDurationMs ?? fadeOverlay.durationMs,
    })
  }

  if (settledAlpha <= 0.001) {
    return null
  }

  return {
    ...fadeOverlay,
    alpha: settledAlpha,
    startAlpha: settledAlpha,
    targetAlpha: settledAlpha,
    startedAtMs: nowMs,
    durationMs: 0,
    nextTargetAlpha: null,
    nextDurationMs: null,
  }
}

function applyEventFarmerStateSeeds(event: EventScript, actors: Record<string, EventActorState>) {
  const timeOfDay = deriveEventTimeOfDay(event)
  return Object.fromEntries(
    Object.entries(actors).map(([actorKey, actor]) => [
      actorKey,
      actor.farmerRenderState
        ? {
            ...actor,
            farmerRenderState: {
              ...actor.farmerRenderState,
              timeOfDay,
            },
          }
        : actor,
    ]),
  ) as Record<string, EventActorState>
}

function createActorState(actor: EventSceneActor): EventActorState {
  const initialOffset = getInitialActorOffset()
  const frameState = getActorDefaultFrameState(actor.actorName, actor.facingDirection)
  const nowMs = performance.now()

  return {
    id: actor.id,
    actorName: actor.actorName,
    tileX: actor.tileX,
    tileY: actor.tileY,
    offsetX: initialOffset.offsetX,
    offsetY: initialOffset.offsetY,
    visible: actor.tileX >= 0 && actor.tileY >= 0,
    facingDirection: actor.facingDirection,
    frame: frameState.frame,
    directionalFlip: frameState.directionalFlip,
    portraitOverrideSuffix: null,
    spriteOverrideSuffix: null,
    animation: null,
    movement: null,
    breatherOverride: actor.breather ?? null,
    shakeStartedAtMs: null,
    shakeDurationMs: 0,
    farmerPassesThrough: false,
    farmerRenderState: isFarmerActor(actor.actorName) ? createFarmerRenderState(nowMs) : null,
  }
}

function buildActorMap(event: EventScript) {
  return Object.fromEntries(
    event.scene.actors.map((actor) => [toActorKey(actor.actorName), createActorState(actor)]),
  ) as Record<string, EventActorState>
}

function parsePoint(valueA: string | undefined, valueB: string | undefined) {
  const tileX = Number.parseInt(valueA ?? '', 10)
  const tileY = Number.parseInt(valueB ?? '', 10)
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return null
  }

  return { tileX, tileY }
}

function parseNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

function parseBoolean(value: string | undefined, defaultValue = false) {
  if (value == null) {
    return defaultValue
  }

  return value === 'true'
}

function normalizeStageMapName(mapName: string | null | undefined) {
  const trimmed = mapName?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^Maps[\\/]/iu, '').replace(/\.xnb$/iu, '')
}

function isPathsLayerName(layerName: string) {
  const normalized = layerName.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '')
  return normalized === 'paths' || normalized.startsWith('paths')
}

function parseEffectColor(value: string | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (/^#[0-9a-f]{3,8}$/iu.test(normalized)) {
    return normalized
  }

  return NAMED_EFFECT_COLORS[normalized] ?? null
}

function clampColorChannel(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(0, Math.min(255, parsed))
}

function parseRgbColorFromArgs(args: string[], startIndex: number) {
  const red = clampColorChannel(args[startIndex])
  const green = clampColorChannel(args[startIndex + 1])
  const blue = clampColorChannel(args[startIndex + 2])
  if (red == null || green == null || blue == null) {
    return null
  }

  return `rgb(${red} ${green} ${blue})`
}

const ITEM_TOKEN_ALIASES: Record<string, string> = {
  pan: '(T)Pan',
  hero: '(BC)116',
  sculpture: '(F)1306',
  samboombox: '(F)1309',
  joja: '(BC)117',
  slimeegg: '(O)680',
  rod: '(T)BambooPole',
  sword: '(W)0',
  ore: '(O)334',
  pot: '(BC)62',
  jukebox: '(BC)209',
}

function normalizeEventItemId(rawItemId: string | undefined) {
  const trimmed = rawItemId?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  return ITEM_TOKEN_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

function parseSpringObjectIndexFromItemId(rawItemId: string | undefined) {
  const itemId = normalizeEventItemId(rawItemId)
  if (!itemId) {
    return null
  }

  const objectMatch = /^\(O\)(\d+)$/u.exec(itemId)
  if (objectMatch) {
    return Number.parseInt(objectMatch[1] ?? '', 10)
  }

  if (/^\d+$/u.test(itemId)) {
    return Number.parseInt(itemId, 10)
  }

  return null
}

function createNoticeIconForItemId(rawItemId: string | undefined): PlaybackNoticeIcon | null {
  const itemIndex = parseSpringObjectIndexFromItemId(rawItemId)
  if (itemIndex == null) {
    return null
  }

  const sourceRect = getSpringObjectsSourceRect(itemIndex)
  return {
    textureName: 'Maps\\springobjects',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
  }
}

function prunePlaybackNotices(notices: PlaybackNotice[], nowMs: number) {
  return notices.filter((notice) => nowMs - notice.startedAtMs < notice.durationMs)
}

function enqueuePlaybackNotice(
  state: PlaybackState,
  notice: Omit<PlaybackNotice, 'id' | 'startedAtMs'> & { id?: string },
  nowMs = performance.now(),
) {
  const nextNotice: PlaybackNotice = {
    id: notice.id ?? `${state.currentCommandId ?? 'notice'}:${nowMs}`,
    startedAtMs: nowMs,
    durationMs: notice.durationMs,
    title: notice.title,
    detail: notice.detail,
    tone: notice.tone,
    icon: notice.icon ?? null,
  }

  return [...prunePlaybackNotices(state.notices, nowMs), nextNotice].slice(-4)
}

function buildStageEffectId(commandId: string, suffix: string) {
  return `${commandId}:effect:${suffix}`
}

function createStageEffect(
  commandId: string,
  suffix: string,
  partial: Partial<StageEffectState> & Pick<StageEffectState, 'textureName' | 'sourceWidth' | 'sourceHeight'>,
): StageEffectState {
  return {
    id: buildStageEffectId(commandId, suffix),
    effectNumericId: partial.effectNumericId ?? null,
    commandId,
    textureName: partial.textureName,
    sourceX: partial.sourceX ?? 0,
    sourceY: partial.sourceY ?? 0,
    sourceWidth: partial.sourceWidth,
    sourceHeight: partial.sourceHeight,
    baseX: partial.baseX ?? 0,
    baseY: partial.baseY ?? 0,
    space: partial.space ?? 'world',
    animationIntervalMs: partial.animationIntervalMs ?? 99999,
    animationLength: Math.max(1, partial.animationLength ?? 1),
    loops: partial.loops ?? 1,
    flip: partial.flip ?? false,
    layerDepth: partial.layerDepth ?? 1,
    alpha: partial.alpha ?? 1,
    alphaFade: partial.alphaFade ?? 0,
    scale: partial.scale ?? 4,
    scaleChange: partial.scaleChange ?? 0,
    rotation: partial.rotation ?? 0,
    rotationChange: partial.rotationChange ?? 0,
    motionX: partial.motionX ?? 0,
    motionY: partial.motionY ?? 0,
    accelerationX: partial.accelerationX ?? 0,
    accelerationY: partial.accelerationY ?? 0,
    holdLastFrame: partial.holdLastFrame ?? false,
    pingPong: partial.pingPong ?? false,
    startedAtMs: partial.startedAtMs ?? performance.now(),
    delayBeforeStartMs: partial.delayBeforeStartMs ?? 0,
    color: partial.color ?? null,
    xPeriodic: partial.xPeriodic ?? false,
    yPeriodic: partial.yPeriodic ?? false,
    xPeriodicLoopTimeMs: partial.xPeriodicLoopTimeMs ?? 0,
    yPeriodicLoopTimeMs: partial.yPeriodicLoopTimeMs ?? 0,
    xPeriodicRange: partial.xPeriodicRange ?? 0,
    yPeriodicRange: partial.yPeriodicRange ?? 0,
    pulse: partial.pulse ?? false,
    pulseTimeMs: partial.pulseTimeMs ?? 420,
    pulseAmount: partial.pulseAmount ?? 1.12,
    shakeIntensity: partial.shakeIntensity ?? 0,
  }
}

function getSpringObjectsSourceRect(itemIndex: number) {
  const sheetWidth = 384
  const tileSize = 16
  const pixelOffset = itemIndex * tileSize
  return {
    x: pixelOffset % sheetWidth,
    y: Math.floor(pixelOffset / sheetWidth) * tileSize,
    width: tileSize,
    height: tileSize,
  }
}

function createObjectSheetEffect(
  commandId: string,
  suffix: string,
  itemIndex: number,
  partial: Partial<StageEffectState>,
) {
  const sourceRect = getSpringObjectsSourceRect(itemIndex)
  return createStageEffect(commandId, suffix, {
    textureName: 'Maps\\springobjects',
    sourceX: sourceRect.x,
    sourceY: sourceRect.y,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    ...partial,
  })
}

function createAnimationRowEffect(
  commandId: string,
  suffix: string,
  rowInAnimationTexture: number,
  partial: Partial<StageEffectState>,
) {
  return createStageEffect(commandId, suffix, {
    textureName: 'TileSheets\\animations',
    sourceX: 0,
    sourceY: rowInAnimationTexture * 64,
    sourceWidth: 64,
    sourceHeight: 64,
    scale: 1,
    ...partial,
  })
}

function createItemAtTileEffect(commandId: string, suffix: string, tileX: number, tileY: number, rawItemId: string | undefined) {
  const itemIndex = parseSpringObjectIndexFromItemId(rawItemId)
  if (itemIndex == null) {
    return null
  }

  return createObjectSheetEffect(commandId, suffix, itemIndex, {
    baseX: tileX * 64 + 16,
    baseY: tileY * 64 + 16,
    space: 'world',
    scale: 4,
    layerDepth: (tileY * 64 + 32) / 10000,
  })
}

function createItemAboveActorEffect(
  commandId: string,
  suffix: string,
  actors: Record<string, EventActorState>,
  actorName: string | undefined,
  rawItemId: string | undefined,
) {
  if (!actorName) {
    return null
  }

  const actor = getActorByName(actors, actorName)
  const itemIndex = parseSpringObjectIndexFromItemId(rawItemId)
  if (!actor || itemIndex == null) {
    return null
  }

  return createObjectSheetEffect(commandId, suffix, itemIndex, {
    baseX: actor.tileX * 64 + actor.offsetX + 16,
    baseY: actor.tileY * 64 + actor.offsetY - 80,
    space: 'world',
    scale: 4,
    layerDepth: ((actor.tileY - 1) * 64) / 10000,
  })
}

function getLocalizedMetadataCacheKey(rootPath: string, locale: LocaleCode) {
  return `${rootPath}::${locale}`
}

async function loadHatMetadataIndex(rootPath: string, locale: LocaleCode) {
  const cacheKey = getLocalizedMetadataCacheKey(rootPath, locale)
  const cached = hatMetadataCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = loadTextAsset(rootPath, HAT_DATA_PATH, locale)
    .then((asset: { content: string }) => {
      const parsed = JSON.parse(asset.content) as Record<string, string>
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]): [string, HatMetadataEntry] => {
          const segments = value.split('/')
          const rawHairDraw = segments[2]?.trim().toLowerCase() ?? ''
          const hairDrawMode: HatMetadataEntry['hairDrawMode'] =
            rawHairDraw === 'hide' ? 'hide' : rawHairDraw === 'true' ? 'normal' : 'cover'
          const displayName = segments[0]?.trim() ?? ''
          return [
            key,
            {
              hairDrawMode,
              ignoreHairstyleOffset: (segments[3]?.trim().toLowerCase() ?? '') === 'true',
              isMask: /mask/iu.test(displayName) && hairDrawMode !== 'hide',
            },
          ]
        }),
      ) as Record<string, HatMetadataEntry>
    })
    .catch(() => ({} as Record<string, HatMetadataEntry>))

  hatMetadataCache.set(cacheKey, pending)
  return pending
}

async function loadHairMetadataIndex(rootPath: string, locale: LocaleCode) {
  const cacheKey = getLocalizedMetadataCacheKey(rootPath, locale)
  const cached = hairMetadataCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = loadTextAsset(rootPath, HAIR_DATA_PATH, locale)
    .then((asset: { content: string }) => {
      const parsed = JSON.parse(asset.content) as Record<string, string>
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]): [string, FarmerHairMetadataEntry] => {
          const segments = value.split('/')
          const coveredIndex = Number.parseInt(segments[4] ?? '-1', 10)
          return [
            key,
            {
              textureName: segments[0]?.trim() || 'hairstyles',
              tileX: Number.parseInt(segments[1] ?? '0', 10) || 0,
              tileY: Number.parseInt(segments[2] ?? '0', 10) || 0,
              usesUniqueLeftSprite: (segments[3]?.trim().toLowerCase() ?? '') === 'true',
              coveredIndex: Number.isFinite(coveredIndex) ? coveredIndex : -1,
              isBaldStyle: (segments[5]?.trim().toLowerCase() ?? '') === 'true',
            },
          ]
        }),
      ) as Record<string, FarmerHairMetadataEntry>
    })
    .catch(() => ({} as Record<string, FarmerHairMetadataEntry>))

  hairMetadataCache.set(cacheKey, pending)
  return pending
}

function getActorByName(actors: Record<string, EventActorState>, actorName: string) {
  return actors[toActorKey(actorName)] ?? null
}

function resolveActorFocusTile(actors: Record<string, EventActorState>) {
  const visibleActors = Object.values(actors).filter((actor) => actor.visible)
  const farmer = visibleActors.find((actor) => isFarmerActor(actor.actorName))
  const primary = farmer ?? visibleActors[0]
  return primary ? { tileX: primary.tileX, tileY: primary.tileY } : null
}

function resolveCameraFocus(event: EventScript, actors: Record<string, EventActorState>) {
  const raw = event.scene.cameraInstruction?.trim()
  if (!raw || raw === 'continue' || raw === 'follow') {
    return resolveActorFocusTile(actors)
  }

  const segments = raw.split(/\s+/u)
  const point = parsePoint(segments[0], segments[1])
  if (point && point.tileX >= 0 && point.tileY >= 0) {
    return point
  }

  const actor = getActorByName(actors, raw)
  return actor ? { tileX: actor.tileX, tileY: actor.tileY } : resolveActorFocusTile(actors)
}

function createInitialPlaybackState(event: EventScript | null, initialMapName: string | null): PlaybackState {
  if (!event) {
    return {
      rootEventKey: null,
      activeEventKey: null,
      currentMapName: initialMapName,
      commands: [],
      pointer: 0,
      forkFlag: false,
      actors: {},
      stageEffects: [],
      currentEntry: null,
      currentCommandId: null,
      activeDialogue: null,
      pendingChoice: null,
      waitingMs: null,
      waitingStartedAtMs: null,
      blockingMovement: false,
      focusTile: null,
      notices: [],
      ambientOverlayColor: null,
      fadeOverlay: null,
      flashOverlay: null,
      activeMusicCue: null,
      activeSoundCue: null,
      ended: true,
    }
  }

  const actors = applyEventFarmerStateSeeds(event, buildActorMap(event))
  return {
    rootEventKey: event.key,
    activeEventKey: event.key,
    currentMapName: initialMapName,
    commands: event.commands,
    pointer: 0,
    forkFlag: false,
    actors,
    stageEffects: [],
    currentEntry: null,
    currentCommandId: null,
    activeDialogue: null,
    pendingChoice: null,
    waitingMs: null,
    waitingStartedAtMs: null,
    blockingMovement: false,
    focusTile: resolveCameraFocus(event, actors),
    notices: [],
    ambientOverlayColor: null,
    fadeOverlay: null,
    flashOverlay: null,
    activeMusicCue: null,
    activeSoundCue: null,
    ended: event.commands.length === 0,
  }
}

export {
  CHARACTER_DATA_PATH,
  EFFECT_VIEWPORT_BASE_HEIGHT,
  EFFECT_VIEWPORT_BASE_WIDTH,
  EVENT_STAGE_INITIAL_ZOOM,
  OBJECT_DATA_PATH,
  advanceFadeOverlayState,
  buildStageEffectId,
  clampColorChannel,
  createFadeOverlayState,
  createActorState,
  buildActorMap,
  createInitialPlaybackState,
  createNoticeIconForItemId,
  createObjectSheetEffect,
  createStageEffect,
  createAnimationRowEffect,
  createItemAtTileEffect,
  createItemAboveActorEffect,
  enqueuePlaybackNotice,
  getFadeDurationMsFromSpeed,
  getActorByName,
  getActorDefaultFrameState,
  getActorWalkAnimationState,
  getDefaultFrame,
  getInitialActorOffset,
  getSpringObjectsSourceRect,
  isFarmerActor,
  isPathsLayerName,
  loadHairMetadataIndex,
  normalizeActorName,
  normalizeStageMapName,
  parseBoolean,
  parseEffectColor,
  normalizeEventItemId,
  normalizeEventItemId as parseEventItemId,
  parseNumber,
  parsePoint,
  parseRgbColorFromArgs,
  resolveFadeOverlayAlpha,
  parseSpringObjectIndexFromItemId,
  prunePlaybackNotices,
  resolveCameraFocus,
  resolveActorFocusTile,
  isFadeOverlayAnimating,
  deriveEventTimeOfDay,
  applyEventFarmerStateSeeds,
  toActorKey,
  toLookupTokens,
  loadHatMetadataIndex,
  DEFAULT_FARMER_HAIR_STYLE_INDEX,
  DEFAULT_FARMER_PANTS_SPRITE_INDEX,
  DEFAULT_FARMER_SHIRT_SPRITE_INDEX,
  MANUAL_TEXTURE_NAME_ALIASES,
}

export type {
  ActorAnimationFrameState,
  ActorAnimationState,
  ActorAssetRequest,
  ActorAssetState,
  ActorMovementState,
  ActiveDialogueState,
  CharacterDataEntry,
  CharacterTextureIndex,
  CharacterVisualMetadata,
  EffectAssetState,
  EventActorState,
  FadeOverlayState,
  FarmerRenderState,
  FarmerAppearanceAssetState,
  HatMetadataEntry,
  ObjectDataEntry,
  PlaybackChoiceState,
  PlaybackLogEntry,
  PlaybackNotice,
  PlaybackNoticeIcon,
  PlaybackNoticeTone,
  PlaybackState,
  ResolvedAssetCandidate,
  ScreenFlashState,
  SpecificTemporarySpriteResolution,
  SpriteLayerDescriptor,
  StageEffectSpace,
  StageEffectState,
  StagePoint,
  StageRectangle,
}

