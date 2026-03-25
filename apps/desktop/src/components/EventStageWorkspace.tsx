import { Grid2x2, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadMapAsset, loadTextAsset, type GameDirectoryInfo } from '../lib/desktop'
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
  timelineJumpRequestId: string | null
  onTimelineJumpHandled: () => void
  onSelectTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
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
  portraitOverrideSuffix: string | null
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
  commands: EventCommand[]
  pointer: number
  forkFlag: boolean
  actors: Record<string, EventActorState>
  currentEntry: PlaybackLogEntry | null
  currentCommandId: string | null
  activeDialogue: ActiveDialogueState | null
  pendingChoice: PlaybackChoiceState | null
  waitingMs: number | null
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
}

type ActorAssetState = {
  requestKey: string
  textureName: string | null
  spritePath: string | null
  spriteUrl: string | null
  spriteSheetWidth: number | null
  spriteSheetHeight: number | null
  portraitPath: string | null
  portraitUrl: string | null
  portraitSheetWidth: number | null
  portraitSheetHeight: number | null
}

type ResolvedAssetCandidate = {
  textureName: string
  path: string
  url: string
  width: number
  height: number
}

const FARMER_NAME_PATTERN = /^farmer\d*$/iu
const CHARACTER_DATA_PATH = 'Content (unpacked)\\Data\\Characters.json'
const MANUAL_TEXTURE_NAME_ALIASES: Record<string, string[]> = {
  leahex: ['LeahExFemale', 'LeahExMale', 'LeahEx'],
}

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
      return 12
    case 1:
      return 6
    case 3:
      return 18
    default:
      return 0
  }
}

function getInitialActorOffset(actorName: string) {
  const normalized = normalizeActorName(actorName)

  if (normalized === 'Junimo') {
    return { offsetX: 0, offsetY: -32 }
  }

  if (normalized === 'farmer' || isFarmerActor(normalized)) {
    return { offsetX: 0, offsetY: 16 }
  }

  return { offsetX: 0, offsetY: 0 }
}

function createActorState(actor: EventSceneActor): EventActorState {
  const initialOffset = getInitialActorOffset(actor.actorName)

  return {
    id: actor.id,
    actorName: actor.actorName,
    tileX: actor.tileX,
    tileY: actor.tileY,
    offsetX: initialOffset.offsetX,
    offsetY: initialOffset.offsetY,
    visible: actor.tileX >= 0 && actor.tileY >= 0,
    facingDirection: actor.facingDirection,
    frame: getDefaultFrame(actor.facingDirection),
    portraitOverrideSuffix: null,
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

function createInitialPlaybackState(event: EventScript | null): PlaybackState {
  if (!event) {
    return {
      rootEventKey: null,
      activeEventKey: null,
      commands: [],
      pointer: 0,
      forkFlag: false,
      actors: {},
      currentEntry: null,
      currentCommandId: null,
      activeDialogue: null,
      pendingChoice: null,
      waitingMs: null,
      focusTile: null,
      ended: true,
    }
  }

  const actors = buildActorMap(event)
  return {
    rootEventKey: event.key,
    activeEventKey: event.key,
    commands: event.commands,
    pointer: 0,
    forkFlag: false,
    actors,
    currentEntry: null,
    currentCommandId: null,
    activeDialogue: null,
    pendingChoice: null,
    waitingMs: null,
    focusTile: resolveCameraFocus(event, actors),
    ended: event.commands.length === 0,
  }
}

function applyMoveCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const nextActors = { ...actors }

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

    nextActors[toActorKey(actorName)] = {
      ...actor,
      tileX: nextTileX,
      tileY: nextTileY,
      visible: nextTileX >= 0 && nextTileY >= 0,
      facingDirection,
      frame: getDefaultFrame(facingDirection),
    }
  }

  return nextActors
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
  return actor
    ? {
        ...actors,
        [toActorKey(actorName)]: {
          ...actor,
          facingDirection,
          frame: getDefaultFrame(facingDirection),
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
  return actor ? { ...actors, [toActorKey(actorName)]: { ...actor, frame } } : actors
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

function seekPlaybackToEntry(event: EventScript | null, eventIndex: Record<string, EventScript>, entryId: string): PlaybackState {
  const initialState = createInitialPlaybackState(event)
  if (!event || entryId === EVENT_SETUP_ENTRY_ID) {
    return initialState
  }

  let state = initialState
  for (let guard = 0; guard < 800; guard += 1) {
    const nextState = { ...continuePlayback(state, eventIndex, false), waitingMs: null }
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

function continuePlayback(state: PlaybackState, eventIndex: Record<string, EventScript>, autoMode: boolean): PlaybackState {
  let nextState = { ...state, actors: { ...state.actors } }

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
      ended: false,
      pendingChoice: null,
    }
  }

  for (let guard = 0; guard < 400; guard += 1) {
    const command = nextState.commands[nextState.pointer]
    if (!command) {
      return { ...nextState, activeDialogue: null, ended: true, pendingChoice: null, waitingMs: null }
    }

    const base = { ...nextState, currentCommandId: command.id }

    switch (command.command) {
      case 'pause':
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:pause`, tone: 'system', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: autoMode ? Math.max(120, Math.min(command.delayMs ?? 0, 2000)) : null,
          ended: false,
          pendingChoice: null,
        }
      case 'speak': {
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
          ended: false,
        }
      case 'move': {
        const actors = applyMoveCommand(nextState.actors, command)
        return {
          ...base,
          actors,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:move`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          focusTile: resolveActorFocusTile(actors) ?? nextState.focusTile,
          waitingMs: autoMode ? 420 : null,
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
          waitingMs: autoMode ? 220 : null,
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
          waitingMs: autoMode ? 180 : null,
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
          waitingMs: autoMode ? 180 : null,
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
          waitingMs: autoMode ? 120 : null,
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
          waitingMs: autoMode ? 120 : null,
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
          waitingMs: autoMode ? 260 : null,
          ended: false,
          pendingChoice: null,
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
            waitingMs: autoMode ? 240 : null,
          }
          continue
        }

        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:fork-skip`, tone: 'system', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: autoMode ? 120 : null,
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
            waitingMs: autoMode ? 260 : null,
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
          ended: true,
          pendingChoice: null,
        }
      default:
        return {
          ...base,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:command`, tone: 'command', title: command.title, detail: command.detail || command.raw },
          activeDialogue: null,
          waitingMs: autoMode ? 220 : null,
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
    false,
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
  if (!normalized || normalized === 'player' || normalized === 'spouse' || isFarmerActor(normalized)) {
    return []
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

function buildAssetPath(rootPath: string, folderName: 'Characters' | 'Portraits', textureName: string) {
  return `${rootPath}\\Content (unpacked)\\${folderName}\\${textureName}.png`
}

function preloadImage(path: string) {
  return new Promise<{ url: string; width: number; height: number } | null>((resolve) => {
    const image = new Image()
    const assetUrl = toAssetUrl(path)

    image.onload = () =>
      resolve({
        url: assetUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    image.onerror = () => resolve(null)
    image.src = assetUrl
  })
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
      return { textureName, path, url: image.url, width: image.width, height: image.height }
    }
  }

  return null
}

async function resolveActorAssets(request: ActorAssetRequest, rootPath: string | null): Promise<ActorAssetState> {
  if (!rootPath || request.spriteTextureCandidates.length === 0) {
    return {
      requestKey: request.requestKey,
      textureName: null,
      spritePath: null,
      spriteUrl: null,
      spriteSheetWidth: null,
      spriteSheetHeight: null,
      portraitPath: null,
      portraitUrl: null,
      portraitSheetWidth: null,
      portraitSheetHeight: null,
    }
  }

  const [spriteAsset, portraitAsset] = await Promise.all([
    resolveFirstExistingImage(rootPath, 'Characters', request.spriteTextureCandidates),
    resolveFirstExistingImage(rootPath, 'Portraits', request.portraitTextureCandidates),
  ])

  return {
    requestKey: request.requestKey,
    textureName:
      spriteAsset?.textureName ?? portraitAsset?.textureName ?? request.portraitTextureCandidates[0] ?? request.spriteTextureCandidates[0] ?? null,
    spritePath: spriteAsset?.path ?? null,
    spriteUrl: spriteAsset?.url ?? null,
    spriteSheetWidth: spriteAsset?.width ?? null,
    spriteSheetHeight: spriteAsset?.height ?? null,
    portraitPath: portraitAsset?.path ?? null,
    portraitUrl: portraitAsset?.url ?? null,
    portraitSheetWidth: portraitAsset?.width ?? null,
    portraitSheetHeight: portraitAsset?.height ?? null,
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
  timelineJumpRequestId,
  onTimelineJumpHandled,
  onSelectTimelineEntry,
  onPlaybackCommandChange,
}: EventStageWorkspaceProps) {
  const labels = buildLabels(locale)
  const [autoPlay, setAutoPlay] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [viewportZoom, setViewportZoom] = useState(1)
  const [zoomLabel, setZoomLabel] = useState('100%')
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() => createInitialPlaybackState(selectedEvent))
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [mapMessage, setMapMessage] = useState('')
  const [characterTextureIndex, setCharacterTextureIndex] = useState<CharacterTextureIndex>({})
  const [actorAssets, setActorAssets] = useState<Record<string, ActorAssetState>>({})

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
    if (!parsedEventAsset || !directoryInfo?.rootPath) {
      setMapDocument(null)
      setMapMessage('')
      return
    }
    if (!directoryInfo.unpackedMapsPath) {
      setMapDocument(null)
      setMapMessage(labels.stageMissing)
      return
    }

    const mapPath = `${directoryInfo.unpackedMapsPath}\\${parsedEventAsset.asset.name}.tmx`
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
  }, [directoryInfo?.rootPath, directoryInfo?.unpackedMapsPath, labels.stageFailed, labels.stageMissing, labels.stageWaiting, parsedEventAsset])

  useEffect(() => {
    setAutoPlay(false)
    setPlaybackState(createInitialPlaybackState(selectedEvent))
    onSelectTimelineEntry(EVENT_SETUP_ENTRY_ID)
    onPlaybackCommandChange(null)
  }, [onPlaybackCommandChange, onSelectTimelineEntry, selectedEvent])

  useEffect(() => {
    if (!timelineJumpRequestId) {
      return
    }

    setAutoPlay(false)
    setPlaybackState(seekPlaybackToEntry(selectedEvent, parsedEventAsset?.eventIndex ?? {}, timelineJumpRequestId))
    onTimelineJumpHandled()
  }, [onTimelineJumpHandled, parsedEventAsset?.eventIndex, selectedEvent, timelineJumpRequestId])

  useEffect(() => {
    onPlaybackCommandChange(playbackState.currentCommandId)
    if (playbackState.currentCommandId) {
      onSelectTimelineEntry(playbackState.currentCommandId)
    }
  }, [onPlaybackCommandChange, onSelectTimelineEntry, playbackState.currentCommandId])

  useEffect(() => {
    if (!autoPlay || playbackState.pendingChoice || playbackState.ended) {
      return
    }

    const waitMs =
      playbackState.waitingMs ??
      (playbackState.currentEntry?.tone === 'dialogue'
        ? 1500
        : playbackState.currentEntry?.tone === 'message'
          ? 1200
          : playbackState.currentEntry?.tone === 'command'
            ? 240
            : playbackState.currentEntry?.tone === 'system'
              ? 200
              : null)

    if (waitMs == null) {
      setPlaybackState((current) => continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, true))
      return
    }

    const timeout = window.setTimeout(() => {
      setPlaybackState((current) => ({
        ...continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, true),
        waitingMs: null,
      }))
    }, waitMs)

    return () => window.clearTimeout(timeout)
  }, [autoPlay, parsedEventAsset?.eventIndex, playbackState])

  const actorAssetRequests = useMemo<ActorAssetRequest[]>(
    () =>
      Object.values(playbackState.actors).map((actor) => {
        const textureCandidates = getTextureCandidates(actor.actorName, characterTextureIndex)
        const portraitTextureCandidates = actor.portraitOverrideSuffix
          ? [...textureCandidates.map((candidate) => `${candidate}_${actor.portraitOverrideSuffix}`), ...textureCandidates]
          : textureCandidates
        return {
          actorKey: toActorKey(actor.actorName),
          actorName: actor.actorName,
          requestKey: `${directoryInfo?.rootPath ?? ''}::${textureCandidates.join('|')}::${portraitTextureCandidates.join('|')}`,
          spriteTextureCandidates: textureCandidates,
          portraitTextureCandidates,
        }
      }),
    [characterTextureIndex, directoryInfo?.rootPath, playbackState.actors],
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

    return (
      <div className="absolute inset-0">
        {Object.values(playbackState.actors)
          .filter((actor) => actor.visible)
          .sort((left, right) => left.tileY - right.tileY)
          .map((actor) => {
            const gamePixelScale = mapDocument.tileWidth / 64
            const asset = actorAssets[toActorKey(actor.actorName)]
            const frameWidth = 16
            const frameHeight = getActorSpriteFrameHeight(actor.actorName)
            const spriteColumns =
              asset?.spriteSheetWidth && asset.spriteSheetWidth >= frameWidth
                ? Math.max(1, Math.floor(asset.spriteSheetWidth / frameWidth))
                : 4
            const actorHeightTiles = frameHeight / 16
            const actorWidthTiles = frameWidth / 16
            const pixelX = actor.tileX * mapDocument.tileWidth * viewportZoom + actor.offsetX * gamePixelScale * viewportZoom
            const spriteFrameX = (actor.frame % spriteColumns) * frameWidth
            const spriteFrameY = Math.floor(actor.frame / spriteColumns) * frameHeight
            const actorHeight = mapDocument.tileHeight * actorHeightTiles * viewportZoom
            const actorWidth = mapDocument.tileWidth * actorWidthTiles * viewportZoom
            const pixelY = actor.tileY * mapDocument.tileHeight * viewportZoom - actorHeight + actor.offsetY * gamePixelScale * viewportZoom
            const actorLabel = normalizeActorName(actor.actorName)

            return (
              <div
                key={actor.id}
                className="absolute transition-[transform] duration-300 ease-out"
                style={{
                  transform: `translate(${pixelX}px, ${pixelY}px)`,
                  width: `${actorWidth}px`,
                  height: `${actorHeight}px`,
                  zIndex: actor.tileY,
                }}
              >
                {asset?.spriteUrl ? (
                  <div className="relative overflow-hidden" style={{ width: `${actorWidth}px`, height: `${actorHeight}px` }}>
                    <div
                      style={{
                        width: `${frameWidth}px`,
                        height: `${frameHeight}px`,
                        transform: `scale(${Math.max(1, actorWidth / frameWidth)})`,
                        transformOrigin: 'top left',
                        backgroundImage: `url("${asset.spriteUrl}")`,
                        backgroundPosition: `-${spriteFrameX}px -${spriteFrameY}px`,
                        backgroundRepeat: 'no-repeat',
                        imageRendering: 'pixelated',
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-end justify-center">
                    <div className="rounded-full border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
                      {actorLabel}
                    </div>
                  </div>
                )}
                <div className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_86%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
                  {actorLabel}
                </div>
              </div>
            )
          })}
      </div>
    )
  }, [actorAssets, mapDocument, playbackState.actors, viewportZoom])

  const viewportOverlay = (
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
  )

  function playNextFrame() {
    setAutoPlay(false)
    setPlaybackState((current) => {
      const nextState = current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent)
      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, false)
    })
  }

  function toggleAutoPlayback() {
    setAutoPlay((current) => !current)
    setPlaybackState((current) => {
      const nextState = current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent)
      const shouldAdvanceImmediately =
        current.rootEventKey !== selectedEvent?.key || current.ended || (!current.currentEntry && !current.pendingChoice)

      return shouldAdvanceImmediately ? continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, true) : nextState
    })
  }

  function resetPlayback() {
    setAutoPlay(false)
    setPlaybackState(createInitialPlaybackState(selectedEvent))
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
          key={mapDocument ? `${mapDocument.sourcePath}:${selectedEvent?.key ?? 'event'}` : `empty:${selectedEvent?.key ?? 'event'}`}
          mapDocument={mapDocument}
          visibleLayerIds={mapDocument?.layers.map((layer) => layer.id) ?? []}
          visibleObjectGroupIds={[]}
          labels={viewportLabels}
          theme={theme}
          accentColor={accentColor}
          showGrid={showGrid}
          showStatsChips={false}
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
