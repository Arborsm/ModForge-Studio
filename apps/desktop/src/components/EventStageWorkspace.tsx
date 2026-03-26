import { Grid2x2, Pause, Play, RotateCcw, Route, SkipForward, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  bakeFarmerBaseTexture,
  bakeFarmerHairTexture,
  bakeFarmerPantsTexture,
  bakeFarmerShirtTexture,
  buildFarmerSpriteLayerDescriptors,
  getFarmerDirectionalFrame,
  getFarmerWalkAnimation,
  type FarmerAppearanceCompositeAssets,
  type FarmerSpriteLayerDescriptor,
} from '../lib/app/farmerAppearanceRenderer'
import type { PlayerAppearanceProfile } from '../lib/app/playerAppearance'
import { loadImageDataUrl, loadMapAsset, loadTextAsset, type GameDirectoryInfo } from '../lib/desktop'
import type { ThemeMode, ViewportLabels } from '../lib/editor-shell'
import { parseEventCommand } from '../lib/events/parser'
import { EVENT_SETUP_ENTRY_ID } from '../lib/events/timeline'
import type { EventCommand, EventDialoguePage, EventSceneActor, EventScript, ParsedEventAsset } from '../lib/events/types'
import { toAssetUrl } from '../lib/maps/assets'
import { parseTmxMap } from '../lib/maps/tmx'
import type { MapDocument } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { MapViewport, type ViewportWorldPoint } from './MapViewport'

type EventStageWorkspaceProps = {
  locale: 'zh-CN' | 'en-US'
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

type ActorAnimationState = {
  frames: number[]
  frameDurationMs: number
  loop: boolean
  flip: boolean
  startedAtMs: number
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
  blockingMovement: boolean
  focusTile: { tileX: number; tileY: number } | null
  ended: boolean
}

type CharacterDataEntry = {
  TextureName?: string | null
  FormerCharacterNames?: string[] | null
}

type CharacterTextureIndex = Record<string, string>

type ActorAssetRequest = {
  actorKey: string
  actorName: string
  requestKey: string
  spriteTextureCandidates: string[]
  portraitTextureCandidates: string[]
  farmerAppearanceProfile: PlayerAppearanceProfile | null
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
const CHARACTER_DATA_PATH = 'Content (unpacked)\\Data\\Characters.json'
const HAT_DATA_PATH = 'Content (unpacked)\\Data\\hats.json'
const EFFECT_VIEWPORT_BASE_WIDTH = 1280
const EFFECT_VIEWPORT_BASE_HEIGHT = 720
type HatMetadataEntry = {
  hairDrawMode: 'normal' | 'hide' | 'cover'
  ignoreHairstyleOffset: boolean
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

function buildLabels(locale: 'zh-CN' | 'en-US') {
  return locale === 'zh-CN'
    ? {
        empty: '先选择事件文件。',
        scene: '场景播放',
        sceneIdle: '选择事件后即可在地图中预览剧情。',
        stageWaiting: '正在载入对应地图...',
        stageMissing: '没有可用的解包 TMX 地图，无法在中间舞台预览事件。',
        stageFailed: '地图载入失败',
        play: '播放',
        pause: '暂停',
        step: '下一步',
        reset: '重置',
        branch: '当前播放已经跳转到其他事件分支。',
        choose: '选择分支',
      }
    : {
        empty: 'Select an event file first.',
        scene: 'Scene Stage',
        sceneIdle: 'Choose an event to preview it directly on the map.',
        stageWaiting: 'Loading the matching map stage...',
        stageMissing: 'No unpacked TMX map was found for this event stage.',
        stageFailed: 'Failed to load stage map',
        play: 'Play',
        pause: 'Pause',
        step: 'Step',
        reset: 'Reset',
        branch: 'Playback has branched into another event.',
        choose: 'Choose Branch',
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

function createActorState(actor: EventSceneActor): EventActorState {
  const initialOffset = getInitialActorOffset()
  const frameState = getActorDefaultFrameState(actor.actorName, actor.facingDirection)

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

  return trimmed.replace(/^Maps[\\/]/iu, '').replace(/\.tmx$/iu, '')
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

async function loadHatMetadataIndex(rootPath: string) {
  const cached = hatMetadataCache.get(rootPath)
  if (cached) {
    return cached
  }

  const pending = loadTextAsset(rootPath, HAT_DATA_PATH)
    .then((asset) => {
      const parsed = JSON.parse(asset.content) as Record<string, string>
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]): [string, HatMetadataEntry] => {
          const segments = value.split('/')
          const rawHairDraw = segments[2]?.trim().toLowerCase() ?? ''
          const hairDrawMode: HatMetadataEntry['hairDrawMode'] =
            rawHairDraw === 'hide' ? 'hide' : rawHairDraw === 'true' ? 'cover' : 'normal'
          return [
            key,
            {
              hairDrawMode,
              ignoreHairstyleOffset: (segments[3]?.trim().toLowerCase() ?? '') === 'true',
            },
          ]
        }),
      ) as Record<string, HatMetadataEntry>
    })
    .catch(() => ({} as Record<string, HatMetadataEntry>))

  hatMetadataCache.set(rootPath, pending)
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
      blockingMovement: false,
      focusTile: null,
      ended: true,
    }
  }

  const actors = buildActorMap(event)
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
    blockingMovement: false,
    focusTile: resolveCameraFocus(event, actors),
    ended: event.commands.length === 0,
  }
}

function replaceStageEffectByNumericId(effects: StageEffectState[], effectNumericId: number, producer: (current: StageEffectState) => StageEffectState) {
  let changed = false
  const nextEffects = effects.map((effect) => {
    if (effect.effectNumericId !== effectNumericId) {
      return effect
    }

    changed = true
    return producer(effect)
  })

  return changed ? nextEffects : effects
}

function removeStageEffectsByNumericId(effects: StageEffectState[], effectNumericId: number) {
  return effects.filter((effect) => effect.effectNumericId !== effectNumericId)
}

function removeStageEffectsByTile(effects: StageEffectState[], tileX: number, tileY: number) {
  return effects.filter((effect) => {
    if (effect.space !== 'world') {
      return true
    }

    return Math.floor(effect.baseX / 64) !== tileX || Math.floor(effect.baseY / 64) !== tileY
  })
}

function parseTemporaryAnimatedSpriteCommand(command: EventCommand) {
  const sourceX = parseNumber(command.args[2])
  const sourceY = parseNumber(command.args[3])
  const sourceWidth = parseNumber(command.args[4])
  const sourceHeight = parseNumber(command.args[5])
  const animationIntervalMs = parseNumber(command.args[6])
  const animationLength = parseNumber(command.args[7])
  const loops = parseNumber(command.args[8])
  const tileX = parseNumber(command.args[9])
  const tileY = parseNumber(command.args[10])
  const layerDepth = parseNumber(command.args[13])
  const alphaFade = parseNumber(command.args[14])
  const scale = parseNumber(command.args[15])
  const scaleChange = parseNumber(command.args[16])
  const rotation = parseNumber(command.args[17])
  const rotationChange = parseNumber(command.args[18])

  if (
    !command.args[1] ||
    sourceX == null ||
    sourceY == null ||
    sourceWidth == null ||
    sourceHeight == null ||
    animationIntervalMs == null ||
    animationLength == null ||
    loops == null ||
    tileX == null ||
    tileY == null ||
    layerDepth == null ||
    alphaFade == null ||
    scale == null ||
    scaleChange == null ||
    rotation == null ||
    rotationChange == null
  ) {
    return null
  }

  let color: string | null = null
  let holdLastFrame = false
  let pingPong = false
  let motionX = 0
  let motionY = 0
  let accelerationX = 0
  let accelerationY = 0

  for (let index = 19; index < command.args.length; index += 1) {
    switch (command.args[index]) {
      case 'color':
        color = parseEffectColor(command.args[index + 1])
        index += 1
        break
      case 'hold_last_frame':
        holdLastFrame = true
        break
      case 'ping_pong':
        pingPong = true
        break
      case 'motion':
        motionX = parseNumber(command.args[index + 1]) ?? motionX
        motionY = parseNumber(command.args[index + 2]) ?? motionY
        index += 2
        break
      case 'acceleration':
        accelerationX = parseNumber(command.args[index + 1]) ?? accelerationX
        accelerationY = parseNumber(command.args[index + 2]) ?? accelerationY
        index += 2
        break
      case 'acceleration_change':
        index += 2
        break
      default:
        break
    }
  }

  return createStageEffect(command.id, 'temporaryAnimatedSprite', {
    textureName: command.args[1],
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    baseX: tileX * 64,
    baseY: tileY * 64,
    space: 'world',
    animationIntervalMs,
    animationLength,
    loops,
    flip: parseBoolean(command.args[12]),
    layerDepth,
    alphaFade,
    scale: scale * 4,
    scaleChange,
    rotation,
    rotationChange,
    motionX,
    motionY,
    accelerationX,
    accelerationY,
    holdLastFrame,
    pingPong,
    color,
  })
}

function parseTemporarySpriteCommand(command: EventCommand) {
  const tileX = parseNumber(command.args[1])
  const tileY = parseNumber(command.args[2])
  const rowInAnimationSheet = parseNumber(command.args[3])
  const animationLength = parseNumber(command.args[4])

  if (tileX == null || tileY == null || rowInAnimationSheet == null || animationLength == null) {
    return null
  }

  return createStageEffect(command.id, 'temporarySprite', {
    textureName: 'TileSheets\\animations',
    sourceX: 0,
    sourceY: rowInAnimationSheet * 64,
    sourceWidth: 64,
    sourceHeight: 64,
    baseX: tileX * 64,
    baseY: tileY * 64,
    space: 'world',
    animationIntervalMs: parseNumber(command.args[5]) ?? 300,
    animationLength,
    loops: 1,
    flip: parseBoolean(command.args[6]),
    layerDepth: parseNumber(command.args[7]) ?? 1,
    scale: 1,
  })
}

function buildSpecificTemporarySpriteEffects(command: EventCommand): SpecificTemporarySpriteResolution {
  const spriteId = command.args[1]
  if (!spriteId) {
    return { effects: [] as StageEffectState[], mode: 'append' as const }
  }

  if (spriteId === 'removeSprite') {
    const effectNumericId = Number.parseInt(command.args[2] ?? '', 10)
    return {
      effects: [] as StageEffectState[],
      mode: Number.isFinite(effectNumericId) ? ('remove-by-id' as const) : ('append' as const),
      effectNumericId: Number.isFinite(effectNumericId) ? effectNumericId : null,
    }
  }

  if (spriteId === 'staticSprite') {
    const sourceX = parseNumber(command.args[3])
    const sourceY = parseNumber(command.args[4])
    const sourceWidth = parseNumber(command.args[5])
    const sourceHeight = parseNumber(command.args[6])
    const tileX = parseNumber(command.args[7])
    const tileY = parseNumber(command.args[8])
    const effectNumericId = parseNumber(command.args[9])
    const layerDepth = parseNumber(command.args[10])

    return {
      mode: 'append' as const,
      effects:
        command.args[2] &&
        sourceX != null &&
        sourceY != null &&
        sourceWidth != null &&
        sourceHeight != null &&
        tileX != null &&
        tileY != null
          ? [
              createStageEffect(command.id, 'staticSprite', {
                textureName: command.args[2],
                sourceX,
                sourceY,
                sourceWidth,
                sourceHeight,
                baseX: tileX * 64,
                baseY: tileY * 64,
                space: 'world',
                animationIntervalMs: 999999,
                animationLength: 1,
                loops: 999,
                scale: 4,
                layerDepth: layerDepth ?? 1,
                effectNumericId: effectNumericId == null ? 999 : effectNumericId,
              }),
            ]
          : [],
    }
  }

  switch (spriteId) {
    case 'heart': {
      const tile = parsePoint(command.args[2], command.args[3])
      return {
        mode: 'append' as const,
        effects: tile
          ? [
              createStageEffect(command.id, 'heart', {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 211,
                sourceY: 428,
                sourceWidth: 7,
                sourceHeight: 6,
                baseX: tile.tileX * 64 - 16,
                baseY: tile.tileY * 64 - 16,
                space: 'world',
                animationIntervalMs: 2000,
                animationLength: 1,
                loops: 0,
                motionY: -0.5,
                alphaFade: 0.01,
                scale: 4,
              }),
            ]
          : [],
      }
    }
    case 'EmilyBoomBox':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilyBoomBox', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 586,
            sourceY: 1871,
            sourceWidth: 24,
            sourceHeight: 14,
            baseX: 15 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.01,
            scale: 4,
          }),
        ],
      }
    case 'EmilyBoomBoxStart':
      return { effects: [], mode: 'update-boombox-start' as const }
    case 'EmilyBoomBoxStop':
      return { effects: [], mode: 'update-boombox-stop' as const }
    case 'EmilySleeping':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilySleeping', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 574,
            sourceY: 1892,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 20 * 64 + 8,
            baseY: 3 * 64 + 32,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 99999,
            layerDepth: 1,
            scale: 4,
          }),
        ],
      }
    case 'EmilyCamping':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilyCamping:tent', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 644,
            sourceY: 1578,
            sourceWidth: 59,
            sourceHeight: 53,
            baseX: 26 * 64 - 16,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0788,
          }),
          createStageEffect(command.id, 'EmilyCamping:pillow', {
            effectNumericId: 99,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 675,
            sourceY: 1299,
            sourceWidth: 29,
            sourceHeight: 24,
            baseX: 27 * 64,
            baseY: 14 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.001,
          }),
          createStageEffect(command.id, 'EmilyCamping:fire', {
            effectNumericId: 666,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 27 * 64 + 8 * 4,
            baseY: 14 * 64 + 4 * 4,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'shakeTent':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 999, shakeIntensity: 1 }
    case 'stopShakeTent':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 999, shakeIntensity: 0 }
    case 'EmilySongBackLights':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 5 }, (_, index) =>
            createStageEffect(command.id, `EmilySongBackLights:bar:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 681,
              sourceY: 1890,
              sourceWidth: 18,
              sourceHeight: 12,
              baseX: 180 + index * 190,
              baseY: -24,
              space: 'screen',
              animationIntervalMs: 42241,
              animationLength: 1,
              loops: 1,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 1760,
              xPeriodicRange: 96 + index * 12,
              delayBeforeStartMs: index * 120,
              layerDepth: 0.01,
            }),
          ),
          ...Array.from({ length: 6 }, (_, index) =>
            createStageEffect(command.id, `EmilySongBackLights:flare:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 616 + (index % 2) * 10,
              sourceY: 1891,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 1240,
              baseY: 120 + index * 76,
              space: 'screen',
              animationIntervalMs: 42241,
              animationLength: 1,
              loops: 1,
              scale: 4,
              motionX: -4.5,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 1800 + index * 120,
              yPeriodicRange: 32 + index * 6,
              delayBeforeStartMs: 900 + index * 160,
              layerDepth: 0.02,
              pulse: true,
              pulseTimeMs: 440,
              pulseAmount: 1.22,
            }),
          ),
        ],
      }
    case 'EmilySign':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 6 }, (_, index) =>
          createStageEffect(command.id, `EmilySign:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 597,
            sourceY: 1888,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 1280 - index * 96,
            baseY: 80 + index * 72,
            space: 'screen',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            delayBeforeStartMs: index * 180,
            layerDepth: 0.02,
          }),
        ),
      }
    case 'junimoSpotlight':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoSpotlight', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 316,
            sourceY: 123,
            sourceWidth: 67,
            sourceHeight: 43,
            baseX: 506,
            baseY: 254,
            space: 'screen',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.0001,
          }),
        ],
      }
    case 'missingJunimoStars':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 8 }, (_, index) =>
          createStageEffect(command.id, `missingJunimoStars:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 620 + (index % 4) * 26,
            baseY: 260 + Math.floor(index / 4) * 28,
            space: 'screen',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.04,
            motionX: (index % 2 === 0 ? -0.5 : 0.5) * (1 + index * 0.05),
            motionY: -1.8 - index * 0.18,
            accelerationY: 0.07,
            rotationChange: 0.02 + index * 0.004,
            alphaFade: 0.005,
            color: '#a6ff77',
          }),
        ),
      }
    case 'shanePassedOut':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shanePassedOut:body', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 27,
            baseX: 25 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.01,
            scale: 4,
          }),
          createStageEffect(command.id, 'shanePassedOut:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 25 * 64 - 16,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.0001,
            scale: 4,
          }),
        ],
      }
    case 'waterShane':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'waterShane', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 10,
            baseX: 20 * 64 + 16,
            baseY: 3 * 64 + 12,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'waterShaneDone':
      return { effects: [], mode: 'remove-by-id' as const, effectNumericId: 999 }
    case 'jasGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'jasGift', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 22 * 64,
            baseY: 16 * 64,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 1,
            holdLastFrame: true,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'jasGiftOpen':
      return {
        mode: 'replace-jas-gift' as const,
        effects: [
          createStageEffect(command.id, 'jasGiftOpen:star', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 537,
            sourceY: 1850,
            sourceWidth: 11,
            sourceHeight: 10,
            baseX: 23 * 64 + 16,
            baseY: 16 * 64 - 48,
            space: 'world',
            animationIntervalMs: 1500,
            animationLength: 1,
            loops: 1,
            motionY: -0.25,
            delayBeforeStartMs: 500,
            layerDepth: 0.99,
            scale: 4,
          }),
        ],
      }
    case 'umbrella':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'umbrella', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1843,
            sourceWidth: 27,
            sourceHeight: 23,
            baseX: 12 * 64 - 20,
            baseY: 39 * 64 - 104,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 3,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'elliottBoat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'elliottBoat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 461,
            sourceY: 1843,
            sourceWidth: 32,
            sourceHeight: 51,
            baseX: 15 * 64 - 28,
            baseY: 26 * 64,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 9999,
            scale: 4,
            layerDepth: 0.1664,
          }),
        ],
      }
    case 'leahTree':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahTree', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1677,
            sourceWidth: 16,
            sourceHeight: 21,
            baseX: 42 * 64,
            baseY: 8 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'leahPicnic':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahPicnic', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 96,
            sourceY: 1808,
            sourceWidth: 32,
            sourceHeight: 48,
            baseX: 75 * 64,
            baseY: 37 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.2496,
          }),
        ],
      }
    case 'leahLaptop':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahLaptop', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 130,
            sourceY: 1849,
            sourceWidth: 19,
            sourceHeight: 19,
            baseX: 12 * 64,
            baseY: 10 * 64 + 24,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.1856,
          }),
        ],
      }
    case 'JoshMom':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'JoshMom', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 416,
            sourceY: 1931,
            sourceWidth: 58,
            sourceHeight: 65,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2,
            baseY: EFFECT_VIEWPORT_BASE_HEIGHT,
            space: 'screen',
            animationIntervalMs: 750,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            alpha: 0.6,
            layerDepth: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 2000,
            xPeriodicRange: 32,
            motionY: -1.25,
          }),
          ...Array.from({ length: 4 }, (_, index) =>
            createStageEffect(command.id, `JoshMom:leaf:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 516,
              sourceY: 1916,
              sourceWidth: 7,
              sourceHeight: 10,
              baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2 + 8 + index * 10,
              baseY: EFFECT_VIEWPORT_BASE_HEIGHT - 110 + index * 6,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              alphaFade: 0.01,
              motionX: -1,
              motionY: -1,
              delayBeforeStartMs: (index + 1) * 320,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'willyCrabExperiment':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'willyCrabExperiment:1', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 146,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 2 * 64,
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 8000,
            yPeriodicRange: 32,
          }),
          createStageEffect(command.id, 'willyCrabExperiment:2', {
            effectNumericId: 2,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 146,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 4 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
          }),
          createStageEffect(command.id, 'willyCrabExperiment:3', {
            effectNumericId: 3,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 127,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 8 * 64,
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 180,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 10000,
            yPeriodicRange: 32,
          }),
        ],
      }
    case 'beachStuff':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'beachStuff', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1887,
            sourceWidth: 47,
            sourceHeight: 29,
            baseX: 44 * 64,
            baseY: 21 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'springOnion':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'springOnion', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 1,
            sourceY: 129,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 84 * 64,
            baseY: 39 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 8,
            loops: 999999,
            scale: 4,
            layerDepth: 0.4736,
          }),
        ],
      }
    case 'springOnionDemo':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'springOnionDemo', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 144,
            sourceY: 215,
            sourceWidth: 112,
            sourceHeight: 112,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2 - 264,
            baseY: EFFECT_VIEWPORT_BASE_HEIGHT / 3 - 264,
            space: 'screen',
            animationIntervalMs: 200,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'springOnionPeel':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 144, y: 327, width: 112, height: 112 } }
    case 'springOnionRemove':
      return { effects: [], mode: 'remove-by-id' as const, effectNumericId: 777 }
    case 'joshDog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'joshDog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1916,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 53 * 64 + 12,
            baseY: 67 * 64 + 12,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'joshSteak':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'joshSteak:dog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1936,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 53 * 64 + 12,
            baseY: 67 * 64 + 12,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'joshSteak:meat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 50 * 64 + 32,
            baseY: 68 * 64 - 8,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'WillyWad':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'WillyWad:wad', {
            effectNumericId: 996,
            textureName: 'LooseSprites\\Cursors2',
            sourceX: 192,
            sourceY: 61,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 50 * 64,
            baseY: 23 * 64,
            space: 'world',
            animationIntervalMs: 400,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1536,
          }),
          createStageEffect(command.id, 'WillyWad:flameA', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 53 * 64,
            baseY: 24 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'WillyWad:flameB', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 54 * 64,
            baseY: 23 * 64,
            space: 'world',
            animationIntervalMs: 510,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
        ],
      }
    case 'pennyCook':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 4 }, (_, index) =>
          createStageEffect(command.id, `pennyCook:${index}`, {
            textureName: 'TileSheets\\animations',
            sourceX: 256,
            sourceY: 1856,
            sourceWidth: 64,
            sourceHeight: 128,
            baseX: 10 * 64 + (index === 1 ? 16 : index === 2 ? -16 : 0),
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 75,
            animationLength: 6,
            loops: 99999,
            scale: 1,
            layerDepth: index % 2 === 0 ? 1 : 0.1,
            motionY: -0.5,
            delayBeforeStartMs: index === 1 ? 500 : index === 2 ? 750 : index === 3 ? 1000 : 0,
          }),
        ),
      }
    case 'abbyOneBat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyOneBat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 23 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 2000,
            xPeriodicRange: 128,
            motionY: -8,
          }),
        ],
      }
    case 'abbyManyBats':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 24 }, (_, index) =>
          createStageEffect(command.id, `abbyManyBats:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 23 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
            motionX: (index % 5) - 2,
            motionY: -4 - (index % 4),
            xPeriodic: index % 2 === 0,
            xPeriodicLoopTimeMs: 1500 + index * 40,
            xPeriodicRange: 64 + index * 2,
            delayBeforeStartMs: index * 60,
            alphaFade: 0.003,
          }),
        ),
      }
    case 'abbyOuija':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyOuija', {
            textureName: 'TileSheets\\animations',
            sourceX: 0,
            sourceY: 960,
            sourceWidth: 128,
            sourceHeight: 128,
            baseX: 6 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 60,
            animationLength: 4,
            loops: 0,
            scale: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'witchFlyby':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'witchFlyby', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1886,
            sourceWidth: 35,
            sourceHeight: 29,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 192,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: -4,
            accelerationX: -0.025,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 64,
            layerDepth: 1,
          }),
        ],
      }
    case 'morrisFlying':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'morrisFlying', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 105,
            sourceY: 1318,
            sourceWidth: 13,
            sourceHeight: 31,
            baseX: 32 * 64,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionX: 4,
            motionY: -8,
            rotationChange: Math.PI / 16,
            shakeIntensity: 1,
          }),
        ],
      }
    case 'golemDie':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'golemDie', {
            textureName: 'Characters\\Monsters\\Wilderness Golem',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 16,
            sourceHeight: 24,
            baseX: 40 * 64 + 8,
            baseY: 11 * 64 - 32,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.01,
            rotation: Math.PI / 2,
            motionY: 4,
          }),
        ],
      }
    case 'swordswipe': {
      const tile = parsePoint(command.args[2], command.args[3])
      return {
        mode: 'append' as const,
        effects: tile
          ? [
              createStageEffect(command.id, 'swordswipe', {
                textureName: 'TileSheets\\animations',
                sourceX: 0,
                sourceY: 960,
                sourceWidth: 128,
                sourceHeight: 128,
                baseX: tile.tileX * 64,
                baseY: tile.tileY * 64 - 32,
                space: 'world',
                animationIntervalMs: 60,
                animationLength: 4,
                loops: 0,
                scale: 1,
                layerDepth: 1,
              }),
            ]
          : [],
      }
    }
    case 'farmerForestVision':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'farmerForestVision:veil', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 393,
            sourceY: 1973,
            sourceWidth: 1,
            sourceHeight: 1,
            baseX: 0,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: EFFECT_VIEWPORT_BASE_WIDTH * 2,
            alpha: 0,
            alphaFade: -0.002,
            color: '#8cff69',
            layerDepth: 1,
          }),
          ...Array.from({ length: 12 }, (_, index) =>
            createStageEffect(command.id, `farmerForestVision:motif:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 367 + (index % 2 === 0 ? 8 : 0),
              sourceY: 1969,
              sourceWidth: 8,
              sourceHeight: 8,
              baseX: -64 + (index % 4) * 340,
              baseY: -64 + Math.floor(index / 4) * 220,
              space: 'screen',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 999999,
              scale: 4,
              alpha: 0,
              alphaFade: -0.0015,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 4000,
              xPeriodicRange: 64,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 5000,
              yPeriodicRange: 96,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'arcaneBook':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 10 }, (_, index) =>
          createStageEffect(command.id, `arcaneBook:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 536,
            sourceY: 1945,
            sourceWidth: 8,
            sourceHeight: 8,
            baseX: 128 + (index % 4) * 10,
            baseY: 792 - index * 6,
            space: 'screen',
            animationIntervalMs: 50,
            animationLength: 7,
            loops: 99999,
            scale: 4,
            alphaFade: 0.008,
            layerDepth: 1,
          }),
        ),
      }
    case 'wizardWarp':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardWarp', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 387,
            sourceY: 1965,
            sourceWidth: 16,
            sourceHeight: 31,
            baseX: 8 * 64,
            baseY: 16 * 64 + 4,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: 2,
            motionY: -2,
            accelerationX: 0.1,
            scaleChange: -0.02,
            alphaFade: 0.001,
          }),
        ],
      }
    case 'wizardWarp2':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardWarp2', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 387,
            sourceY: 1965,
            sourceWidth: 16,
            sourceHeight: 31,
            baseX: 54 * 64,
            baseY: 34 * 64 + 4,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: -1,
            motionY: 2,
            accelerationX: -0.1,
            accelerationY: 0.2,
            scaleChange: 0.03,
            alphaFade: 0.001,
          }),
        ],
      }
    case 'haleyRoomDark':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'haleyRoomDark', {
            textureName: 'TileSheets\\animations',
            sourceX: 448,
            sourceY: 512,
            sourceWidth: 64,
            sourceHeight: 64,
            baseX: 4 * 64,
            baseY: 1 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'shaneSaloonCola':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneSaloonCola', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 32 * 64 + 40,
            baseY: 17 * 64 + 12,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000001,
          }),
        ],
      }
    case 'parrotSlide':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotSlide', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 256,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -3,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 32,
          }),
        ],
      }
    case 'parrotSplat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotSplat', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 64,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -2,
            motionY: 4,
            accelerationX: -0.1,
            layerDepth: 1,
          }),
        ],
      }
    case 'parrots1':
      return {
        mode: 'append' as const,
        effects: [256, 192, 320].map((y, index) =>
          createStageEffect(command.id, `parrots1:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: y,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -3,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 32,
            delayBeforeStartMs: index * 600,
          }),
        ),
      }
    case 'BoatParrot':
    case 'BoatParrotSquawk':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'BoatParrot', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\parrots',
            sourceX: spriteId === 'BoatParrotSquawk' ? 24 : 0,
            sourceY: 0,
            sourceWidth: 24,
            sourceHeight: 24,
            baseX: 1120,
            baseY: 150,
            space: 'screen',
            animationIntervalMs: 120,
            animationLength: spriteId === 'BoatParrotSquawk' ? 3 : 1,
            loops: 9999,
            pingPong: spriteId === 'BoatParrotSquawk',
            scale: 4,
          }),
        ],
      }
    case 'BoatParrotLeave':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 48, y: 0, width: 24, height: 24 } }
    case 'BoatParrotSquawkStop':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 0, y: 0, width: 24, height: 24 } }
    case 'grandpaNight':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'grandpaNight:top', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1453,
            sourceWidth: 639,
            sourceHeight: 176,
            baseX: 0,
            baseY: 64,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.002,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'grandpaNight:bottom', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1453,
            sourceWidth: 639,
            sourceHeight: 176,
            baseX: 0,
            baseY: 768,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.002,
            layerDepth: 1,
            flip: true,
          }),
        ],
      }
    case 'grandpaSpirit':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'grandpaSpirit', {
            effectNumericId: 77777,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 555,
            sourceY: 1956,
            sourceWidth: 18,
            sourceHeight: 35,
            baseX: -1000 * 64,
            baseY: -1010 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 3000,
            xPeriodicRange: 16,
          }),
        ],
      }
    case 'junimoCage':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoCage:core', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 325,
            sourceY: 1977,
            sourceWidth: 18,
            sourceHeight: 19,
            baseX: 10 * 64,
            baseY: 17 * 64 - 4,
            space: 'world',
            animationIntervalMs: 60,
            animationLength: 3,
            loops: 999999,
            scale: 4,
            shakeIntensity: 0,
          }),
          ...[
            { x: 0, y: -4, px: 24, py: 24, delay: 0 },
            { x: 72, y: -4, px: -24, py: 24, delay: 250 },
            { x: 0, y: 52, px: -24, py: 24, delay: 450 },
            { x: 72, y: 52, px: 24, py: 24, delay: 650 },
          ].map((entry, index) =>
            createStageEffect(command.id, `junimoCage:orb:${index}`, {
              effectNumericId: 1,
              textureName: 'LooseSprites\\Cursors',
              sourceX: 379,
              sourceY: 1991,
              sourceWidth: 5,
              sourceHeight: 5,
              baseX: 10 * 64 + entry.x,
              baseY: 17 * 64 + entry.y,
              space: 'world',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 999999,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 2000,
              xPeriodicRange: entry.px,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 2000,
              yPeriodicRange: entry.py,
              delayBeforeStartMs: entry.delay,
            }),
          ),
        ],
      }
    case 'linusCampfire':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'linusCampfire', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 29 * 64 + 8,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0576,
            pulse: true,
            pulseTimeMs: 680,
            pulseAmount: 1.08,
          }),
        ],
      }
    case 'ccCelebration':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 32 }, (_, index) => {
            const baseX = 24 + ((index * 137) % (EFFECT_VIEWPORT_BASE_WIDTH - 160))
            const baseY = EFFECT_VIEWPORT_BASE_HEIGHT + index * 48
            const color = ['#ff5a5a', '#ffb347', '#ffe066', '#74e26b', '#58d3ff', '#7f88ff', '#d98cff', '#ff7ecf'][index % 8]

            return [
              createStageEffect(command.id, `ccCelebration:streamer:${index}`, {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 534,
                sourceY: 1413,
                sourceWidth: 11,
                sourceHeight: 16,
                baseX,
                baseY,
                space: 'screen',
                animationIntervalMs: 99999,
                animationLength: 1,
                loops: 99999,
                scale: 4,
                motionX: 0.25,
                motionY: -1.5,
                accelerationY: -0.001,
                color,
                layerDepth: 1,
              }),
              createStageEffect(command.id, `ccCelebration:tail:${index}`, {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 545,
                sourceY: 1413,
                sourceWidth: 11,
                sourceHeight: 34,
                baseX,
                baseY,
                space: 'screen',
                animationIntervalMs: 99999,
                animationLength: 1,
                loops: 99999,
                scale: 4,
                motionX: 0.25,
                motionY: -1.5,
                accelerationY: -0.001,
                layerDepth: 1,
              }),
            ]
          }).flat(),
          createStageEffect(command.id, 'ccCelebration:host', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 558,
            sourceY: 1425,
            sourceWidth: 20,
            sourceHeight: 26,
            baseX: 53 * 64,
            baseY: 21 * 64,
            space: 'world',
            animationIntervalMs: 400,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            layerDepth: 0.5,
          }),
        ],
      }
    case 'alexDiningDog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'alexDiningDog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1936,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 7 * 64 + 8,
            baseY: 2 * 64 - 32,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'skateboardFly':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'skateboardFly', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 388,
            sourceY: 1875,
            sourceWidth: 16,
            sourceHeight: 6,
            baseX: 26 * 64,
            baseY: 90 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 1,
            motionX: -8,
            motionY: -10,
            accelerationX: 0.02,
            accelerationY: 0.3,
            rotationChange: Math.PI / 24,
          }),
        ],
      }
    case 'sebastianRide':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianRide', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 405,
            sourceY: 1843,
            sourceWidth: 14,
            sourceHeight: 9,
            baseX: 19 * 64,
            baseY: 8 * 64 + 28,
            space: 'world',
            animationIntervalMs: 40,
            animationLength: 4,
            loops: 999,
            scale: 4,
            motionX: -2,
            layerDepth: 0.1792,
          }),
        ],
      }
    case 'maruTelescope':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 9 }, (_, index) =>
          createStageEffect(command.id, `maruTelescope:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 256,
            sourceY: 1680,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: (2 + ((index * 11) % 26)) * 64,
            baseY: (2 + ((index * 7) % 18)) * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 5,
            loops: 1,
            scale: 4,
            motionX: 4,
            motionY: 4,
            delayBeforeStartMs: 8000 + index * 750,
            layerDepth: 1,
          }),
        ),
      }
    case 'abbyGraveyard':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyGraveyard', 736, {
            baseX: 48 * 64,
            baseY: 86 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'abbyOuijaCandles':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyOuijaCandles:0', 737, {
            baseX: 5 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          createObjectSheetEffect(command.id, 'abbyOuijaCandles:1', 737, {
            baseX: 7 * 64,
            baseY: 8 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'gridballGameTV':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'gridballGameTV', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 336,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 34 * 64 + 28,
            baseY: 3 * 64 + 52,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 7,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'secretGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'secretGift', {
            effectNumericId: 666,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 30 * 64,
            baseY: 70 * 64 - 21,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'secretGiftOpen':
      return { effects: [], mode: 'update-secret-gift' as const, effectNumericId: 666 }
    case 'curtainOpen':
      return { effects: [], mode: 'update-curtain' as const, effectNumericId: 999, sourceRect: { x: 672, y: 1578, width: 59, height: 53 } }
    case 'curtainClose':
      return { effects: [], mode: 'update-curtain' as const, effectNumericId: 999, sourceRect: { x: 644, y: 1578, width: 59, height: 53 } }
    case 'linusLights':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 55, y: 62, scale: 1.8, delay: 0 },
            { x: 60, y: 62, scale: 1.8, delay: 120 },
            { x: 57, y: 60, scale: 2.2, delay: 240 },
            { x: 57, y: 60, scale: 1.6, delay: 360 },
            { x: 47, y: 70, scale: 1.8, delay: 480 },
            { x: 52, y: 63, scale: 1.8, delay: 600 },
          ].map((entry, index) =>
            createStageEffect(command.id, `linusLights:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 497,
              sourceY: 1918,
              sourceWidth: 11,
              sourceHeight: 11,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: entry.scale,
              alpha: 0.7,
              pulse: true,
              pulseTimeMs: 900 + index * 120,
              pulseAmount: 1.18,
              color: '#ffd784',
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'LeoWillyFishing':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 20 }, (_, index) =>
          createAnimationRowEffect(command.id, `LeoWillyFishing:${index}`, 0, {
            baseX: 42.5 * 64 + ((index * 19) % 64),
            baseY: 38 * 64 + ((index * 37) % 64),
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 8,
            loops: 1,
            alpha: 0.7,
            delayBeforeStartMs: index * 150,
            layerDepth: (1280 + index) / 10000,
          }),
        ),
      }
    case 'LeoLinusCooking':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'LeoLinusCooking:food', {
            textureName: 'Maps\\springobjects',
            sourceX: 240,
            sourceY: 128,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 29 * 64,
            baseY: 8.5 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          ...Array.from({ length: 10 }, (_, index) =>
            createStageEffect(command.id, `LeoLinusCooking:smoke:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 372,
              sourceY: 1956,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 29.5 * 64,
              baseY: 8.6 * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 1,
              scale: 3,
              alpha: 0.75,
              alphaFade: 0.01,
              motionX: ((index % 3) - 1) * 0.18,
              motionY: -0.9 - index * 0.04,
              scaleChange: 0.008,
              rotationChange: ((index % 2 === 0 ? -1 : 1) * Math.PI) / 256,
              delayBeforeStartMs: index * 500,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'coldstarMiracle':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'coldstarMiracle', {
            effectNumericId: 989,
            textureName: 'LooseSprites\\Movies',
            sourceX: 400,
            sourceY: 704,
            sourceWidth: 90,
            sourceHeight: 61,
            baseX: 4 * 64 + 12,
            baseY: 1 * 64 + 28,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            alpha: 0.01,
            alphaFade: -0.01,
            scale: 4,
            layerDepth: 0.8535,
          }),
        ],
      }
    case 'harveyKitchenSetup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'harveyKitchenSetup:pan', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 379,
            sourceY: 251,
            sourceWidth: 31,
            sourceHeight: 13,
            baseX: 22 * 64 - 8,
            baseY: 22 * 64 + 24,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createStageEffect(command.id, 'harveyKitchenSetup:bottle', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 391,
            sourceY: 235,
            sourceWidth: 5,
            sourceHeight: 13,
            baseX: 21 * 64 + 32,
            baseY: 22 * 64 + 16,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createStageEffect(command.id, 'harveyKitchenSetup:board', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 399,
            sourceY: 229,
            sourceWidth: 11,
            sourceHeight: 21,
            baseX: 19 * 64 + 32,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createAnimationRowEffect(command.id, 'harveyKitchenSetup:flameA', 27, {
            baseX: 21 * 64,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 10,
            loops: 999,
            layerDepth: 0.15616,
          }),
          createAnimationRowEffect(command.id, 'harveyKitchenSetup:flameB', 27, {
            baseX: 21 * 64 + 24,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 10,
            loops: 999,
            flip: true,
            delayBeforeStartMs: 400,
            layerDepth: 0.15616,
          }),
        ],
      }
    case 'harveyDinnerSet':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'harveyDinnerSet', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 385,
            sourceY: 423,
            sourceWidth: 48,
            sourceHeight: 32,
            baseX: 5 * 64 - 32,
            baseY: 16 * 64 - 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: (16.2 * 64) / 10000,
          }),
        ],
      }
    case 'shaneCliffProps':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneCliffProps', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 104 * 64,
            baseY: 96 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'grandpaThumbsUp':
      return { effects: [], mode: 'update-grandpa-spirit' as const, effectNumericId: 77777 }
    case 'leahPaintingSetup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahPaintingSetup:canvas', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 393,
            sourceWidth: 15,
            sourceHeight: 28,
            baseX: 72 * 64 + 12,
            baseY: 38 * 64 - 52,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:easel', {
            effectNumericId: 888,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 393,
            sourceWidth: 15,
            sourceHeight: 28,
            baseX: 74 * 64 + 12,
            baseY: 40 * 64 - 68,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:painting', {
            effectNumericId: 444,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 369,
            sourceY: 424,
            sourceWidth: 11,
            sourceHeight: 15,
            baseX: 75 * 64 - 8,
            baseY: 40 * 64 - 44,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:stand', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 96,
            sourceY: 1822,
            sourceWidth: 32,
            sourceHeight: 34,
            baseX: 79 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
        ],
      }
    case 'leahHoldPainting':
      return {
        mode: 'update-leah-painting-hold' as const,
        effects: [
          createStageEffect(command.id, 'leahHoldPainting:item', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 400,
            sourceY: 394,
            sourceWidth: 25,
            sourceHeight: 23,
            baseX: 73 * 64 - 8,
            baseY: 38 * 64 - 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'leahStopHoldingPainting':
      return { effects: [], mode: 'update-leah-painting-release' as const }
    case 'farmerHoldPainting':
      return {
        mode: 'update-farmer-hold-painting' as const,
        effects: [
          createStageEffect(command.id, 'farmerHoldPainting:item', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 476,
            sourceY: 394,
            sourceWidth: 25,
            sourceHeight: 22,
            baseX: 75 * 64 - 16,
            baseY: 40 * 64 - 132,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'wedding':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wedding:arch', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 540,
            sourceY: 1196,
            sourceWidth: 98,
            sourceHeight: 54,
            baseX: 25 * 64,
            baseY: 60 * 64 - 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'wedding:carpet', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 540,
            sourceY: 1250,
            sourceWidth: 98,
            sourceHeight: 25,
            baseX: 25 * 64,
            baseY: 60 * 64 + 152,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          ...[
            { x: 24, y: 62, depth: 0.01 },
            { x: 32, y: 62, depth: 0.01 },
            { x: 24, y: 69, depth: 1 },
            { x: 32, y: 69, depth: 1 },
          ].map((entry, index) =>
            createStageEffect(command.id, `wedding:flower:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 527,
              sourceY: 1249,
              sourceWidth: 12,
              sourceHeight: 25,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              layerDepth: entry.depth,
            }),
          ),
        ],
      }
    case 'dickBag':
    case 'dickGlitter':
      return {
        mode: 'append' as const,
        effects: [
          ...(spriteId === 'dickBag'
            ? [
                createStageEffect(command.id, 'dickBag', {
                  textureName: 'LooseSprites\\Cursors',
                  sourceX: 528,
                  sourceY: 1435,
                  sourceWidth: 16,
                  sourceHeight: 16,
                  baseX: 48 * 64,
                  baseY: 7 * 64,
                  space: 'world',
                  animationIntervalMs: 99999,
                  animationLength: 1,
                  loops: 99999,
                  scale: 4,
                  layerDepth: 1,
                }),
              ]
            : []),
          ...[
            { x: 47 * 64, y: 8 * 64, delay: 0 },
            { x: 47 * 64 + 32, y: 8 * 64, delay: 200 },
            { x: 47 * 64 + 32, y: 8 * 64 + 32, delay: 300 },
            { x: 47 * 64, y: 8 * 64 + 32, delay: 100 },
            { x: 47 * 64 + 16, y: 8 * 64 + 16, delay: 400 },
          ].map((entry, index) =>
            createStageEffect(command.id, `dickBag:glitter:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 432,
              sourceY: 1435,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: entry.x,
              baseY: entry.y,
              space: 'world',
              animationIntervalMs: 100,
              animationLength: 6,
              loops: 99999,
              scale: 2,
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'dropEgg':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'dropEgg', 176, {
            baseX: 6 * 64,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 800,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
            motionY: -7,
            accelerationY: 0.3,
            rotationChange: Math.PI / 24,
          }),
        ],
      }
    case 'sauceFire':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sauceFire:flame', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 64 * 64 + 12,
            baseY: 16 * 64 - 16,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 4,
            loops: 5,
            scale: 4,
            layerDepth: 1,
          }),
          ...Array.from({ length: 8 }, (_, index) =>
            createStageEffect(command.id, `sauceFire:smoke:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 372,
              sourceY: 1956,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 64 * 64 + (-16 + (index * 7) % 48),
              baseY: 16 * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 1,
              scale: 3,
              alpha: 0.75,
              motionX: 1 + ((index % 5) - 2) * 0.12,
              motionY: -1 + ((index % 3) - 1) * 0.08,
              scaleChange: 0.01,
              rotationChange: ((index % 2 === 0 ? -1 : 1) * Math.PI) / 256,
              delayBeforeStartMs: index * 25,
              layerDepth: 0.0384 + index / 10000,
            }),
          ),
        ],
      }
    case 'maruElectrocution':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'maruElectrocution', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 432,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 7 * 64 + 4,
            baseY: 5 * 64 + 8,
            space: 'world',
            animationIntervalMs: 40,
            animationLength: 1,
            loops: 20,
            scale: 4,
            layerDepth: 1,
            pulse: true,
            pulseTimeMs: 80,
            pulseAmount: 1.2,
          }),
        ],
      }
    case 'samTV':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'samTV', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 350,
            sourceWidth: 25,
            sourceHeight: 29,
            baseX: 52 * 64 + 16,
            baseY: 24 * 64 - 48,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.9,
          }),
        ],
      }
    case 'shaneThrowCan':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneThrowCan', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 542,
            sourceY: 1893,
            sourceWidth: 4,
            sourceHeight: 6,
            baseX: 103 * 64,
            baseY: 95 * 64 + 16,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: -4,
            accelerationY: 0.25,
            rotationChange: Math.PI / 128,
          }),
        ],
      }
    case 'sebastianFrog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianFrog', {
            effectNumericId: 777,
            textureName: 'TileSheets\\critters',
            sourceX: 0,
            sourceY: 224,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 45 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 120,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 0.00064,
            motionX: 2,
          }),
        ],
      }
    case 'haleyCakeWalk':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'haleyCakeWalk', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 0,
            sourceY: 400,
            sourceWidth: 144,
            sourceHeight: 112,
            baseX: 26 * 64,
            baseY: 65 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.00064,
          }),
        ],
      }
    case 'shakeBushStop':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 777, shakeIntensity: 0 }
    case 'pennyFieldTrip':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'pennyFieldTrip', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1813,
            sourceWidth: 86,
            sourceHeight: 54,
            baseX: 68 * 64,
            baseY: 44 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 0.0001,
          }),
        ],
      }
    case 'parrotPerchHut':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotPerchHut', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\parrots',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 24,
            sourceHeight: 24,
            baseX: 7 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'iceFishingCatch':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'iceFishingCatch:0', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 68 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'iceFishingCatch:1', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 74 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 510,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'iceFishingCatch:2', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 67 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 490,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.2368,
          }),
          createStageEffect(command.id, 'iceFishingCatch:3', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 76 * 64,
            baseY: 35 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.2304,
          }),
        ],
      }
    case 'WizardPromise':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 50 }, (_, index) =>
          createStageEffect(command.id, `WizardPromise:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (16 + (index % 9)) * 64 + ((index * 11) % 36),
            baseY: (15 + Math.floor(index / 9)) * 64 + ((index * 17) % 36),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2 + (index % 3) * 0.5,
            motionY: -0.8 - (index % 4) * 0.08,
            alphaFade: 0.01,
            delayBeforeStartMs: index * 40,
            color: '#ffffff',
            layerDepth: 1,
          }),
        ),
      }
    case 'sauceGood':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 24 }, (_, index) =>
          createStageEffect(command.id, `sauceGood:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (64 + (index % 3)) * 64 + ((index * 7) % 20),
            baseY: 16 * 64 + ((index * 13) % 20),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.5,
            motionX: ((index % 5) - 2) * 0.15,
            motionY: -0.8 - (index % 3) * 0.1,
            alphaFade: 0.01,
            delayBeforeStartMs: index * 35,
            color: '#ffffff',
            layerDepth: 1,
          }),
        ),
      }
    case 'sebastianFrogHouse':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianFrogHouse:terrarium', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 641,
            sourceY: 1534,
            sourceWidth: 48,
            sourceHeight: 37,
            baseX: 1 * 64,
            baseY: 6 * 64 - 20,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'sebastianFrogHouse:frog', {
            effectNumericId: 777,
            textureName: 'TileSheets\\critters',
            sourceX: 0,
            sourceY: 224,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 1 * 64 + 100,
            baseY: 6 * 64 + 8,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            flip: true,
            layerDepth: 0.11,
          }),
        ],
      }
    case 'qiCave':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'qiCave:portal', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 415,
            sourceY: 216,
            sourceWidth: 96,
            sourceHeight: 89,
            baseX: 2 * 64 + 448,
            baseY: 2 * 64 + 100,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000001,
          }),
          createStageEffect(command.id, 'qiCave:floor', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 370,
            sourceY: 272,
            sourceWidth: 107,
            sourceHeight: 64,
            baseX: 2 * 64 + 268,
            baseY: 2 * 64 + 324,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.00000011,
          }),
          createObjectSheetEffect(command.id, 'qiCave:item', 803, {
            effectNumericId: 803,
            baseX: 13 * 64 + 4,
            baseY: 7 * 64 + 36,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000021,
          }),
          ...[
            { x: 8, y: 6, interval: 100, depth: 0.0000022 },
            { x: 5, y: 7, interval: 90, depth: 0.0000023 },
            { x: 7, y: 10, interval: 120, depth: 1 },
            { x: 15, y: 7, interval: 80, depth: 0.0000024 },
            { x: 12, y: 11, interval: 100, depth: 0.0000025 },
            { x: 16, y: 10, interval: 105, depth: 0.0000026 },
            { x: 3, y: 9, interval: 85, depth: 0.0000027 },
          ].map((entry, index) =>
            createStageEffect(command.id, `qiCave:pillar:${index}`, {
              effectNumericId: 11,
              textureName: 'LooseSprites\\temporary_sprites_1',
              sourceX: 432,
              sourceY: 171,
              sourceWidth: 16,
              sourceHeight: 30,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: entry.interval,
              animationLength: 5,
              loops: 99999,
              pingPong: true,
              scale: 4,
              layerDepth: entry.depth,
            }),
          ),
        ],
      }
    case 'robot':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'robot:core', {
            textureName: 'Characters\\robot',
            sourceX: 35,
            sourceY: 42,
            sourceWidth: 35,
            sourceHeight: 42,
            baseX: 13 * 64,
            baseY: 27 * 64 - 32,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.98,
            accelerationY: -0.01,
          }),
          ...Array.from({ length: 64 }, (_, index) =>
            createStageEffect(command.id, `robot:spark:${index}`, {
              textureName: 'TileSheets\\animations',
              sourceX: (index % 4) * 64,
              sourceY: 320,
              sourceWidth: 64,
              sourceHeight: 64,
              baseX: 13 * 64 + ((index * 17) % 96),
              baseY: 136,
              space: 'screen',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 1,
              scale: 1,
              alpha: 0.75,
              motionX: ((index % 9) - 4) / (index + 20),
              motionY: 0.25 + index / 100,
              delayBeforeStartMs: index * 10,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'maruTrapdoor':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'maruTrapdoor:open', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1632,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 1 * 64,
            baseY: 5 * 64,
            space: 'world',
            animationIntervalMs: 150,
            animationLength: 4,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'maruTrapdoor:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 688,
            sourceY: 1632,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 1 * 64,
            baseY: 5 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            delayBeforeStartMs: 500,
            layerDepth: 0.99,
          }),
        ],
      }
    case 'shaneCliffs':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneCliffs:body', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 27,
            baseX: 83 * 64,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 83 * 64 - 16,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0001,
          }),
          createStageEffect(command.id, 'shaneCliffs:propA', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 84 * 64,
            baseY: 99 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:propB', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 82 * 64,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:can', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 542,
            sourceY: 1893,
            sourceWidth: 4,
            sourceHeight: 6,
            baseX: 83 * 64 - 32,
            baseY: 99 * 64 + 16,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'candleBoat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'candleBoat', {
            effectNumericId: 1,
            textureName: 'Maps\\Festivals',
            sourceX: 240,
            sourceY: 112,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 22 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'candleBoatMove':
      return { effects: [], mode: 'update-candle-boat' as const, effectNumericId: 1 }
    case 'abbyvideoscreen':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyvideoscreen', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 167,
            sourceY: 1714,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 2 * 64 + 28,
            baseY: 3 * 64 + 48,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 3,
            loops: 9999,
            scale: 4,
            layerDepth: 0.0002,
          }),
        ],
      }
    case 'islandFishSplash':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'islandFishSplash', {
            effectNumericId: 9999,
            textureName: 'Maps\\springobjects',
            sourceX: 336,
            sourceY: 544,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 81 * 64,
            baseY: 92 * 64,
            space: 'world',
            animationIntervalMs: 100000,
            animationLength: 1,
            loops: 1,
            flip: true,
            scale: 4,
            layerDepth: 0.99,
            motionX: -2,
            motionY: -8,
            accelerationY: 0.2,
            rotationChange: -0.02,
          }),
        ],
      }
    case 'sebastianGarage':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianGarage', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1843,
            sourceWidth: 48,
            sourceHeight: 42,
            baseX: 17 * 64,
            baseY: 23 * 64 + 8,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.1472,
          }),
        ],
      }
    case 'sunroom':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sunroom', {
            effectNumericId: 996,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 304,
            sourceY: 486,
            sourceWidth: 24,
            sourceHeight: 26,
            baseX: 4 * 64 + 32,
            baseY: 8 * 64 - 32,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 997,
            scale: 4,
            layerDepth: 0.0512,
          }),
        ],
      }
    case 'shakeBush':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 777, shakeIntensity: 1 }
    case 'parrotHutSquawk':
      return { effects: [], mode: 'update-parrot-perch-squawk' as const, effectNumericId: 999 }
    case 'frogJump':
      return { effects: [], mode: 'update-frog-jump' as const, effectNumericId: 777 }
    case 'raccoonCircle':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonCircle:raccoon', {
            effectNumericId: 9786,
            textureName: 'Characters\\raccoon',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 54.5 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 148,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.051840004,
          }),
          createStageEffect(command.id, 'raccoonCircle:mrs', {
            effectNumericId: 9785,
            textureName: 'Characters\\mrs_raccoon',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 56.5 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 148,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.0512,
          }),
          createStageEffect(command.id, 'raccoonCircle:cutout', {
            effectNumericId: 997799,
            textureName: 'LooseSprites\\raccoon_circle_cutout',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 263,
            sourceHeight: 263,
            baseX: 2750,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
            alpha: 0.88,
          }),
        ],
      }
    case 'raccoondance1':
      return { effects: [], mode: 'update-raccoon-dance' as const, effectNumericId: 9786 }
    case 'raccoondance2':
      return { effects: [], mode: 'update-raccoon-dance' as const, effectNumericId: 9785 }
    case 'raccoonCircle2':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonCircle2', {
            effectNumericId: 997797,
            textureName: 'LooseSprites\\raccoon_circle_cutout',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 263,
            sourceHeight: 263,
            baseX: 3080,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 297,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.003,
            layerDepth: 0.8,
          }),
        ],
      }
    case 'raccoonbutterflies':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 52.5 * 64 - 131.5 * 4, y: 60 * 4, sx: 128, sy: 336, px: 32, py: 8, loopX: 2800, loopY: 3800 },
            { x: 56.5 * 64 - 131.5 * 4, y: 0, sx: 192, sy: 336, px: 32, py: 4, loopX: 2600, loopY: 2900 },
            { x: 53.5 * 64 + 263 * 4, y: 24 * 4, sx: 128, sy: 288, px: 32, py: 6, loopX: 3000, loopY: 3100 },
            { x: 52.5 * 64 + 131.5 * 4, y: 220 * 4, sx: 192, sy: 288, px: 32, py: 12, loopX: 2400, loopY: 2800 },
            { x: 52.5 * 64 + 186.5 * 4, y: 150 * 4, sx: 64, sy: 288, px: 32, py: 4, loopX: 3400, loopY: 3200 },
            { x: 52.5 * 64 + 211.5 * 4, y: 180 * 4, sx: 128, sy: 96, px: 32, py: 4, loopX: 3500, loopY: 2700 },
            { x: 52.5 * 64 - 126.5 * 4, y: -120 * 4, sx: 192, sy: 112, px: 16, py: 4, loopX: 2500, loopY: 3300 },
            { x: 49.5 * 64 - 126.5 * 4, y: -100 * 4, sx: 128, sy: 288, px: 16, py: 4, loopX: 2200, loopY: 3400 },
          ].map((entry, index) =>
            createStageEffect(command.id, `raccoonbutterflies:${index}`, {
              effectNumericId: 997799,
              textureName: 'TileSheets\\critters',
              sourceX: entry.sx,
              sourceY: entry.sy,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: entry.x,
              baseY: entry.y,
              space: 'screen',
              animationIntervalMs: 148,
              animationLength: 4,
              loops: 99999,
              pingPong: true,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: entry.loopX,
              xPeriodicRange: entry.px,
              yPeriodic: true,
              yPeriodicLoopTimeMs: entry.loopY,
              yPeriodicRange: entry.py,
              alpha: 0.01,
              alphaFade: -0.01,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'raccoonSong':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonSong:noteA', {
            textureName: 'LooseSprites\\Cursors_1_6',
            sourceX: 279,
            sourceY: 55,
            sourceWidth: 12,
            sourceHeight: 15,
            baseX: 3706 - 26,
            baseY: 340 - 48,
            space: 'screen',
            animationIntervalMs: 297,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.044809997,
          }),
          createStageEffect(command.id, 'raccoonSong:noteB', {
            textureName: 'LooseSprites\\Cursors_1_6',
            sourceX: 374,
            sourceY: 55,
            sourceWidth: 12,
            sourceHeight: 15,
            baseX: 54 * 64,
            baseY: 4 * 64 - 16,
            space: 'world',
            animationIntervalMs: 297,
            animationLength: 8,
            loops: 999,
            flip: true,
            scale: 4,
            delayBeforeStartMs: 297,
            layerDepth: 0.044809997,
          }),
          ...Array.from({ length: 8 }, (_, index) => [
            createStageEffect(command.id, `raccoonSong:petal:${index}`, {
              textureName: 'LooseSprites\\Cursors_1_6',
              sourceX: 304,
              sourceY: 397,
              sourceWidth: 11,
              sourceHeight: 11,
              baseX: 3706 + 56,
              baseY: 340 - 48,
              space: 'screen',
              animationIntervalMs: 49,
              animationLength: 12,
              loops: 1,
              scale: 4,
              motionX: 1,
              accelerationY: 0.001,
              rotationChange: ((index % 5) - 2) / 100,
              color: '#ffc8c8',
              delayBeforeStartMs: 2376 * index,
              layerDepth: 0.05057,
            }),
            createStageEffect(command.id, `raccoonSong:flash:${index}`, {
              textureName: 'LooseSprites\\Cursors_1_6',
              sourceX: 455,
              sourceY: 414,
              sourceWidth: 14,
              sourceHeight: 17,
              baseX: 3706 + 28,
              baseY: 340 - 48,
              space: 'screen',
              animationIntervalMs: 2376,
              animationLength: 1,
              loops: 999,
              scale: 4,
              alphaFade: 0.02,
              delayBeforeStartMs: 2376 * index,
              layerDepth: 0.051209997,
            }),
          ]).flat(),
        ],
      }
    case 'georgeLeekGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'georgeLeekGift', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 17 * 64,
            baseY: 19 * 64,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 1,
            holdLastFrame: true,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'trashBearMagic':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 32 }, (_, index) =>
          createStageEffect(command.id, `trashBearMagic:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (95 + (index % 6)) * 64 + ((index * 17) % 48),
            baseY: (103 + Math.floor(index / 6)) * 64 + ((index * 11) % 32),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.5,
            motionX: ((index % 5) - 2) * 0.18,
            motionY: -1 - (index % 4) * 0.08,
            alphaFade: 0.008,
            color: '#7cff6a',
            delayBeforeStartMs: index * 40,
            layerDepth: 1,
          }),
        ),
      }
    case 'trashBearPrelude':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 40 }, (_, index) =>
          createStageEffect(command.id, `trashBearPrelude:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (95 + (index % 5)) * 64 + ((index * 13) % 44),
            baseY: (106 + Math.floor(index / 5)) * 64 + ((index * 19) % 24),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.3,
            motionX: ((index % 7) - 3) * 0.16,
            motionY: -0.9 - (index % 3) * 0.06,
            alphaFade: 0.006,
            color: '#7cff6a',
            delayBeforeStartMs: index * 30,
            layerDepth: 1,
          }),
        ),
      }
    case 'trashBearUmbrella1':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'trashBearUmbrella1', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\Cursors2',
            sourceX: 0,
            sourceY: 80,
            sourceWidth: 46,
            sourceHeight: 56,
            baseX: 102 * 64,
            baseY: 94.5 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: -9,
            accelerationY: 0.4,
          }),
        ],
      }
    case 'movieTheater_setup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'movieTheater_setup', {
            effectNumericId: 999,
            textureName: 'Maps\\MovieTheaterScreen_TileSheet',
            sourceX: 224,
            sourceY: 0,
            sourceWidth: 96,
            sourceHeight: 112,
            baseX: 4 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            delayBeforeStartMs: 7950,
            layerDepth: 1,
          }),
        ],
      }
    case 'wizardSewerMagic':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardSewerMagic:0', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 15 * 64 + 8,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 20,
            scale: 4,
            alphaFade: 0.005,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'wizardSewerMagic:1', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 17 * 64 + 8,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 20,
            scale: 4,
            alphaFade: 0.005,
            layerDepth: 1,
          }),
        ],
      }
    case 'woodswalker':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'woodswalker', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 448,
            sourceY: 419,
            sourceWidth: 16,
            sourceHeight: 21,
            baseX: 4 * 64 + 20,
            baseY: 1 * 64 + 88,
            space: 'world',
            animationIntervalMs: 150,
            animationLength: 4,
            loops: 7,
            scale: 4,
            shakeIntensity: 1,
            motionX: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'evilRabbit':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'evilRabbit', {
            effectNumericId: 778,
            textureName: 'TileSheets\\critters',
            sourceX: 264,
            sourceY: 209,
            sourceWidth: 19,
            sourceHeight: 16,
            baseX: 4 * 64 + 152,
            baseY: 1 * 64 + 92,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 999,
            flip: true,
            scale: 4,
            motionX: -2,
            motionY: -2,
            accelerationY: 0.1,
            layerDepth: 1,
          }),
        ],
      }
    case 'junimoShow':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoShow:0', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 350,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 6,
            loops: 86,
            scale: 4,
            layerDepth: 0.95,
          }),
          createStageEffect(command.id, 'junimoShow:1', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 364,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 4,
            loops: 31,
            scale: 4,
            delayBeforeStartMs: 11034,
            layerDepth: 0.97,
          }),
          createStageEffect(command.id, 'junimoShow:2', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 378,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 6,
            loops: 21,
            scale: 4,
            delayBeforeStartMs: 22069,
            layerDepth: 1,
          }),
        ],
      }
    case 'linusMoney':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 8 }, (_, index) =>
          createStageEffect(command.id, `linusMoney:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 397,
            sourceY: 1941,
            sourceWidth: 19,
            sourceHeight: 20,
            baseX: 520 + (index % 4) * 36,
            baseY: 260 + Math.floor(index / 4) * 40,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            motionY: -1.6 - index * 0.08,
            motionX: ((index % 3) - 1) * 0.4,
            alphaFade: 0.01,
            delayBeforeStartMs: 10 + index * 90,
            layerDepth: 1,
          }),
        ),
      }
    case 'joshDinner':
      return {
        mode: 'append' as const,
        effects: [
          createAnimationRowEffect(command.id, 'joshDinner:0', 649, {
            baseX: 6 * 64 + 8,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 9999,
            layerDepth: 0.0256,
          }),
          createAnimationRowEffect(command.id, 'joshDinner:1', 664, {
            baseX: 8 * 64 - 8,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 9999,
            layerDepth: 0.0256,
          }),
        ],
      }
    case 'maruBeaker':
      return {
        mode: 'append' as const,
        effects: [
          createAnimationRowEffect(command.id, 'maruBeaker', 738, {
            baseX: 9 * 64,
            baseY: 14 * 64 + 32,
            space: 'world',
            animationIntervalMs: 1380,
            animationLength: 1,
            loops: 1,
            scale: 1,
            rotationChange: Math.PI / 24,
            motionY: -7,
            accelerationY: 0.2,
            layerDepth: 1,
          }),
        ],
      }
    case 'abbyAtLake':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyAtLake:anchor', 735, {
            baseX: 48 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          ...[
            { x: 48 * 64 + 32, y: 30 * 64, px: 32, py: 21, lx: 2000, ly: 1600, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 16, py: 21, lx: 1000, ly: 1600, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 21, py: 32, lx: 2400, ly: 2800, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 16, py: 16, lx: 2000, ly: 2400, color: null },
            { x: 66 * 64 - 32, y: 34 * 64, px: 21, py: 48, lx: 2000, ly: 2600, color: '#ffa64d' },
            { x: 66 * 64 + 32, y: 34 * 64, px: 32, py: 21, lx: 2000, ly: 2600, color: '#ffa64d' },
            { x: 66 * 64 + 32, y: 34 * 64 + 32, px: 42, py: 32, lx: 4000, ly: 5000, color: '#ffa64d' },
            { x: 66 * 64, y: 34 * 64 - 32, px: 32, py: 32, lx: 4000, ly: 5500, color: '#ffa64d' },
            { x: 69 * 64 - 32, y: 28 * 64, px: 32, py: 21, lx: 2400, ly: 3600, color: '#ffa64d' },
            { x: 69 * 64 + 32, y: 28 * 64, px: 42, py: 51, lx: 2500, ly: 3600, color: '#ffa64d' },
            { x: 69 * 64 + 32, y: 28 * 64 + 32, px: 21, py: 32, lx: 4500, ly: 3000, color: '#ffa64d' },
            { x: 69 * 64, y: 28 * 64 - 32, px: 64, py: 48, lx: 5000, ly: 4500, color: '#ffa64d' },
            { x: 72 * 64 - 32, y: 33 * 64, px: 32, py: 21, lx: 2000, ly: 3000, color: '#ffa64d' },
            { x: 72 * 64 + 32, y: 33 * 64, px: 21, py: 32, lx: 2900, ly: 3200, color: '#ffa64d' },
            { x: 72 * 64 + 32, y: 33 * 64 + 32, px: 16, py: 32, lx: 4200, ly: 3300, color: '#ffa64d' },
            { x: 72 * 64, y: 33 * 64 - 32, px: 32, py: 16, lx: 5100, ly: 4000, color: '#ffa64d' },
          ].map((entry, index) =>
            createStageEffect(command.id, `abbyAtLake:orb:${index}`, {
              textureName: 'TileSheets\\animations',
              sourceX: 232,
              sourceY: 328,
              sourceWidth: 4,
              sourceHeight: 4,
              baseX: entry.x,
              baseY: entry.y,
              space: 'world',
              animationIntervalMs: 9999999,
              animationLength: 1,
              loops: 1,
              scale: 1,
              xPeriodic: true,
              yPeriodic: true,
              xPeriodicLoopTimeMs: entry.lx,
              yPeriodicLoopTimeMs: entry.ly,
              xPeriodicRange: entry.px,
              yPeriodicRange: entry.py,
              color: entry.color,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'jojaCeremony':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 16 }, (_, index) => {
          const baseX = 30 + ((index * 143) % (EFFECT_VIEWPORT_BASE_WIDTH - 160))
          const baseY = EFFECT_VIEWPORT_BASE_HEIGHT + index * 64
          return [
            createStageEffect(command.id, `jojaCeremony:streamer:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 534,
              sourceY: 1413,
              sourceWidth: 11,
              sourceHeight: 16,
              baseX,
              baseY,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              motionX: 0.25,
              motionY: -1.5,
              accelerationY: -0.001,
              color: '#00bfff',
              layerDepth: 1,
            }),
            createStageEffect(command.id, `jojaCeremony:tail:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 545,
              sourceY: 1413,
              sourceWidth: 11,
              sourceHeight: 34,
              baseX,
              baseY,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              motionX: 0.25,
              motionY: -1.5,
              accelerationY: -0.001,
              layerDepth: 1,
            }),
          ]
        }).flat(),
      }
    case 'balloonBirds':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 48, y: 12, delay: 1500, motionX: -3, scale: 4 },
            { x: 47, y: 13, delay: 1250, motionX: -3, scale: 4 },
            { x: 46, y: 14, delay: 1100, motionX: -3, scale: 4 },
            { x: 45, y: 15, delay: 1000, motionX: -3, scale: 4 },
            { x: 46, y: 16, delay: 1080, motionX: -3, scale: 4 },
            { x: 47, y: 17, delay: 1300, motionX: -3, scale: 4 },
            { x: 48, y: 18, delay: 1450, motionX: -3, scale: 4 },
            { x: 46, y: 15, delay: 5450, motionX: -4, scale: 4 },
            { x: 48, y: 10, delay: 500, motionX: -2, scale: 2 },
            { x: 47, y: 11, delay: 250, motionX: -2, scale: 2 },
            { x: 46, y: 12, delay: 100, motionX: -2, scale: 2 },
            { x: 45, y: 13, delay: 0, motionX: -2, scale: 2 },
            { x: 46, y: 14, delay: 80, motionX: -2, scale: 2 },
            { x: 47, y: 15, delay: 300, motionX: -2, scale: 2 },
            { x: 48, y: 16, delay: 450, motionX: -2, scale: 2 },
          ].map((entry, index) =>
            createStageEffect(command.id, `balloonBirds:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 388,
              sourceY: 1894,
              sourceWidth: 24,
              sourceHeight: 22,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 100,
              animationLength: 6,
              loops: 9999,
              scale: entry.scale,
              motionX: entry.motionX,
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'marcelloLand':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'marcelloLand:balloon', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1183,
            sourceWidth: 84,
            sourceHeight: 160,
            baseX: 25 * 64 - 92,
            baseY: 19 * 64,
            space: 'world',
            animationIntervalMs: 10000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionY: 2,
            layerDepth: 0.00002,
          }),
          createStageEffect(command.id, 'marcelloLand:basket', {
            effectNumericId: 2,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 84,
            sourceY: 1205,
            sourceWidth: 38,
            sourceHeight: 26,
            baseX: 25 * 64,
            baseY: 19 * 64 + 536,
            space: 'world',
            animationIntervalMs: 10000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionY: 2,
            layerDepth: 0.2625,
          }),
          createStageEffect(command.id, 'marcelloLand:shine', {
            effectNumericId: 3,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 24,
            sourceY: 1343,
            sourceWidth: 36,
            sourceHeight: 19,
            baseX: 25 * 64,
            baseY: 40 * 64,
            space: 'world',
            animationIntervalMs: 7000,
            animationLength: 1,
            loops: 99999,
            scale: 0.1,
            scaleChange: 0.01,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'movieBush':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'movieBush', {
            effectNumericId: 777,
            textureName: 'TileSheets\\bushes',
            sourceX: 65,
            sourceY: 58,
            sourceWidth: 30,
            sourceHeight: 35,
            baseX: 4 * 64 + 132,
            baseY: 1 * 64 + 52,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.99,
          }),
        ],
      }
    case 'samSkate1':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'samSkate1', {
            effectNumericId: 92473,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 388,
            sourceY: 1875,
            sourceWidth: 16,
            sourceHeight: 6,
            baseX: 12 * 64,
            baseY: 90 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            motionX: 4,
            accelerationX: -0.008,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'moonlightJellies':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 40 }, (_, index) =>
            createStageEffect(command.id, `moonlightJellies:${index}`, {
              textureName: 'Maps\\Festivals',
              sourceX: 256,
              sourceY: 16,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: (46 + (index % 12)) * 64,
              baseY: 49 * 64,
              space: 'world',
              animationIntervalMs: 250,
              animationLength: 3,
              loops: 9999,
              pingPong: true,
              scale: 4,
              motionY: -1,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 3000,
              xPeriodicRange: 16,
              delayBeforeStartMs: 14000 + index * 900,
              layerDepth: 0.1,
            }),
          ),
        ],
      }
    case 'junimoCageGone':
    case 'junimoCageGone2':
      return { effects: [], mode: 'update-remove-all-id-1' as const, effectNumericId: 1 }
    default:
      return { effects: [], mode: 'append' as const }
  }
}

function applyStageEffectCommand(effects: StageEffectState[], command: EventCommand) {
  switch (command.command) {
    case 'temporaryAnimatedSprite': {
      const effect = parseTemporaryAnimatedSpriteCommand(command)
      return effect ? [...effects, effect] : effects
    }
    case 'temporarySprite': {
      const effect = parseTemporarySpriteCommand(command)
      return effect ? [...effects, effect] : effects
    }
    case 'removeSprite': {
      const tile = parsePoint(command.args[1], command.args[2])
      if (tile) {
        return removeStageEffectsByTile(effects, tile.tileX, tile.tileY)
      }

      const effectNumericId = Number.parseInt(command.args[1] ?? '', 10)
      return Number.isFinite(effectNumericId) ? removeStageEffectsByNumericId(effects, effectNumericId) : effects
    }
    case 'removeTemporarySprites':
      return []
    case 'specificTemporarySprite': {
      const result = buildSpecificTemporarySpriteEffects(command)
      switch (result.mode) {
        case 'remove-by-id':
          return result.effectNumericId != null ? removeStageEffectsByNumericId(effects, result.effectNumericId) : effects
        case 'update-boombox-start':
          return replaceStageEffectByNumericId(effects, 999, (current) => ({
            ...current,
            pulse: true,
            pulseTimeMs: 420,
          }))
        case 'update-boombox-stop':
          return replaceStageEffectByNumericId(effects, 999, (current) => ({
            ...current,
            pulse: false,
            scale: 4,
            scaleChange: 0,
          }))
        case 'replace-jas-gift':
          return [
            ...effects.filter((effect) => effect.effectNumericId !== 999),
            createStageEffect(command.id, 'jasGiftOpen:gift', {
              effectNumericId: 999,
              textureName: 'LooseSprites\\Cursors',
              sourceX: 288,
              sourceY: 1231,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: 22 * 64,
              baseY: 16 * 64,
              space: 'world',
              animationIntervalMs: 100,
              animationLength: 6,
              loops: 1,
              holdLastFrame: true,
              scale: 4,
              layerDepth: 0.01,
            }),
            ...result.effects,
          ]
        case 'update-shake':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                shakeIntensity: result.shakeIntensity ?? 0,
              }))
            : effects
        case 'update-replace-source':
          return result.effectNumericId != null && result.sourceRect
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                sourceX: result.sourceRect?.x ?? current.sourceX,
                sourceY: result.sourceRect?.y ?? current.sourceY,
                sourceWidth: result.sourceRect?.width ?? current.sourceWidth,
                sourceHeight: result.sourceRect?.height ?? current.sourceHeight,
                animationLength: current.animationLength > 1 ? 3 : 1,
                pingPong: command.args[1] === 'BoatParrotLeave',
                motionX: command.args[1] === 'BoatParrotLeave' ? 4 : 0,
                motionY: command.args[1] === 'BoatParrotLeave' ? -6 : 0,
              }))
            : effects
        case 'update-curtain':
          return result.effectNumericId != null && result.sourceRect
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                sourceX: result.sourceRect?.x ?? current.sourceX,
                sourceY: result.sourceRect?.y ?? current.sourceY,
                sourceWidth: result.sourceRect?.width ?? current.sourceWidth,
                sourceHeight: result.sourceRect?.height ?? current.sourceHeight,
              }))
            : effects
        case 'update-secret-gift':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                animationLength: 6,
                animationIntervalMs: 100,
                loops: 1,
                holdLastFrame: true,
                startedAtMs: performance.now(),
              }))
            : effects
        case 'update-grandpa-spirit':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                textureName: 'LooseSprites\\Cursors2',
                sourceX: 186,
                sourceY: 265,
                sourceWidth: 22,
                sourceHeight: 34,
                yPeriodic: true,
                yPeriodicLoopTimeMs: 1000,
                yPeriodicRange: 16,
                xPeriodic: true,
                xPeriodicLoopTimeMs: 2500,
                xPeriodicRange: 16,
              }))
            : effects
        case 'update-leah-painting-hold': {
          const nextEffects = effects
            .filter((effect) => effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 999
                ? {
                    ...effect,
                    sourceX: effect.sourceX + 15,
                  }
                : effect,
            )

          return [...nextEffects, ...result.effects]
        }
        case 'update-leah-painting-release':
          return effects
            .filter((effect) => effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 999
                ? {
                    ...effect,
                    sourceX: effect.sourceX - 15,
                  }
                : effect,
            )
        case 'update-farmer-hold-painting': {
          const nextEffects = effects
            .filter((effect) => effect.effectNumericId !== 444 && effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 888
                ? {
                    ...effect,
                    sourceX: effect.sourceX + 15,
                  }
                : effect,
            )

          return [...nextEffects, ...result.effects]
        }
        case 'update-candle-boat':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                motionY: 2,
              }))
            : effects
        case 'update-remove-all-id-1':
          return removeStageEffectsByNumericId(effects, 1)
        default:
          return [...effects, ...result.effects]
      }
    }
    default:
      return effects
  }
}

function applyMoveCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const nextActors = { ...actors }
  let durationMs = 0

  for (let index = 1; index + 3 < command.args.length; index += 4) {
    const actorName = command.args[index]
    const delta = parsePoint(command.args[index + 1], command.args[index + 2])
    const facingDirection = Number.parseInt(command.args[index + 3] ?? '', 10)
    if (!actorName || !delta || !Number.isFinite(facingDirection)) {
      break
    }

    const actor = getActorByName(nextActors, actorName)
    if (!actor) {
      continue
    }

    const nextTileX = actor.tileX + delta.tileX
    const nextTileY = actor.tileY + delta.tileY
    const frameState = getActorDefaultFrameState(actor.actorName, facingDirection)
    const movementDistance = Math.abs(delta.tileX) + Math.abs(delta.tileY)
    const actorDurationMs = Math.max(0, movementDistance * 220)

    nextActors[toActorKey(actorName)] = {
      ...actor,
      tileX: nextTileX,
      tileY: nextTileY,
      visible: nextTileX >= 0 && nextTileY >= 0,
      facingDirection,
      frame: frameState.frame,
      directionalFlip: frameState.directionalFlip,
      animation: null,
      movement:
        movementDistance === 0
          ? null
          : {
              fromTileX: actor.tileX,
              fromTileY: actor.tileY,
              toTileX: nextTileX,
              toTileY: nextTileY,
              fromOffsetX: actor.offsetX,
              fromOffsetY: actor.offsetY,
              toOffsetX: actor.offsetX,
              toOffsetY: actor.offsetY,
              startedAtMs: performance.now(),
              durationMs: actorDurationMs,
            },
    }
    durationMs = Math.max(durationMs, actorDurationMs)
  }

  return { actors: nextActors, durationMs }
}

function applyWarpCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args[1]
  const point = parsePoint(command.args[2], command.args[3])
  if (!actorName || !point) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          tileX: point.tileX,
          tileY: point.tileY,
          visible: point.tileX >= 0 && point.tileY >= 0,
          movement: null,
        },
      }
    : actors
}

function applyFaceDirectionCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args[1]
  const facingDirection = Number.parseInt(command.args[2] ?? '', 10)
  if (!actorName || !Number.isFinite(facingDirection)) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  const frameState = getActorDefaultFrameState(actorName, facingDirection)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          facingDirection,
          frame: frameState.frame,
          directionalFlip: frameState.directionalFlip,
          animation: null,
          movement: null,
        },
      }
    : actors
}

function applyShowFrameCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args.length === 2 ? 'farmer' : command.args[1]
  const frame = Number.parseInt((command.args.length === 2 ? command.args[1] : command.args[2]) ?? '', 10)
  if (!actorName || !Number.isFinite(frame)) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor ? { ...actors, [toActorKey(actorName)]: { ...actor, frame, directionalFlip: false, animation: null, movement: null } } : actors
}

function applyPositionOffsetCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args[1]
  const offsetX = Number.parseInt(command.args[2] ?? '', 10)
  const offsetY = Number.parseInt(command.args[3] ?? '', 10)
  if (!actorName || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          offsetX: actor.offsetX + offsetX,
          offsetY: actor.offsetY + offsetY,
          movement: {
            fromTileX: actor.tileX,
            fromTileY: actor.tileY,
            toTileX: actor.tileX,
            toTileY: actor.tileY,
            fromOffsetX: actor.offsetX,
            fromOffsetY: actor.offsetY,
            toOffsetX: actor.offsetX + offsetX,
            toOffsetY: actor.offsetY + offsetY,
            startedAtMs: performance.now(),
            durationMs: 160,
          },
        },
      }
    : actors
}

function applyChangePortraitCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.actorName ?? command.args[1]
  if (!actorName) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          portraitOverrideSuffix: command.portraitSuffix ?? null,
        },
      }
    : actors
}

function applyChangeSpriteCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.actorName ?? command.args[1]
  if (!actorName) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          spriteOverrideSuffix: command.spriteSuffix ?? null,
        },
      }
    : actors
}

function applyAnimateCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.actorName ?? command.args[1]
  const frames = command.animationFrames ?? []
  const frameDurationMs = command.animationFrameDurationMs ?? 0
  if (!actorName || frames.length === 0 || frameDurationMs <= 0) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          frame: frames[0] ?? actor.frame,
          directionalFlip: false,
          movement: null,
          animation: {
            frames,
            frameDurationMs,
            loop: command.animationLoop ?? false,
            flip: command.animationFlip ?? false,
            startedAtMs: performance.now(),
          },
        },
      }
    : actors
}

function applyStopAnimationCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.actorName ?? command.args[1]
  if (!actorName) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  if (!actor) {
    return actors
  }

  const fallbackFrameState =
    command.frame == null ? getActorDefaultFrameState(actor.actorName, actor.facingDirection) : { frame: command.frame, directionalFlip: false }
  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      frame: fallbackFrameState.frame,
      directionalFlip: fallbackFrameState.directionalFlip,
      animation: null,
      movement: null,
    },
  }
}

function resolveViewportFocus(
  command: EventCommand,
  actors: Record<string, EventActorState>,
  currentFocus: PlaybackState['focusTile'],
) {
  if (command.args[1] === 'move') {
    const offset = parsePoint(command.args[2], command.args[3])
    return offset
      ? currentFocus
        ? { tileX: currentFocus.tileX + offset.tileX, tileY: currentFocus.tileY + offset.tileY }
        : offset
      : currentFocus
  }

  const directPoint = parsePoint(command.args[1], command.args[2])
  if (directPoint && directPoint.tileX >= 0 && directPoint.tileY >= 0) {
    return directPoint
  }

  const actor = command.args[1] ? getActorByName(actors, command.args[1]) : null
  return actor ? { tileX: actor.tileX, tileY: actor.tileY } : currentFocus
}

function shouldTakeFork(command: EventCommand, forkFlag: boolean) {
  return command.targetConditionId == null ? forkFlag : false
}

function applyStageMapChange(state: PlaybackState, mapName: string | null) {
  const nextMapName = normalizeStageMapName(mapName)
  if (!nextMapName || nextMapName === state.currentMapName) {
    return state
  }

  return {
    ...state,
    currentMapName: nextMapName,
    stageEffects: [],
  }
}

function mergeEventScene(state: PlaybackState, event: EventScript) {
  const eventActors = buildActorMap(event)
  const actors = event.scene.actors.length ? { ...state.actors, ...eventActors } : state.actors

  return {
    activeEventKey: event.key,
    commands: event.commands,
    pointer: 0,
    focusTile: resolveCameraFocus(event, actors) ?? state.focusTile,
    actors,
  }
}

function buildDialogueEntry(commandId: string, actorName: string, pages: EventDialoguePage[], pageIndex: number): PlaybackLogEntry {
  const safePageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1))
  const page = pages[safePageIndex] ?? { id: 'page:0', text: '', portraitIndex: 0 }

  return {
    id: `${commandId}:dialogue:${safePageIndex}`,
    tone: 'dialogue',
    title: actorName,
    detail: page.text,
    actorName,
    portraitIndex: page.portraitIndex,
  }
}

function seekPlaybackToEntry(
  event: EventScript | null,
  eventIndex: Record<string, EventScript>,
  entryId: string,
  initialMapName: string | null,
): PlaybackState {
  const initialState = createInitialPlaybackState(event, initialMapName)
  if (!event || entryId === EVENT_SETUP_ENTRY_ID) {
    return initialState
  }

  let state = initialState
  for (let guard = 0; guard < 800; guard += 1) {
    const rawNextState = continuePlayback(state, eventIndex)
    const nextState = {
      ...rawNextState,
      waitingMs: null,
      blockingMovement: false,
      actors: Object.fromEntries(
        Object.entries(rawNextState.actors).map(([actorKey, actor]) => [
          actorKey,
          actor.movement ? { ...actor, movement: null } : actor,
        ]),
      ),
    }
    if (nextState.currentCommandId === entryId) {
      return nextState
    }
    if (nextState.ended) {
      return nextState
    }
    state = nextState
  }

  return state
}

function continuePlayback(state: PlaybackState, eventIndex: Record<string, EventScript>): PlaybackState {
  if (state.blockingMovement && Object.values(state.actors).some((actor) => actor.movement)) {
    return state
  }

  let nextState = { ...state, actors: { ...state.actors }, stageEffects: [...state.stageEffects], blockingMovement: false }

  if (nextState.activeDialogue && nextState.activeDialogue.pageIndex + 1 < nextState.activeDialogue.pages.length) {
    const activeDialogue = {
      ...nextState.activeDialogue,
      pageIndex: nextState.activeDialogue.pageIndex + 1,
    }

    return {
      ...nextState,
      activeDialogue,
      currentCommandId: activeDialogue.commandId,
      currentEntry: buildDialogueEntry(activeDialogue.commandId, activeDialogue.actorName, activeDialogue.pages, activeDialogue.pageIndex),
      waitingMs: null,
      blockingMovement: false,
      ended: false,
      pendingChoice: null,
    }
  }

  for (let guard = 0; guard < 400; guard += 1) {
    const command = nextState.commands[nextState.pointer]
    if (!command) {
      return { ...nextState, activeDialogue: null, ended: true, pendingChoice: null, waitingMs: null, blockingMovement: false }
    }

    const base = { ...nextState, currentCommandId: command.id }

    switch (command.command) {
      case 'pause':
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:pause`, tone: 'system', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: Math.max(0, command.delayMs ?? 0),
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'speak':
      case 'splitSpeak': {
        const actorName = command.actorName ?? command.title
        const pages =
          command.dialoguePages?.length
            ? command.dialoguePages
            : [{ id: 'page:0', text: command.text ?? command.detail, portraitIndex: 0 }]

        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: buildDialogueEntry(command.id, actorName, pages, 0),
          activeDialogue: pages.length > 1 ? { commandId: command.id, actorName, pages, pageIndex: 0 } : null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'message':
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:message`, tone: 'message', title: command.title, detail: command.text ?? command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'question':
      case 'quickQuestion':
        return {
          ...base,
          currentEntry: {
            id: `${command.id}:question`,
            tone: 'choice',
            title: command.title,
            detail: command.prompt ?? command.detail,
          },
          activeDialogue: null,
          pendingChoice: { command, question: command.prompt ?? command.detail, choices: command.choices ?? [] },
          waitingMs: null,
          blockingMovement: false,
          ended: false,
        }
      case 'move': {
        const moveResult = applyMoveCommand(nextState.actors, command)
        const actors = moveResult.actors
        return {
          ...base,
          actors,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:move`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          focusTile: resolveActorFocusTile(actors) ?? nextState.focusTile,
          waitingMs: null,
          blockingMovement: moveResult.durationMs > 0,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'warp':
        return {
          ...base,
          actors: applyWarpCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:warp`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'faceDirection':
        return {
          ...base,
          actors: applyFaceDirectionCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:face`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: command.args[3] === 'true' ? null : 500,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'showFrame':
        return {
          ...base,
          actors: applyShowFrameCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:frame`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'positionOffset':
        return {
          ...base,
          actors: applyPositionOffsetCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:offset`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'changePortrait':
        return {
          ...base,
          actors: applyChangePortraitCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:portrait`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'changeSprite':
        return {
          ...base,
          actors: applyChangeSpriteCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:sprite`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'animate':
        return {
          ...base,
          actors: applyAnimateCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:animate`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'stopAnimation':
        return {
          ...base,
          actors: applyStopAnimationCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:stopAnimation`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'temporaryAnimatedSprite':
      case 'temporarySprite':
      case 'removeSprite':
      case 'specificTemporarySprite':
      case 'removeTemporarySprites':
        return {
          ...base,
          stageEffects: applyStageEffectCommand(nextState.stageEffects, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:effect`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'viewport':
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:viewport`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          focusTile: resolveViewportFocus(command, nextState.actors, nextState.focusTile),
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'changeLocation': {
        const locationName = normalizeStageMapName(command.args[1])
        const stageState = applyStageMapChange(nextState, locationName)
        return {
          ...stageState,
          currentCommandId: command.id,
          pointer: nextState.pointer + 1,
          currentEntry: {
            id: `${command.id}:changeLocation`,
            tone: 'command',
            title: command.title,
            detail: locationName ?? command.detail,
          },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'changeToTemporaryMap': {
        const mapName = normalizeStageMapName(command.args[1])
        const stageState = applyStageMapChange(nextState, mapName)
        return {
          ...stageState,
          currentCommandId: command.id,
          pointer: nextState.pointer + 1,
          currentEntry: {
            id: `${command.id}:temporaryMap`,
            tone: 'command',
            title: command.title,
            detail: mapName ?? command.detail,
          },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'fork': {
        const targetEvent = command.targetEventKey && !command.isTranslationKey ? eventIndex[command.targetEventKey] : undefined
        if (targetEvent && shouldTakeFork(command, nextState.forkFlag)) {
          nextState = {
            ...nextState,
            ...mergeEventScene(nextState, targetEvent),
            currentEntry: { id: `${command.id}:fork`, tone: 'system', title: command.title, detail: command.targetEventKey ?? command.detail },
            currentCommandId: command.id,
            activeDialogue: null,
            waitingMs: null,
            blockingMovement: false,
          }
          continue
        }

        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:fork-skip`, tone: 'system', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'switchEvent': {
        const targetEvent = command.targetEventKey ? eventIndex[command.targetEventKey] : undefined
        if (targetEvent) {
          nextState = {
            ...nextState,
            ...mergeEventScene(nextState, targetEvent),
            currentEntry: { id: `${command.id}:switch`, tone: 'system', title: command.title, detail: command.targetEventKey ?? command.detail },
            currentCommandId: command.id,
            activeDialogue: null,
            waitingMs: null,
            blockingMovement: false,
          }
          continue
        }

        nextState = { ...nextState, pointer: nextState.pointer + 1 }
        continue
      }
      case 'end':
        if (command.dialoguePages?.length && command.actorName) {
          return {
            ...base,
            pointer: nextState.pointer + 1,
            currentEntry: buildDialogueEntry(command.id, command.actorName, command.dialoguePages, 0),
            activeDialogue:
              command.dialoguePages.length > 1
                ? { commandId: command.id, actorName: command.actorName, pages: command.dialoguePages, pageIndex: 0 }
                : null,
            waitingMs: null,
            blockingMovement: false,
            ended: false,
            pendingChoice: null,
          }
        }

        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:end`, tone: 'system', title: command.title, detail: nextState.activeEventKey ?? '' },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: true,
          pendingChoice: null,
        }
      default:
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:command`, tone: 'command', title: command.title, detail: command.detail || command.raw },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
    }
  }

  return nextState
}

function resolveChoice(state: PlaybackState, eventIndex: Record<string, EventScript>, choiceIndex: number) {
  const command = state.pendingChoice?.command ?? state.commands[state.pointer]
  if (!command || !state.pendingChoice) {
    return state
  }

  let commands = state.commands
  let forkFlag = state.forkFlag

  if (command.command === 'question' && command.forkChoiceIndex != null) {
    forkFlag = choiceIndex === command.forkChoiceIndex
  }
  if (command.command === 'quickQuestion') {
    const branchCommands = command.choices?.[choiceIndex]?.branchRawCommands ?? []
    const parsedBranchCommands = branchCommands.map((rawCommand, index) =>
      parseEventCommand(rawCommand, state.pointer + 1 + index),
    )
    commands = [...state.commands.slice(0, state.pointer + 1), ...parsedBranchCommands, ...state.commands.slice(state.pointer + 1)]
  }

  return continuePlayback(
    {
      ...state,
      commands,
      pointer: state.pointer + 1,
      forkFlag,
      activeDialogue: null,
      pendingChoice: null,
      waitingMs: null,
      ended: false,
    },
    eventIndex,
  )
}

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
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
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
  const labels = buildLabels(locale)
  const initialMapName = normalizeStageMapName(parsedEventAsset?.asset.name)
  const [autoPlay, setAutoPlay] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showMapPaths, setShowMapPaths] = useState(false)
  const [viewportZoom, setViewportZoom] = useState(EVENT_STAGE_INITIAL_ZOOM)
  const [zoomLabel, setZoomLabel] = useState(() => viewportLabels.zoomLabel(EVENT_STAGE_INITIAL_ZOOM))
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() => createInitialPlaybackState(selectedEvent, initialMapName))
  const [animationNowMs, setAnimationNowMs] = useState(() => performance.now())
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [mapMessage, setMapMessage] = useState('')
  const [characterTextureIndex, setCharacterTextureIndex] = useState<CharacterTextureIndex>({})
  const [actorAssets, setActorAssets] = useState<Record<string, ActorAssetState>>({})
  const [effectAssets, setEffectAssets] = useState<Record<string, EffectAssetState>>({})
  const visibleLayerIds = useMemo(
    () =>
      mapDocument
        ? mapDocument.layers
            .filter((layer) => layer.visible && (showMapPaths || !isPathsLayerName(layer.name)))
            .map((layer) => layer.id)
        : [],
    [mapDocument, showMapPaths],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      setCharacterTextureIndex({})
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const characterDataAsset = await loadTextAsset(directoryInfo.rootPath, CHARACTER_DATA_PATH)
        if (!cancelled) {
          setCharacterTextureIndex(buildCharacterTextureIndex(characterDataAsset.content))
        }
      } catch {
        if (!cancelled) {
          setCharacterTextureIndex({})
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      setMapDocument(null)
      setMapMessage('')
      return
    }
    if (!directoryInfo.unpackedMapsPath) {
      setMapDocument(null)
      setMapMessage(labels.stageMissing)
      return
    }

    if (!playbackState.currentMapName) {
      setMapDocument(null)
      setMapMessage('')
      return
    }

    const mapPath = `${directoryInfo.unpackedMapsPath}\\${playbackState.currentMapName}.tmx`
    let cancelled = false
    setMapMessage(labels.stageWaiting)

    void (async () => {
      try {
        const asset = await loadMapAsset(directoryInfo.rootPath, mapPath)
        if (cancelled) {
          return
        }
        if (asset.format !== 'tmx') {
          throw new Error('Only TMX maps can be staged for events.')
        }

        setMapDocument(parseTmxMap(asset.absolutePath, asset.relativePath, asset.content))
        setMapMessage(asset.relativePath)
      } catch (error) {
        if (!cancelled) {
          setMapDocument(null)
          setMapMessage(`${labels.stageFailed}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    directoryInfo?.rootPath,
    directoryInfo?.unpackedMapsPath,
    labels.stageFailed,
    labels.stageMissing,
    labels.stageWaiting,
    playbackState.currentMapName,
  ])

  useEffect(() => {
    setAutoPlay(false)
    setPlaybackState(createInitialPlaybackState(selectedEvent, initialMapName))
    onSelectTimelineEntry(EVENT_SETUP_ENTRY_ID)
    onPlaybackCommandChange(null)
  }, [initialMapName, onPlaybackCommandChange, onSelectTimelineEntry, selectedEvent])

  useEffect(() => {
    if (!timelineJumpRequestId) {
      return
    }

    setAutoPlay(false)
    setPlaybackState(seekPlaybackToEntry(selectedEvent, parsedEventAsset?.eventIndex ?? {}, timelineJumpRequestId, initialMapName))
    onTimelineJumpHandled()
  }, [initialMapName, onTimelineJumpHandled, parsedEventAsset?.eventIndex, selectedEvent, timelineJumpRequestId])

  useEffect(() => {
    onPlaybackCommandChange(playbackState.currentCommandId)
    if (playbackState.currentCommandId) {
      onSelectTimelineEntry(playbackState.currentCommandId)
    }
  }, [onPlaybackCommandChange, onSelectTimelineEntry, playbackState.currentCommandId])

  useEffect(() => {
    const hasAnimatedActors = Object.values(playbackState.actors).some((actor) => actor.animation || actor.movement)
    const hasAnimatedEffects = playbackState.stageEffects.some(
      (effect) =>
        effect.animationLength > 1 ||
        effect.motionX !== 0 ||
        effect.motionY !== 0 ||
        effect.accelerationX !== 0 ||
        effect.accelerationY !== 0 ||
        effect.alphaFade !== 0 ||
        effect.scaleChange !== 0 ||
        effect.rotationChange !== 0 ||
        effect.xPeriodic ||
        effect.yPeriodic ||
        effect.pulse,
    )
    if (!hasAnimatedActors && !hasAnimatedEffects) {
      return
    }

    let frameId = 0
    const tick = () => {
      setAnimationNowMs(performance.now())
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [playbackState.actors, playbackState.stageEffects])

  useEffect(() => {
    const completedActorKeys = Object.values(playbackState.actors)
      .filter((actor) => actor.animation && !actor.animation.loop)
      .filter((actor) => getAnimatedFrame(actor, animationNowMs).complete)
      .map((actor) => toActorKey(actor.actorName))

    if (!completedActorKeys.length) {
      return
    }

    setPlaybackState((current) => {
      let changed = false
      const nextActors = { ...current.actors }

      for (const actorKey of completedActorKeys) {
        const actor = nextActors[actorKey]
        if (!actor?.animation) {
          continue
        }

        const finalFrame = actor.animation.frames[actor.animation.frames.length - 1] ?? actor.frame
        nextActors[actorKey] = { ...actor, frame: finalFrame, animation: null }
        changed = true
      }

      return changed ? { ...current, actors: nextActors } : current
    })
  }, [animationNowMs, playbackState.actors])

  useEffect(() => {
    const completedMovementActorKeys = Object.values(playbackState.actors)
      .filter((actor) => actor.movement)
      .filter((actor) => animationNowMs - (actor.movement?.startedAtMs ?? 0) >= (actor.movement?.durationMs ?? Number.POSITIVE_INFINITY))
      .map((actor) => toActorKey(actor.actorName))

    if (completedMovementActorKeys.length === 0) {
      return
    }

    setPlaybackState((current) => {
      let changed = false
      const nextActors = { ...current.actors }

      for (const actorKey of completedMovementActorKeys) {
        const actor = nextActors[actorKey]
        if (!actor?.movement) {
          continue
        }

        const frameState = getActorDefaultFrameState(actor.actorName, actor.facingDirection)
        nextActors[actorKey] = { ...actor, movement: null, frame: frameState.frame, directionalFlip: frameState.directionalFlip }
        changed = true
      }

      if (!changed) {
        return current
      }

      const stillMoving = Object.values(nextActors).some((actor) => actor.movement)
      const nextState = { ...current, actors: nextActors, blockingMovement: stillMoving ? current.blockingMovement : false }

      if (!stillMoving && current.blockingMovement && autoPlay && !current.pendingChoice && !current.ended) {
        return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {})
      }

      return nextState
    })
  }, [animationNowMs, autoPlay, parsedEventAsset?.eventIndex, playbackState.actors])

  useEffect(() => {
    if (!autoPlay || playbackState.pendingChoice || playbackState.ended || playbackState.blockingMovement) {
      return
    }

    const waitMs =
      playbackState.waitingMs ??
      (playbackState.currentEntry?.tone === 'dialogue'
        ? 1500
        : playbackState.currentEntry?.tone === 'message'
          ? 1200
          : null)

    if (waitMs == null) {
      setPlaybackState((current) => continuePlayback(current, parsedEventAsset?.eventIndex ?? {}))
      return
    }

    const timeout = window.setTimeout(() => {
      setPlaybackState((current) => ({
        ...continuePlayback(current, parsedEventAsset?.eventIndex ?? {}),
        waitingMs: null,
      }))
    }, waitMs)

    return () => window.clearTimeout(timeout)
  }, [autoPlay, parsedEventAsset?.eventIndex, playbackState])

  const actorAssetRequests = useMemo<ActorAssetRequest[]>(
    () =>
      Object.values(playbackState.actors).map((actor) => {
        const textureCandidates = getTextureCandidates(actor.actorName, characterTextureIndex)
        const spriteTextureCandidates = actor.spriteOverrideSuffix
          ? [...textureCandidates.map((candidate) => `${candidate}_${actor.spriteOverrideSuffix}`), ...textureCandidates]
          : textureCandidates
        const portraitTextureCandidates = actor.portraitOverrideSuffix
          ? [...textureCandidates.map((candidate) => `${candidate}_${actor.portraitOverrideSuffix}`), ...textureCandidates]
          : textureCandidates
        return {
          actorKey: toActorKey(actor.actorName),
          actorName: actor.actorName,
          requestKey: `${directoryInfo?.rootPath ?? ''}::${spriteTextureCandidates.join('|')}::${portraitTextureCandidates.join('|')}::${JSON.stringify(
            isFarmerActor(actor.actorName) || normalizeActorName(actor.actorName) === 'farmer' ? playerAppearanceProfile : null,
          )}`,
          spriteTextureCandidates,
          portraitTextureCandidates,
          farmerAppearanceProfile:
            isFarmerActor(actor.actorName) || normalizeActorName(actor.actorName) === 'farmer' ? playerAppearanceProfile : null,
        }
      }),
    [characterTextureIndex, directoryInfo?.rootPath, playbackState.actors, playerAppearanceProfile],
  )

  useEffect(() => {
    setActorAssets((current) => {
      const next = Object.fromEntries(
        actorAssetRequests.flatMap((request) => {
          const asset = current[request.actorKey]
          return asset?.requestKey === request.requestKey ? [[request.actorKey, asset] as const] : []
        }),
      )

      return areAssetMapsEqual(current, next) ? current : next
    })
  }, [actorAssetRequests])

  const pendingActorAssetRequests = useMemo(
    () => actorAssetRequests.filter((request) => actorAssets[request.actorKey]?.requestKey !== request.requestKey),
    [actorAssetRequests, actorAssets],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath || !pendingActorAssetRequests.length) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingActorAssetRequests.map(async (request) => [request.actorKey, await resolveActorAssets(request, directoryInfo.rootPath)] as const),
      )
      if (cancelled) {
        return
      }

      setActorAssets((current) => ({
        ...current,
        ...Object.fromEntries(resolvedEntries),
      }))
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, pendingActorAssetRequests])

  const effectTextureRequests = useMemo(
    () => Array.from(new Set(playbackState.stageEffects.map((effect) => effect.textureName).filter(Boolean))),
    [playbackState.stageEffects],
  )

  useEffect(() => {
    setEffectAssets((current) =>
      Object.fromEntries(
        effectTextureRequests.flatMap((textureName) => {
          const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
          const asset = current[textureName]
          return asset?.requestKey === requestKey ? [[textureName, asset] as const] : []
        }),
      ),
    )
  }, [directoryInfo?.rootPath, effectTextureRequests])

  const pendingEffectTextureRequests = useMemo(
    () =>
      effectTextureRequests.filter((textureName) => {
        const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
        return effectAssets[textureName]?.requestKey !== requestKey
      }),
    [directoryInfo?.rootPath, effectAssets, effectTextureRequests],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath || pendingEffectTextureRequests.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingEffectTextureRequests.map(async (textureName) => [textureName, await resolveEffectAsset(textureName, directoryInfo.rootPath)] as const),
      )
      if (cancelled) {
        return
      }

      setEffectAssets((current) => ({
        ...current,
        ...Object.fromEntries(resolvedEntries),
      }))
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, pendingEffectTextureRequests])

  const focusWorldPoint = useMemo<ViewportWorldPoint | null>(() => {
    if (!mapDocument || !playbackState.focusTile) {
      return null
    }

    return {
      worldX: (playbackState.focusTile.tileX + 0.5) * mapDocument.tileWidth,
      worldY: (playbackState.focusTile.tileY + 0.5) * mapDocument.tileHeight,
    }
  }, [mapDocument, playbackState.focusTile])

  const currentDialogueActor =
    playbackState.currentEntry?.tone === 'dialogue' && playbackState.currentEntry.actorName
      ? getActorByName(playbackState.actors, playbackState.currentEntry.actorName)
      : null

  const currentDialogueActorAsset = currentDialogueActor ? actorAssets[toActorKey(currentDialogueActor.actorName)] ?? null : null
  const currentDialoguePortrait = useMemo(
    () => getPortraitFrameBounds(currentDialogueActorAsset, playbackState.currentEntry?.portraitIndex ?? 0),
    [currentDialogueActorAsset, playbackState.currentEntry?.portraitIndex],
  )

  const mapOverlay = useMemo(() => {
    if (!mapDocument) {
      return null
    }

    const gamePixelScale = mapDocument.tileWidth / 64
    const worldEffects = playbackState.stageEffects
      .filter((effect) => effect.space === 'world')
      .map((effect) => {
        const playback = getStageEffectPlayback(effect, animationNowMs)
        const asset = effectAssets[effect.textureName]
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
        {worldEffects}
        {Object.values(playbackState.actors)
          .filter((actor) => actor.visible)
          .sort((left, right) => left.tileY - right.tileY)
          .map((actor) => {
            const asset = actorAssets[toActorKey(actor.actorName)]
            const frameWidth = 16
            const frameHeight = getActorSpriteFrameHeight(actor.actorName)
            const renderState = getActorRenderState(actor, animationNowMs)
            const spriteColumns =
              asset?.spriteSheetWidth && asset.spriteSheetWidth >= frameWidth
                ? Math.max(1, Math.floor(asset.spriteSheetWidth / frameWidth))
                : 4
            const spriteLayers = buildSpriteLayerDescriptors(
              asset,
              renderState.frame,
              renderState.facingDirection,
              frameWidth,
              frameHeight,
              spriteColumns,
              renderState.directionalFlip,
            )
            const actorHeightTiles = frameHeight / 16
            const actorWidthTiles = frameWidth / 16
            const pixelX = renderState.tileX * mapDocument.tileWidth * viewportZoom + renderState.offsetX * gamePixelScale * viewportZoom
            const actorHeight = mapDocument.tileHeight * actorHeightTiles * viewportZoom
            const actorWidth = mapDocument.tileWidth * actorWidthTiles * viewportZoom
            const pixelY =
              renderState.tileY * mapDocument.tileHeight * viewportZoom +
              (renderState.offsetY + renderState.breathingOffsetY) * gamePixelScale * viewportZoom
            const spriteScale = Math.max(1, actorWidth / frameWidth)
            const spriteTransform = renderState.flip
              ? `translateX(${actorWidth}px) scale(${-spriteScale}, ${spriteScale * renderState.breathingScale})`
              : `scale(${spriteScale}, ${spriteScale * renderState.breathingScale})`

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
                            transform: layer.flip ? `translateX(${layer.width}px) scaleX(-1)` : undefined,
                            transformOrigin: 'top left',
                            backgroundImage: `url("${layer.url}")`,
                            backgroundPosition: `-${layer.sourceX}px -${layer.sourceY}px`,
                            backgroundRepeat: 'no-repeat',
                            imageRendering: 'pixelated',
                          }}
                        />
                      ))}
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
  }, [actorAssets, animationNowMs, effectAssets, mapDocument, playbackState.actors, playbackState.stageEffects, viewportZoom])

  const screenEffectsOverlay = useMemo(() => {
    const effects = playbackState.stageEffects
      .filter((effect) => effect.space === 'screen')
      .map((effect) => {
        const playback = getStageEffectPlayback(effect, animationNowMs)
        const asset = effectAssets[effect.textureName]
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
  }, [animationNowMs, effectAssets, playbackState.stageEffects])

  const viewportOverlay = (
    <div className="absolute inset-0">
      {screenEffectsOverlay}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex justify-between gap-3">
          <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
            {selectedEvent?.eventId ?? labels.scene}
          </div>
          {playbackState.activeEventKey && selectedEvent && playbackState.activeEventKey !== selectedEvent.key ? (
            <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-panel))] px-3 py-1 text-[11px] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
              {labels.branch}
            </div>
          ) : null}
        </div>
        <div className="flex justify-center">
          {playbackState.pendingChoice ? (
            <div className="pointer-events-auto w-full max-w-3xl rounded-[28px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_94%,transparent),color-mix(in_srgb,var(--bg-elevated)_96%,transparent))] p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.choose}</p>
              <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{playbackState.pendingChoice.question}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {playbackState.pendingChoice.choices.map((choice, index) => (
                  <button
                    key={`${choice.id}:${index}`}
                    type="button"
                    className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                    onClick={() => setPlaybackState((current) => resolveChoice(current, parsedEventAsset?.eventIndex ?? {}, index))}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          ) : playbackState.currentEntry ? (
            <div className="pointer-events-none flex w-full max-w-4xl items-end gap-4 rounded-[28px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_94%,transparent),color-mix(in_srgb,var(--bg-elevated)_96%,transparent))] p-4 shadow-[var(--shadow-panel)] backdrop-blur">
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
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
    </div>
  )

  function playNextFrame() {
    setAutoPlay(false)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent, initialMapName)
      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {})
    })
  }

  function toggleAutoPlayback() {
    setAutoPlay((current) => !current)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent, initialMapName)
      const shouldAdvanceImmediately =
        current.rootEventKey !== selectedEvent?.key || current.ended || (!current.currentEntry && !current.pendingChoice)

      return shouldAdvanceImmediately ? continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}) : nextState
    })
  }

  function resetPlayback() {
    setAutoPlay(false)
    setPlaybackState(createInitialPlaybackState(selectedEvent, initialMapName))
    onSelectTimelineEntry(EVENT_SETUP_ENTRY_ID)
  }

  if (!parsedEventAsset) {
    return (
      <div className="panel-surface h-full border-[var(--border-color)] bg-[var(--bg-panel)]">
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
    <div className="panel-surface h-full border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),var(--bg-panel))]">
      <div className="panel-header">
        <div>
          <p className="panel-title">{labels.scene}</p>
          <p className="panel-subtitle">{mapMessage || eventStatusMessage}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cx('tool-button', showGrid && 'tool-button-active')}
            title="Toggle grid"
            onClick={() => setShowGrid((current) => !current)}
          >
            <Grid2x2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cx('tool-button', showMapPaths && 'tool-button-active')}
            title={locale === 'zh-CN' ? '显示 Paths 图层' : 'Show Paths layer'}
            onClick={() => setShowMapPaths((current) => !current)}
          >
            <Route className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="tool-button"
            title={locale === 'zh-CN' ? '设置 Player 外观' : 'Configure player appearance'}
            onClick={onOpenPlayerAppearanceWindow}
          >
            <UserRound className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
            <button type="button" className="tool-button" onClick={playNextFrame} title={labels.play}>
              <Play className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cx('tool-button', autoPlay && 'tool-button-active')}
              onClick={toggleAutoPlayback}
              title={autoPlay ? labels.pause : labels.step}
            >
              {autoPlay ? <Pause className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
            </button>
            <button type="button" className="tool-button" onClick={resetPlayback} title={labels.reset}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <span className="dock-chip">{zoomLabel}</span>
        </div>
      </div>
      <div className="panel-body h-[calc(100%-58px)] min-h-0 p-3">
        <MapViewport
          key={
            mapDocument
              ? `${mapDocument.sourcePath}:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
              : `empty:${playbackState.currentMapName ?? 'map'}:${selectedEvent?.key ?? 'event'}`
          }
          mapDocument={mapDocument}
          visibleLayerIds={visibleLayerIds}
          visibleObjectGroupIds={[]}
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
          onZoomChange={(nextZoom) => {
            setViewportZoom(nextZoom)
            setZoomLabel(viewportLabels.zoomLabel(nextZoom))
          }}
        />
      </div>
    </div>
  )
}
