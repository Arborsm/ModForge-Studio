import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GameDirectoryInfo } from '../lib/desktop'
import type { ThemeMode, ViewportLabels } from '../lib/editor-shell'
import { parseEventCommand } from '../lib/events/parser'
import type { EventCommand, EventSceneActor, EventScript, ParsedEventAsset } from '../lib/events/types'
import { cx } from '../lib/cx'
import { EventStagePreview } from './event-workflow/EventStagePreview'

type EventWorkspaceProps = {
  locale: 'zh-CN' | 'en-US'
  directoryInfo: GameDirectoryInfo | null
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  parsedEventAsset: ParsedEventAsset | null
  selectedEventKey: string | null
  selectedEvent: EventScript | null
  eventStatusMessage: string
  onSelectEvent: (eventKey: string) => void
}

type EventTimelineEntry = {
  id: string
  title: string
  detail: string
  kind: EventCommand['kind'] | 'setup'
  command: EventCommand | null
}

type PlaybackLogEntry = {
  id: string
  tone: 'dialogue' | 'message' | 'choice' | 'command' | 'system'
  title: string
  detail: string
}

type PlaybackChoiceState = {
  command: EventCommand
  question: string
  choices: NonNullable<EventCommand['choices']>
}

type EventActorState = {
  id: string
  actorName: string
  textureName: string | null
  tileX: number
  tileY: number
  facingDirection: number
  frame: number
  spritePath: string | null
  portraitPath: string | null
  spriteUrl: string | null
  portraitUrl: string | null
}

type PlaybackState = {
  rootEventKey: string | null
  activeEventKey: string | null
  commands: EventCommand[]
  pointer: number
  forkFlag: boolean
  actors: Record<string, EventActorState>
  currentEntry: PlaybackLogEntry | null
  currentCommandToken: string | null
  log: PlaybackLogEntry[]
  pendingChoice: PlaybackChoiceState | null
  waitingMs: number | null
  focusTile: { tileX: number; tileY: number } | null
  ended: boolean
}

const SETUP_ENTRY_ID = 'setup'
const FARMER_NAME_PATTERN = /^farmer\d*$/iu

function buildLabels(locale: 'zh-CN' | 'en-US') {
  return locale === 'zh-CN'
    ? {
        empty: '先在左侧选择一个事件文件。',
        workspace: '事件演出',
        scene: '场景播放',
        sceneIdle: '选择事件后即可在地图中预览脚本演出。',
        stageWaiting: '正在载入对应地图...',
        stageMissing: '没有可用的 XNB 地图，无法在中间舞台预览事件。',
        stageFailed: '地图载入失败',
        timeline: '事件脚本时间轴',
        timelineHint: '线性脚本按顺序排布，点击任意命令查看细节。',
        eventList: '事件目录',
        inspector: '命令检查器',
        inspectorEmpty: '选择时间轴命令后在这里查看参数和原始脚本。',
        setup: '场景初始化',
        play: '播放',
        pause: '暂停',
        step: '下一步',
        reset: '重置',
        branch: '当前播放已经跳转到其他事件分支。',
        choose: '选择分支',
        transcript: '播放记录',
        noEvents: '当前事件文件没有可解析的事件。',
        noCommands: '这个事件没有后续脚本命令。',
        music: '音乐',
        camera: '镜头',
        actors: '角色',
        raw: '原始脚本',
        current: '当前',
      }
    : {
        empty: 'Select an event file first.',
        workspace: 'Event Playback',
        scene: 'Scene Stage',
        sceneIdle: 'Choose an event to preview it directly on the map.',
        stageWaiting: 'Loading the matching map stage...',
        stageMissing: 'No XNB map was found for this event stage.',
        stageFailed: 'Failed to load stage map',
        timeline: 'Script Timeline',
        timelineHint: 'Commands stay linear. Click any step to inspect it.',
        eventList: 'Event Directory',
        inspector: 'Command Inspector',
        inspectorEmpty: 'Select a timeline step to inspect its arguments and raw script.',
        setup: 'Scene Setup',
        play: 'Play',
        pause: 'Pause',
        step: 'Step',
        reset: 'Reset',
        branch: 'Playback has branched into another event.',
        choose: 'Choose Branch',
        transcript: 'Transcript',
        noEvents: 'No events were parsed from this file.',
        noCommands: 'This event has no playable commands.',
        music: 'Music',
        camera: 'Camera',
        actors: 'Actors',
        raw: 'Raw Script',
        current: 'Current',
      }
}

function normalizeActorName(value: string) {
  return value.trim().replace(/\?$/u, '')
}

function toActorKey(actorName: string) {
  return normalizeActorName(actorName).toLowerCase()
}

function isFarmerActor(actorName: string) {
  return FARMER_NAME_PATTERN.test(normalizeActorName(actorName))
}

function getTextureName(actorName: string) {
  const normalized = normalizeActorName(actorName)
  if (!normalized || normalized === 'player' || isFarmerActor(normalized) || normalized === 'spouse') {
    return null
  }

  return normalized
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

function createActorState(actor: EventSceneActor, rootPath: string | null): EventActorState {
  const textureName = getTextureName(actor.actorName)

  return {
    id: actor.id,
    actorName: actor.actorName,
    textureName,
    tileX: actor.tileX,
    tileY: actor.tileY,
    facingDirection: actor.facingDirection,
    frame: getDefaultFrame(actor.facingDirection),
    spritePath: textureName && rootPath ? `${rootPath}\\Content\\Characters\\${textureName}.xnb` : null,
    portraitPath: textureName && rootPath ? `${rootPath}\\Content\\Portraits\\${textureName}.xnb` : null,
    spriteUrl: null,
    portraitUrl: null,
  }
}

function buildActorMap(event: EventScript, rootPath: string | null) {
  return Object.fromEntries(
    event.scene.actors.map((actor) => {
      const actorState = createActorState(actor, rootPath)
      return [toActorKey(actor.actorName), actorState]
    }),
  ) as Record<string, EventActorState>
}

function resolveActorFocusTile(actorMap: Record<string, EventActorState>) {
  const farmer = Object.values(actorMap).find((actor) => isFarmerActor(actor.actorName))
  const primary = farmer ?? Object.values(actorMap)[0]

  return primary ? { tileX: primary.tileX, tileY: primary.tileY } : null
}

function resolveCameraFocus(event: EventScript, actorMap: Record<string, EventActorState>) {
  const raw = event.scene.cameraInstruction?.trim()
  if (!raw || raw === 'continue' || raw === 'follow') {
    return resolveActorFocusTile(actorMap)
  }

  const parts = raw.split(/\s+/u)
  const tileX = Number.parseInt(parts[0] ?? '', 10)
  const tileY = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isFinite(tileX) && Number.isFinite(tileY)) {
    return { tileX, tileY }
  }

  const actor = actorMap[toActorKey(raw)]
  return actor ? { tileX: actor.tileX, tileY: actor.tileY } : resolveActorFocusTile(actorMap)
}

function buildSceneSummary(event: EventScript, labels: ReturnType<typeof buildLabels>) {
  return [
    `${labels.music}: ${event.scene.musicCue ?? 'none'}`,
    `${labels.camera}: ${event.scene.cameraInstruction ?? 'follow'}`,
    `${labels.actors}: ${event.scene.actors.length}`,
  ].join(' | ')
}

function buildCommandToken(eventKey: string | null, commandId: string) {
  return `${eventKey ?? 'event'}::${commandId}`
}

function createInitialPlaybackState(event: EventScript | null, rootPath: string | null): PlaybackState {
  if (!event) {
    return {
      rootEventKey: null,
      activeEventKey: null,
      commands: [],
      pointer: 0,
      forkFlag: false,
      actors: {},
      currentEntry: null,
      currentCommandToken: null,
      log: [],
      pendingChoice: null,
      waitingMs: null,
      focusTile: null,
      ended: true,
    }
  }

  const actors = buildActorMap(event, rootPath)

  return {
    rootEventKey: event.key,
    activeEventKey: event.key,
    commands: event.commands,
    pointer: 0,
    forkFlag: false,
    actors,
    currentEntry: null,
    currentCommandToken: null,
    log: [],
    pendingChoice: null,
    waitingMs: null,
    focusTile: resolveCameraFocus(event, actors),
    ended: event.commands.length === 0,
  }
}

function getActorByName(actors: Record<string, EventActorState>, actorName: string) {
  return actors[toActorKey(actorName)] ?? null
}

function withLogEntry(state: PlaybackState, entry: PlaybackLogEntry, commandToken: string | null, waitingMs: number | null) {
  return {
    ...state,
    currentEntry: entry,
    currentCommandToken: commandToken,
    log: [...state.log, entry],
    waitingMs,
  }
}

function parsePoint(valueA: string | undefined, valueB: string | undefined) {
  const tileX = Number.parseInt(valueA ?? '', 10)
  const tileY = Number.parseInt(valueB ?? '', 10)
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return null
  }

  return { tileX, tileY }
}

function applyMoveCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const nextActors = { ...actors }

  for (let index = 1; index + 3 < command.args.length; index += 4) {
    const actorName = command.args[index]
    const point = parsePoint(command.args[index + 1], command.args[index + 2])
    const facingDirection = Number.parseInt(command.args[index + 3] ?? '', 10)
    if (!actorName || !point || !Number.isFinite(facingDirection)) {
      break
    }

    const actor = getActorByName(nextActors, actorName)
    if (!actor) {
      continue
    }

    nextActors[toActorKey(actorName)] = {
      ...actor,
      tileX: point.tileX,
      tileY: point.tileY,
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
  if (!actor) {
    return actors
  }

  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      tileX: point.tileX,
      tileY: point.tileY,
    },
  }
}

function applyFaceDirectionCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args[1]
  const facingDirection = Number.parseInt(command.args[2] ?? '', 10)
  if (!actorName || !Number.isFinite(facingDirection)) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  if (!actor) {
    return actors
  }

  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      facingDirection,
      frame: getDefaultFrame(facingDirection),
    },
  }
}

function applyShowFrameCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const actorName = command.args.length === 2 ? 'farmer' : command.args[1]
  const frame = Number.parseInt((command.args.length === 2 ? command.args[1] : command.args[2]) ?? '', 10)
  if (!actorName || !Number.isFinite(frame)) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  if (!actor) {
    return actors
  }

  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      frame,
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
    if (!offset) {
      return currentFocus
    }

    return currentFocus
      ? { tileX: currentFocus.tileX + offset.tileX, tileY: currentFocus.tileY + offset.tileY }
      : offset
  }

  const directPoint = parsePoint(command.args[1], command.args[2])
  if (directPoint) {
    return directPoint
  }

  const actor = command.args[1] ? getActorByName(actors, command.args[1]) : null
  return actor ? { tileX: actor.tileX, tileY: actor.tileY } : currentFocus
}

function shouldTakeFork(command: EventCommand, forkFlag: boolean) {
  if (command.targetConditionId == null) {
    return forkFlag
  }

  return false
}

function mergeEventScene(state: PlaybackState, event: EventScript, rootPath: string | null) {
  const eventActors = buildActorMap(event, rootPath)
  const actors = event.scene.actors.length ? { ...state.actors, ...eventActors } : state.actors

  return {
    activeEventKey: event.key,
    commands: event.commands,
    pointer: 0,
    focusTile: resolveCameraFocus(event, actors) ?? state.focusTile,
    actors,
  }
}

function continuePlayback(
  state: PlaybackState,
  eventIndex: Record<string, EventScript>,
  rootPath: string | null,
  autoMode: boolean,
): PlaybackState {
  let nextState = {
    ...state,
    actors: { ...state.actors },
    log: [...state.log],
  }

  for (let guard = 0; guard < 400; guard += 1) {
    const command = nextState.commands[nextState.pointer]
    if (!command) {
      return {
        ...nextState,
        ended: true,
        pendingChoice: null,
        waitingMs: null,
      }
    }

    const commandToken = buildCommandToken(nextState.activeEventKey, command.id)

    switch (command.command) {
      case 'pause': {
        const entry = {
          id: `${commandToken}:pause`,
          tone: 'system' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? Math.max(120, Math.min(command.delayMs ?? 0, 2000)) : null,
        )
      }
      case 'speak': {
        const entry = {
          id: `${commandToken}:speak`,
          tone: 'dialogue' as const,
          title: command.actorName ?? command.title,
          detail: command.text ?? command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          null,
        )
      }
      case 'message': {
        const entry = {
          id: `${commandToken}:message`,
          tone: 'message' as const,
          title: command.title,
          detail: command.text ?? command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          null,
        )
      }
      case 'question':
      case 'quickQuestion': {
        const entry = {
          id: `${commandToken}:question`,
          tone: 'choice' as const,
          title: command.title,
          detail: command.prompt ?? command.detail,
        }

        return {
          ...withLogEntry(nextState, entry, commandToken, null),
          pendingChoice: {
            command,
            question: command.prompt ?? command.detail,
            choices: command.choices ?? [],
          },
          ended: false,
        }
      }
      case 'move': {
        const actors = applyMoveCommand(nextState.actors, command)
        const entry = {
          id: `${commandToken}:move`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            actors,
            pointer: nextState.pointer + 1,
            focusTile: resolveActorFocusTile(actors) ?? nextState.focusTile,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 420 : null,
        )
      }
      case 'warp': {
        const actors = applyWarpCommand(nextState.actors, command)
        const entry = {
          id: `${commandToken}:warp`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            actors,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 220 : null,
        )
      }
      case 'faceDirection': {
        const actors = applyFaceDirectionCommand(nextState.actors, command)
        const entry = {
          id: `${commandToken}:face`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            actors,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 180 : null,
        )
      }
      case 'showFrame': {
        const actors = applyShowFrameCommand(nextState.actors, command)
        const entry = {
          id: `${commandToken}:frame`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            actors,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 180 : null,
        )
      }
      case 'viewport': {
        const focusTile = resolveViewportFocus(command, nextState.actors, nextState.focusTile)
        const entry = {
          id: `${commandToken}:viewport`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail,
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            focusTile,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 260 : null,
        )
      }
      case 'fork': {
        const targetEvent =
          command.targetEventKey && !command.isTranslationKey ? eventIndex[command.targetEventKey] : undefined

        if (targetEvent && shouldTakeFork(command, nextState.forkFlag)) {
          const merged = mergeEventScene(nextState, targetEvent, rootPath)
          nextState = {
            ...nextState,
            ...merged,
            currentEntry: {
              id: `${commandToken}:fork`,
              tone: 'system',
              title: command.title,
              detail: command.targetEventKey ?? command.detail,
            },
            currentCommandToken: commandToken,
            waitingMs: autoMode ? 240 : null,
          }
          continue
        }

        nextState = {
          ...nextState,
          pointer: nextState.pointer + 1,
          currentEntry: {
            id: `${commandToken}:fork-skip`,
            tone: 'system',
            title: command.title,
            detail: command.detail,
          },
          currentCommandToken: commandToken,
          waitingMs: autoMode ? 120 : null,
        }
        return nextState
      }
      case 'switchEvent': {
        const targetEvent = command.targetEventKey ? eventIndex[command.targetEventKey] : undefined
        if (targetEvent) {
          const merged = mergeEventScene(nextState, targetEvent, rootPath)
          nextState = {
            ...nextState,
            ...merged,
            currentEntry: {
              id: `${commandToken}:switch`,
              tone: 'system',
              title: command.title,
              detail: command.targetEventKey ?? command.detail,
            },
            currentCommandToken: commandToken,
            waitingMs: autoMode ? 260 : null,
          }
          continue
        }

        nextState = {
          ...nextState,
          pointer: nextState.pointer + 1,
        }
        continue
      }
      case 'end': {
        const entry = {
          id: `${commandToken}:end`,
          tone: 'system' as const,
          title: command.title,
          detail: nextState.activeEventKey ?? '',
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            ended: true,
            pendingChoice: null,
          },
          entry,
          commandToken,
          null,
        )
      }
      default: {
        const entry = {
          id: `${commandToken}:command`,
          tone: 'command' as const,
          title: command.title,
          detail: command.detail || command.raw,
        }

        return withLogEntry(
          {
            ...nextState,
            pointer: nextState.pointer + 1,
            ended: false,
            pendingChoice: null,
          },
          entry,
          commandToken,
          autoMode ? 220 : null,
        )
      }
    }
  }

  return nextState
}

function resolveChoice(
  state: PlaybackState,
  eventIndex: Record<string, EventScript>,
  rootPath: string | null,
  choiceIndex: number,
) {
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
    const parsedBranchCommands = branchCommands.map((rawCommand, index) => parseEventCommand(rawCommand, state.pointer + 1 + index))
    commands = [...state.commands.slice(0, state.pointer + 1), ...parsedBranchCommands, ...state.commands.slice(state.pointer + 1)]
  }

  const choiceLabel = command.choices?.[choiceIndex]?.label ?? `${choiceIndex + 1}`

  return continuePlayback(
    {
      ...state,
      commands,
      pointer: state.pointer + 1,
      forkFlag,
      pendingChoice: null,
      waitingMs: null,
      currentEntry: {
        id: `${buildCommandToken(state.activeEventKey, command.id)}:answer:${choiceIndex}`,
        tone: 'choice',
        title: 'Answer',
        detail: choiceLabel,
      },
      currentCommandToken: buildCommandToken(state.activeEventKey, command.id),
      log: [
        ...state.log,
        {
          id: `${buildCommandToken(state.activeEventKey, command.id)}:answer:${choiceIndex}`,
          tone: 'choice',
          title: 'Answer',
          detail: choiceLabel,
        },
      ],
      ended: false,
    },
    eventIndex,
    rootPath,
    false,
  )
}

function getToneClass(kind: EventTimelineEntry['kind']) {
  switch (kind) {
    case 'dialogue':
      return 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)]'
    case 'message':
      return 'border-[color-mix(in_srgb,var(--success)_45%,transparent)]'
    case 'choice':
      return 'border-[color-mix(in_srgb,var(--accent)_55%,transparent)]'
    case 'branch':
      return 'border-[color-mix(in_srgb,var(--danger)_42%,transparent)]'
    case 'timing':
      return 'border-[color-mix(in_srgb,var(--text-secondary)_38%,transparent)]'
    case 'setup':
      return 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
    default:
      return 'border-[var(--border-color)]'
  }
}

export default function EventWorkspace({
  locale,
  directoryInfo,
  viewportLabels,
  theme,
  accentColor,
  parsedEventAsset,
  selectedEventKey,
  selectedEvent,
  eventStatusMessage,
  onSelectEvent,
}: EventWorkspaceProps) {
  const labels = buildLabels(locale)
  const [autoPlay, setAutoPlay] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string>(SETUP_ENTRY_ID)
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() =>
    createInitialPlaybackState(selectedEvent, directoryInfo?.rootPath ?? null),
  )
  const [actorAssetUrls, setActorAssetUrls] = useState<Record<string, { spriteUrl: string | null; portraitUrl: string | null }>>({})

  useEffect(() => {
    setAutoPlay(false)
    setSelectedEntryId(SETUP_ENTRY_ID)
    setPlaybackState(createInitialPlaybackState(selectedEvent, directoryInfo?.rootPath ?? null))
  }, [directoryInfo?.rootPath, selectedEvent])

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
      setPlaybackState((current) =>
        continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, directoryInfo?.rootPath ?? null, true),
      )
      return
    }

    const timeout = window.setTimeout(() => {
      setPlaybackState((current) => ({
        ...continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, directoryInfo?.rootPath ?? null, true),
        waitingMs: null,
      }))
    }, waitMs)

    return () => window.clearTimeout(timeout)
  }, [autoPlay, directoryInfo?.rootPath, parsedEventAsset?.eventIndex, playbackState])

  useEffect(() => {
    const currentToken = playbackState.currentCommandToken
    if (!currentToken || !selectedEvent) {
      return
    }

    const prefix = `${selectedEvent.key}::`
    if (currentToken.startsWith(prefix)) {
      setSelectedEntryId(currentToken.slice(prefix.length))
    }
  }, [playbackState.currentCommandToken, selectedEvent])

  const timelineEntries = useMemo<EventTimelineEntry[]>(() => {
    if (!selectedEvent) {
      return []
    }

    return [
      {
        id: SETUP_ENTRY_ID,
        title: labels.setup,
        detail: buildSceneSummary(selectedEvent, labels),
        kind: 'setup',
        command: null,
      },
      ...selectedEvent.commands.map((command) => ({
        id: command.id,
        title: command.title,
        detail: command.detail,
        kind: command.kind,
        command,
      })),
    ]
  }, [labels, selectedEvent])

  const selectedTimelineEntry =
    timelineEntries.find((entry) => entry.id === selectedEntryId) ?? timelineEntries[0] ?? null
  const selectedCommand = selectedTimelineEntry?.command ?? null
  const currentDialogueActor =
    playbackState.currentEntry?.tone === 'dialogue' && playbackState.currentEntry.title
      ? getActorByName(playbackState.actors, playbackState.currentEntry.title)
      : null

  const additionalViewportOverlay = (
    <div className="absolute inset-0 flex flex-col justify-between p-4 pb-24">
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
          <div className="panel-overlay-card pointer-events-auto w-full max-w-3xl">
            <p className="panel-section-title">{labels.choose}</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{playbackState.pendingChoice.question}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {playbackState.pendingChoice.choices.map((choice, index) => (
                <button
                  key={`${choice.id}:${index}`}
                  type="button"
                  className="panel-list-card panel-list-card-interactive px-4 py-3 text-left text-sm text-[var(--text-primary)]"
                  onClick={() =>
                    setPlaybackState((current) =>
                      resolveChoice(current, parsedEventAsset?.eventIndex ?? {}, directoryInfo?.rootPath ?? null, index),
                    )
                  }
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : playbackState.currentEntry ? (
          <div className="panel-overlay-card pointer-events-none flex w-full max-w-4xl items-end gap-4">
            <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] sm:block">
              {currentDialogueActor && actorAssetUrls[toActorKey(currentDialogueActor.actorName)]?.portraitUrl ? (
                <img
                  src={actorAssetUrls[toActorKey(currentDialogueActor.actorName)]?.portraitUrl ?? ''}
                  alt={currentDialogueActor.actorName}
                  className="h-full w-full object-cover"
                />
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

  function startOrResumePlayback() {
    setAutoPlay(true)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended
          ? current
          : createInitialPlaybackState(selectedEvent, directoryInfo?.rootPath ?? null)

      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, directoryInfo?.rootPath ?? null, true)
    })
  }

  function stepPlayback() {
    setAutoPlay(false)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended
          ? current
          : createInitialPlaybackState(selectedEvent, directoryInfo?.rootPath ?? null)

      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, directoryInfo?.rootPath ?? null, false)
    })
  }

  function resetPlayback() {
    setAutoPlay(false)
    setSelectedEntryId(SETUP_ENTRY_ID)
    setPlaybackState(createInitialPlaybackState(selectedEvent, directoryInfo?.rootPath ?? null))
  }

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
          <p className="panel-title">{labels.workspace}</p>
          <p className="panel-subtitle">{parsedEventAsset.asset.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="dock-chip">{parsedEventAsset.events.length}</span>
          <span className="dock-chip">{parsedEventAsset.locale ?? 'base'}</span>
        </div>
      </div>

      <div className="grid h-[calc(100%-58px)] min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,1fr)_240px]">
          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="panel-body min-h-0 p-0 h-full"
            >
              <div className="relative h-full"
              >
                <EventStagePreview
                  eventScript={selectedEvent}
                  mapName={parsedEventAsset.asset.name}
                  gameRootPath={directoryInfo?.rootPath ?? null}
                  locale={locale}
                  theme={theme}
                  accentColor={accentColor}
                  viewportLabels={viewportLabels}
                  hideHeader
                  additionalViewportOverlay={additionalViewportOverlay}
                  onActorAssetsChange={setActorAssetUrls}
                />
                <div className="workspace-viewport-toolbar" role="toolbar" aria-label={labels.scene}>
                  <div className="workspace-viewport-toolbar-group">
                    <button
                      type="button"
                      className={cx('workspace-viewport-toolbar-icon-button', autoPlay && 'workspace-viewport-toolbar-button-active')}
                      onClick={autoPlay ? () => setAutoPlay(false) : startOrResumePlayback}
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
                      onClick={stepPlayback}
                      title={labels.step}
                      aria-label={labels.step}
                      disabled={!selectedEvent}
                    >
                      <SkipForward className="h-4 w-4" />
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
                    {/* Grid toggle is provided by EventStagePreview */}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="panel-header">
              <div>
                <p className="panel-title">{labels.timeline}</p>
                <p className="panel-subtitle">{labels.timelineHint}</p>
              </div>
              <span className="dock-chip">{selectedEvent?.commands.length ?? 0}</span>
            </div>

            <div className="panel-body min-h-0 p-3">
              {timelineEntries.length ? (
                <div className="flex h-full gap-3 overflow-x-auto overflow-y-hidden pb-2">
                  {timelineEntries.map((entry, index) => {
                    const isSelected = entry.id === selectedEntryId
                    const isCurrent =
                      entry.command != null &&
                      playbackState.currentCommandToken === buildCommandToken(selectedEvent?.key ?? null, entry.command.id)

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cx(
                          'panel-list-card panel-list-card-interactive group relative flex h-full min-w-[220px] flex-col justify-between p-4 text-left transition-all hover:-translate-y-0.5',
                          getToneClass(entry.kind),
                          isSelected && 'ring-2 ring-[var(--accent)]',
                        )}
                        onClick={() => setSelectedEntryId(entry.id)}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="panel-section-title">
                              {entry.id === SETUP_ENTRY_ID ? labels.setup : `${index}. ${entry.kind}`}
                            </span>
                            {isCurrent ? <span className="dock-chip">{labels.current}</span> : null}
                          </div>
                          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{entry.title}</p>
                          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{entry.detail}</p>
                        </div>

                        {entry.command?.raw ? (
                          <div className="panel-list-card mt-4 px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                            {entry.command.raw}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="panel-canvas-empty h-full">
                  {labels.noCommands}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="grid min-h-0 gap-3 xl:grid-rows-[minmax(260px,0.52fr)_minmax(260px,0.48fr)]">
          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="panel-header">
              <div>
                <p className="panel-title">{labels.eventList}</p>
                <p className="panel-subtitle">{eventStatusMessage}</p>
              </div>
            </div>

            <div className="panel-body min-h-0 overflow-auto p-3">
              {parsedEventAsset.events.length ? (
                <div className="space-y-2">
                  {parsedEventAsset.events.map((event) => {
                    const isActive = event.key === selectedEventKey

                    return (
                      <button
                        key={event.key}
                        type="button"
                        className={cx(
                          'panel-list-card panel-list-card-interactive w-full px-3 py-3 text-left',
                          isActive
                            ? 'panel-list-card-active'
                            : 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]',
                        )}
                        onClick={() => onSelectEvent(event.key)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{event.eventId}</p>
                            <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                              {event.preconditions.slice(1).join(' / ') || event.key}
                            </p>
                          </div>
                          <span className="dock-chip shrink-0">{event.commands.length}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="panel-empty-state">
                  {labels.noEvents}
                </div>
              )}
            </div>
          </div>

          <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,0.58fr)_minmax(0,0.42fr)]">
            <div className="panel-surface panel-surface-muted min-h-0">
              <div className="panel-header">
                <div>
                  <p className="panel-title">{labels.inspector}</p>
                  <p className="panel-subtitle">{selectedEvent?.eventId ?? parsedEventAsset.asset.name}</p>
                </div>
              </div>

              <div className="panel-body min-h-0 space-y-3 overflow-auto p-3">
                <div className="panel-section p-3">
                  <p className="panel-section-title">
                    {selectedTimelineEntry?.id === SETUP_ENTRY_ID ? labels.setup : selectedTimelineEntry?.kind ?? labels.inspector}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {selectedTimelineEntry?.title ?? labels.inspectorEmpty}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                    {selectedTimelineEntry?.detail ?? labels.inspectorEmpty}
                  </p>
                </div>

                <div className="panel-section p-3">
                  <p className="panel-section-title">{labels.music}</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent?.scene.musicCue ?? 'none'}</p>
                  <p className="panel-section-title mt-3">{labels.camera}</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent?.scene.cameraInstruction ?? 'follow'}</p>
                  <p className="panel-section-title mt-3">{labels.actors}</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent?.scene.actors.length ?? 0}</p>
                </div>

                {selectedCommand?.raw ? (
                  <div className="panel-section p-3">
                    <p className="panel-section-title">{labels.raw}</p>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-[var(--text-primary)]">
                      {selectedCommand.raw}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="panel-surface panel-surface-muted min-h-0">
              <div className="panel-header">
                <div>
                  <p className="panel-title">{labels.transcript}</p>
                  <p className="panel-subtitle">{playbackState.activeEventKey ?? selectedEvent?.key ?? 'event'}</p>
                </div>
              </div>

              <div className="panel-body min-h-0 overflow-auto p-3">
                <div className="space-y-2">
                  {playbackState.log.length ? (
                    playbackState.log.map((entry) => (
                      <div
                        key={entry.id}
                        className={cx(
                          'panel-list-card px-3 py-2 text-sm',
                          entry.tone === 'dialogue'
                            ? 'bg-[color-mix(in_srgb,var(--warning)_8%,var(--bg-panel))]'
                            : entry.tone === 'choice'
                              ? 'bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel))]'
                              : entry.tone === 'message'
                                ? 'bg-[color-mix(in_srgb,var(--success)_10%,var(--bg-panel))]'
                                : 'bg-[var(--bg-panel)]',
                        )}
                      >
                        <p className="font-semibold text-[var(--text-primary)]">{entry.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{entry.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty-state">
                      {labels.sceneIdle}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
