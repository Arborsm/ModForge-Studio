import { parseEventCommand, EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventStageCopy } from '@locales/editor-shell'
import type { EventCommand, EventDialoguePage, EventScript } from '@entities/event'
import {
  buildEventAnimationFrames,
  inferFarmerAnimationFramesVisualState,
  inferFarmerFrameVisualState,
  buildFarmerSingleAnimationFrames,
  getFarmerEatAnimationId,
  inferFarmerSingleAnimationVisualState,
} from '@entities/event'
import { applyStageEffectCommand, removeStageEffectsByTile } from '@entities/event'
import {
  createFadeOverlayState,
  buildActorMap,
  createActorState,
  createItemAboveActorEffect,
  createItemAtTileEffect,
  createNoticeIconForItemId,
  enqueuePlaybackNotice,
  getFadeDurationMsFromSpeed,
  getActorByName,
  getActorDefaultFrameState,
  isFarmerActor,
  resolveFadeOverlayAlpha,
  applyEventFarmerStateSeeds,
  normalizeEventItemId,
  normalizeStageMapName,
  parseBoolean,
  parseNumber,
  parsePoint,
  parseRgbColorFromArgs,
  parseSpringObjectIndexFromItemId,
  resolveCameraFocus,
  resolveActorFocusTile,
  toActorKey,
  createInitialPlaybackState,
  type EventActorState,
  type PlaybackLogEntry,
  type PlaybackNoticeTone,
  type PlaybackState,
} from '@entities/event'

type PlaybackContext = {
  objectDrinkIndex?: Record<string, boolean>
}

function updateFarmerRenderState(actor: EventActorState, mutate: NonNullable<EventActorState['farmerRenderState']>) {
  return {
    ...actor,
    farmerRenderState: mutate,
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
  if (!actor) {
    return actors
  }

  const visualState = actor.farmerRenderState ? inferFarmerFrameVisualState(frame) : null
  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      frame,
      directionalFlip: false,
      animation: null,
      movement: null,
      farmerRenderState:
        actor.farmerRenderState && visualState
          ? {
              ...actor.farmerRenderState,
              pauseForSingleAnimation: false,
              usingTool: visualState.usingTool,
              toolKind: visualState.toolKind,
              fishingRodIsCasting: visualState.fishingRodIsCasting,
              slingshotAimRadians: visualState.slingshotAimRadians,
              slingshotBackArmDistance: visualState.slingshotBackArmDistance,
            }
          : actor.farmerRenderState,
    },
  }
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

function applyFarmerEyesCommand(actors: Record<string, EventActorState>, command: EventCommand) {
  const farmer = getActorByName(actors, 'farmer')
  const eyes = Number.parseInt(command.args[1] ?? '', 10)
  const blinkTimerMs = Number.parseInt(command.args[2] ?? '', 10)
  if (!farmer?.farmerRenderState || !Number.isFinite(eyes) || !Number.isFinite(blinkTimerMs)) {
    return actors
  }

  return {
    ...actors,
    [toActorKey(farmer.actorName)]: updateFarmerRenderState(farmer, {
      ...farmer.farmerRenderState,
      currentEyes: eyes,
      blinkTimerMs,
      eyesSetAtMs: performance.now(),
    }),
  }
}

function applyFarmerSwimmingCommand(state: PlaybackState, actorName: string | undefined, swimming: boolean) {
  if (!actorName) {
    return state.actors
  }

  const actor = getActorByName(state.actors, actorName)
  if (!actor?.farmerRenderState) {
    return state.actors
  }

  return {
    ...state.actors,
    [toActorKey(actor.actorName)]: updateFarmerRenderState(actor, {
      ...actor.farmerRenderState,
      swimming,
      bathingClothes: swimming ? true : state.currentMapName === 'BathHouse_Pool',
    }),
  }
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
  const animationFrames = buildEventAnimationFrames(frames, frameDurationMs, command.animationFlip ?? false)
  if (!actorName || animationFrames.length === 0 || frameDurationMs <= 0) {
    return actors
  }

  const actor = getActorByName(actors, actorName)
  if (!actor) {
    return actors
  }

  const firstFrame = animationFrames[0] ?? null
  const visualState = actor.farmerRenderState ? inferFarmerAnimationFramesVisualState(animationFrames.map((frame) => frame.frame)) : null
  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      frame: firstFrame?.frame ?? actor.frame,
      directionalFlip: false,
      movement: null,
      animation: {
        frames: animationFrames,
        loop: command.animationLoop ?? false,
        startedAtMs: performance.now(),
        pauseForSingleAnimation: isFarmerActor(actor.actorName),
      },
      farmerRenderState: actor.farmerRenderState
        ? {
            ...actor.farmerRenderState,
            pauseForSingleAnimation: true,
            usingTool: visualState?.usingTool ?? false,
            toolKind: visualState?.toolKind ?? ('none' as const),
            fishingRodIsCasting: visualState?.fishingRodIsCasting ?? true,
            armOffset: firstFrame?.armOffset ?? actor.farmerRenderState.armOffset,
            slingshotAimRadians: visualState?.slingshotAimRadians ?? null,
            slingshotBackArmDistance: visualState?.slingshotBackArmDistance ?? 8,
          }
        : null,
    },
  }
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
    command.frame == null
      ? getActorDefaultFrameState(actor.actorName, actor.facingDirection)
      : { frame: command.frame, directionalFlip: false }
  return {
    ...actors,
    [toActorKey(actorName)]: {
      ...actor,
      frame: fallbackFrameState.frame,
      directionalFlip: fallbackFrameState.directionalFlip,
      animation: null,
      movement: null,
      farmerRenderState: actor.farmerRenderState
        ? {
            ...actor.farmerRenderState,
            pauseForSingleAnimation: false,
            usingTool: false,
            toolKind: 'none' as const,
            fishingRodIsCasting: true,
            armOffset: 6,
            slingshotAimRadians: null,
            slingshotBackArmDistance: 8,
          }
        : null,
    },
  }
}

function applyFarmerSingleAnimationCommand(actors: Record<string, EventActorState>, animationId: number) {
  const farmer = getActorByName(actors, 'farmer')
  if (!farmer?.farmerRenderState) {
    return actors
  }

  const animationFrames = buildFarmerSingleAnimationFrames(animationId, farmer.facingDirection)
  if (!animationFrames?.length) {
    return actors
  }

  const firstFrame = animationFrames[0] ?? null
  const visualState = inferFarmerSingleAnimationVisualState(animationId)
  return {
    ...actors,
    [toActorKey(farmer.actorName)]: {
      ...farmer,
      frame: firstFrame?.frame ?? farmer.frame,
      directionalFlip: false,
      movement: null,
      animation: {
        frames: animationFrames,
        loop: false,
        startedAtMs: performance.now(),
        pauseForSingleAnimation: true,
      },
      farmerRenderState: {
        ...farmer.farmerRenderState,
        pauseForSingleAnimation: true,
        usingTool: visualState.usingTool,
        toolKind: visualState.toolKind,
        fishingRodIsCasting: visualState.fishingRodIsCasting,
        armOffset: firstFrame?.armOffset ?? farmer.farmerRenderState.armOffset,
        slingshotAimRadians: visualState.slingshotAimRadians,
        slingshotBackArmDistance: visualState.slingshotBackArmDistance,
      },
    },
  }
}

function applyFarmerEatCommand(
  actors: Record<string, EventActorState>,
  rawItemId: string | undefined,
  objectDrinkIndex: Record<string, boolean>,
) {
  const farmer = getActorByName(actors, 'farmer')
  if (!farmer?.farmerRenderState) {
    return actors
  }

  const itemIndex = parseSpringObjectIndexFromItemId(rawItemId)
  const isDrink = itemIndex != null ? (objectDrinkIndex[String(itemIndex)] ?? false) : false
  const animationFrames = buildFarmerSingleAnimationFrames(getFarmerEatAnimationId(isDrink), 2)
  if (!animationFrames?.length) {
    return actors
  }

  const firstFrame = animationFrames[0] ?? null
  return {
    ...actors,
    [toActorKey(farmer.actorName)]: {
      ...farmer,
      facingDirection: 2,
      frame: firstFrame?.frame ?? farmer.frame,
      directionalFlip: false,
      movement: null,
      animation: {
        frames: animationFrames,
        loop: false,
        startedAtMs: performance.now(),
        pauseForSingleAnimation: true,
      },
      farmerRenderState: {
        ...farmer.farmerRenderState,
        pauseForSingleAnimation: true,
        usingTool: false,
        toolKind: 'none' as const,
        fishingRodIsCasting: true,
        armOffset: firstFrame?.armOffset ?? farmer.farmerRenderState.armOffset,
        slingshotAimRadians: null,
        slingshotBackArmDistance: 8,
      },
    },
  }
}

function resolveViewportFocus(command: EventCommand, actors: Record<string, EventActorState>, currentFocus: PlaybackState['focusTile']) {
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
  const eventActors = applyEventFarmerStateSeeds(event, buildActorMap(event))
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
  copy: EventStageCopy,
  playbackContext: PlaybackContext = {},
): PlaybackState {
  const initialState = createInitialPlaybackState(event, initialMapName)
  if (!event || entryId === EVENT_SETUP_ENTRY_ID) {
    return initialState
  }

  let state = initialState
  for (let guard = 0; guard < 800; guard += 1) {
    const rawNextState = continuePlayback(state, eventIndex, copy, playbackContext)
    const nextState = {
      ...rawNextState,
      waitingMs: null,
      waitingStartedAtMs: null,
      blockingMovement: false,
      actors: Object.fromEntries(
        Object.entries(rawNextState.actors).map(([actorKey, actor]) => [actorKey, actor.movement ? { ...actor, movement: null } : actor]),
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

function buildCommandEntry(
  command: EventCommand,
  suffix: string,
  detail = command.detail || command.raw,
  title = command.title,
): PlaybackLogEntry {
  return {
    id: `${command.id}:${suffix}`,
    tone: 'command',
    title,
    detail,
  }
}

function advanceCommandPlayback(
  state: PlaybackState,
  command: EventCommand,
  options: {
    entrySuffix?: string
    entryDetail?: string
    entryTitle?: string
    waitingMs?: number | null
    blockingMovement?: boolean
    ended?: boolean
  } = {},
): PlaybackState {
  const waitingMs = options.waitingMs ?? null
  return {
    ...state,
    pointer: state.pointer + 1,
    currentEntry: buildCommandEntry(
      command,
      options.entrySuffix ?? 'command',
      options.entryDetail ?? (command.detail || command.raw),
      options.entryTitle ?? command.title,
    ),
    activeDialogue: null,
    waitingMs,
    waitingStartedAtMs: waitingMs != null ? performance.now() : null,
    blockingMovement: options.blockingMovement ?? false,
    ended: options.ended ?? false,
    pendingChoice: null,
  }
}

function continuePlayback(
  state: PlaybackState,
  eventIndex: Record<string, EventScript>,
  copy: EventStageCopy,
  playbackContext: PlaybackContext = {},
): PlaybackState {
  if (state.waitingMs != null) {
    return state
  }

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
          waitingStartedAtMs: performance.now(),
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'speak':
      case 'splitSpeak': {
        const actorName = command.actorName ?? command.title
        const pages = command.dialoguePages?.length
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
          waitingStartedAtMs: command.args[3] === 'true' ? null : performance.now(),
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
      case 'eyes':
        return {
          ...base,
          actors: applyFarmerEyesCommand(nextState.actors, command),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:eyes`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'swimming':
        return {
          ...base,
          actors: applyFarmerSwimmingCommand(nextState, command.args[1], true),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:swimming`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      case 'stopSwimming':
        return {
          ...base,
          actors: applyFarmerSwimmingCommand(nextState, command.args[1], false),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:stopSwimming`, tone: 'command', title: command.title, detail: command.detail },
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
      case 'farmerAnimation': {
        const animationId = Number.parseInt(command.args[1] ?? '', 10)
        return {
          ...base,
          actors: Number.isFinite(animationId) ? applyFarmerSingleAnimationCommand(nextState.actors, animationId) : nextState.actors,
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:farmerAnimation`, tone: 'command', title: command.title, detail: command.detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
      }
      case 'farmerEat': {
        const detail = normalizeEventItemId(command.args[1]) ?? command.detail
        return {
          ...base,
          actors: applyFarmerEatCommand(nextState.actors, command.args[1], playbackContext.objectDrinkIndex ?? {}),
          pointer: nextState.pointer + 1,
          currentEntry: { id: `${command.id}:farmerEat`, tone: 'command', title: command.title, detail },
          activeDialogue: null,
          waitingMs: null,
          blockingMovement: false,
          ended: false,
          pendingChoice: null,
        }
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
      case 'playMusic': {
        const cue = command.args[1] && command.args[1] !== 'none' ? command.args[1] : null
        const nextBase = {
          ...base,
          activeMusicCue: cue,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: cue ? copy.cueLabel(cue) : copy.musicStopped,
            tone: 'info',
            durationMs: 2600,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'music', entryDetail: cue ?? command.detail })
      }
      case 'stopMusic': {
        const nextBase = {
          ...base,
          activeMusicCue: null,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: copy.stopCurrentEventMusic,
            tone: 'info',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'music', entryDetail: copy.musicStopped })
      }
      case 'playSound': {
        const cue = command.args[1] && command.args[1] !== 'none' ? command.args[1] : null
        const nextBase = {
          ...base,
          activeSoundCue: cue,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: cue ? copy.cueLabel(cue) : command.detail,
            tone: 'info',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'sound', entryDetail: cue ?? command.detail })
      }
      case 'stopSound': {
        const cue = command.args[1] ?? null
        const nextBase = {
          ...base,
          activeSoundCue: cue ? (base.activeSoundCue === cue ? null : base.activeSoundCue) : null,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: cue ? copy.stopCueLabel(cue) : copy.stopTrackedSound,
            tone: 'info',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'sound', entryDetail: cue ?? command.detail })
      }
      case 'ambientLight': {
        const ambientOverlayColor = parseRgbColorFromArgs(command.args, 1)
        const nextBase = {
          ...base,
          ambientOverlayColor,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: ambientOverlayColor ?? command.detail,
            tone: 'visual',
            durationMs: 2400,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'ambient', entryDetail: ambientOverlayColor ?? command.detail })
      }
      case 'fade': {
        const nowMs = performance.now()
        if (command.args[1] === 'unfade') {
          const nextBase = {
            ...base,
            fadeOverlay: null,
            notices: enqueuePlaybackNotice(base, {
              title: command.title,
              detail: copy.fadeCleared,
              tone: 'visual',
              durationMs: 2200,
            }),
          }
          return advanceCommandPlayback(nextBase, command, {
            entrySuffix: 'fade',
            entryDetail: copy.clear,
          })
        }

        const currentFadeAlpha = resolveFadeOverlayAlpha(base.fadeOverlay, nowMs)
        const fadeDurationMs = getFadeDurationMsFromSpeed(0.02, currentFadeAlpha, 1)
        const holdBlack = command.args.length > 1
        const nextBase = {
          ...base,
          fadeOverlay: createFadeOverlayState({
            color: '#000000',
            startAlpha: currentFadeAlpha,
            targetAlpha: 1,
            startedAtMs: nowMs,
            durationMs: fadeDurationMs,
            nextTargetAlpha: holdBlack ? null : 0,
            nextDurationMs: holdBlack ? null : fadeDurationMs,
          }),
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: copy.screenFadeToBlack,
            tone: 'visual',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, {
          entrySuffix: 'fade',
          entryDetail: command.detail || copy.screenFadeToBlack,
          waitingMs: fadeDurationMs,
        })
      }
      case 'globalFade': {
        const nowMs = performance.now()
        const fadeSpeed = Math.max(0.0001, parseNumber(command.args[1]) ?? 0.007)
        const continueEventDuringFade = parseBoolean(command.args[2], false)
        const currentFadeAlpha = resolveFadeOverlayAlpha(base.fadeOverlay, nowMs)
        const fadeDurationMs = getFadeDurationMsFromSpeed(fadeSpeed, currentFadeAlpha, 1)
        const nextBase = {
          ...base,
          fadeOverlay: createFadeOverlayState({
            color: '#000000',
            startAlpha: currentFadeAlpha,
            targetAlpha: 1,
            startedAtMs: nowMs,
            durationMs: fadeDurationMs,
          }),
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: command.detail || copy.globalFadeToBlack,
            tone: 'visual',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, {
          entrySuffix: 'globalFade',
          waitingMs: continueEventDuringFade ? null : fadeDurationMs,
        })
      }
      case 'globalFadeToClear': {
        const nowMs = performance.now()
        const fadeSpeed = Math.max(0.0001, parseNumber(command.args[1]) ?? 0.007)
        const continueEventDuringFade = parseBoolean(command.args[2], false)
        const currentFadeAlpha = resolveFadeOverlayAlpha(base.fadeOverlay, nowMs)
        const fadeDurationMs = getFadeDurationMsFromSpeed(fadeSpeed, currentFadeAlpha, 0)
        const nextBase = {
          ...base,
          fadeOverlay: createFadeOverlayState({
            color: '#000000',
            startAlpha: currentFadeAlpha,
            targetAlpha: 0,
            startedAtMs: nowMs,
            durationMs: fadeDurationMs,
          }),
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: copy.globalFadeCleared,
            tone: 'visual',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, {
          entrySuffix: 'globalFadeClear',
          entryDetail: command.detail || copy.clear,
          waitingMs: continueEventDuringFade ? null : fadeDurationMs,
        })
      }
      case 'screenFlash': {
        const flashAlpha = Math.max(0, Math.min(1, parseNumber(command.args[1]) ?? 1))
        const nextBase = {
          ...base,
          flashOverlay: { color: '#ffffff', alpha: flashAlpha, startedAtMs: performance.now(), durationMs: 320 },
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: copy.flashAlphaLabel(flashAlpha.toFixed(2)),
            tone: 'visual',
            durationMs: 1400,
          }),
        }
        return advanceCommandPlayback(nextBase, command, {
          entrySuffix: 'flash',
          entryDetail: copy.flashAlphaLabel(flashAlpha.toFixed(2)),
        })
      }
      case 'glow': {
        const glowColor = parseRgbColorFromArgs(command.args, 1) ?? '#ffffff'
        const hold = parseBoolean(command.args[4], false)
        const nextBase = {
          ...base,
          flashOverlay: { color: glowColor, alpha: hold ? 0.42 : 0.3, startedAtMs: performance.now(), durationMs: hold ? 1800 : 720 },
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: `${glowColor}${hold ? ' hold' : ''}`,
            tone: 'visual',
            durationMs: 1800,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'glow', entryDetail: glowColor })
      }
      case 'stopGlowing': {
        const nextBase = {
          ...base,
          flashOverlay: null,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: 'Screen glow cleared',
            tone: 'visual',
            durationMs: 1600,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'glowStop', entryDetail: 'clear' })
      }
      case 'addItem':
      case 'removeItem': {
        const itemId = normalizeEventItemId(command.args[1])
        const count = Math.max(1, Number.parseInt(command.args[2] ?? '1', 10) || 1)
        const isGain = command.command === 'addItem'
        const detail = `${isGain ? '+' : '-'}${count} ${itemId ?? 'item'}`
        const nextBase = {
          ...base,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail,
            tone: isGain ? 'gain' : 'loss',
            durationMs: 3200,
            icon: createNoticeIconForItemId(itemId ?? undefined),
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'inventory', entryDetail: detail })
      }
      case 'money': {
        const amount = Number.parseInt(command.args[1] ?? '0', 10) || 0
        const detail = `${amount >= 0 ? '+' : ''}${amount}g`
        const nextBase = {
          ...base,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail,
            tone: amount >= 0 ? 'gain' : 'loss',
            durationMs: 2600,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'money', entryDetail: detail })
      }
      case 'friendship':
      case 'addQuest':
      case 'removeQuest':
      case 'addSpecialOrder':
      case 'removeSpecialOrder':
      case 'addConversationTopic':
      case 'addCookingRecipe':
      case 'addCraftingRecipe':
      case 'mail':
      case 'mailToday':
      case 'mailReceived':
      case 'eventSeen':
      case 'questionAnswered':
      case 'rustyKey':
      case 'dump': {
        const tone: PlaybackNoticeTone = command.command.startsWith('remove') || command.command === 'dump' ? 'loss' : 'info'
        const nextBase = {
          ...base,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: command.detail || command.raw,
            tone,
            durationMs: 2800,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'state' })
      }
      case 'itemAboveHead': {
        const stageEffect = createItemAboveActorEffect(command.id, 'itemAboveHead', nextState.actors, 'farmer', command.args[1])
        const detail = normalizeEventItemId(command.args[1]) ?? command.detail
        const nextBase = {
          ...base,
          stageEffects: stageEffect ? [...nextState.stageEffects, stageEffect] : nextState.stageEffects,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail,
            tone: 'visual',
            durationMs: 2400,
            icon: createNoticeIconForItemId(command.args[1]),
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'itemAboveHead', entryDetail: detail })
      }
      case 'addObject': {
        const point = parsePoint(command.args[1], command.args[2])
        const stageEffect = point ? createItemAtTileEffect(command.id, 'addObject', point.tileX, point.tileY, command.args[3]) : null
        const detail = point ? `${normalizeEventItemId(command.args[3]) ?? 'object'} @ (${point.tileX}, ${point.tileY})` : command.detail
        const nextBase = {
          ...base,
          stageEffects: stageEffect ? [...nextState.stageEffects, stageEffect] : nextState.stageEffects,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail,
            tone: 'visual',
            durationMs: 2600,
            icon: createNoticeIconForItemId(command.args[3]),
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'addObject', entryDetail: detail })
      }
      case 'removeObject': {
        const point = parsePoint(command.args[1], command.args[2])
        const detail = point ? `(${point.tileX}, ${point.tileY})` : command.detail
        const nextBase = {
          ...base,
          stageEffects: point ? removeStageEffectsByTile(nextState.stageEffects, point.tileX, point.tileY) : nextState.stageEffects,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail,
            tone: 'visual',
            durationMs: 2200,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'removeObject', entryDetail: detail })
      }
      case 'addTemporaryActor': {
        const actorName = command.args[1]
        const tileX = parseNumber(command.args[4])
        const tileY = parseNumber(command.args[5])
        const facingDirection = Number.parseInt(command.args[6] ?? '', 10)
        const breather = parseBoolean(command.args[7], true)
        const nextActors =
          actorName && tileX != null && tileY != null && Number.isFinite(facingDirection)
            ? {
                ...nextState.actors,
                [toActorKey(command.args[9] ?? actorName)]: createActorState({
                  id: `${command.id}:tempActor`,
                  actorName: command.args[9] ?? actorName,
                  tileX,
                  tileY,
                  facingDirection,
                  breather,
                }),
              }
            : nextState.actors
        const nextBase = {
          ...base,
          actors: nextActors,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: actorName ? `${command.args[9] ?? actorName} @ (${tileX ?? '?'}, ${tileY ?? '?'})` : command.detail,
            tone: 'visual',
            durationMs: 2600,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'tempActor' })
      }
      case 'shake': {
        const actorName = command.args[1]
        const durationMs = Number.parseInt(command.args[2] ?? '', 10)
        const actor = actorName ? getActorByName(nextState.actors, actorName) : null
        const nextActors =
          actor && Number.isFinite(durationMs)
            ? {
                ...nextState.actors,
                [toActorKey(actor.actorName)]: {
                  ...actor,
                  shakeStartedAtMs: performance.now(),
                  shakeDurationMs: Math.max(0, durationMs),
                },
              }
            : nextState.actors
        const nextBase = {
          ...base,
          actors: nextActors,
          notices: enqueuePlaybackNotice(base, {
            title: command.title,
            detail: actorName && Number.isFinite(durationMs) ? `${actorName} ${durationMs}ms` : command.detail || command.raw,
            tone: 'visual',
            durationMs: 1800,
          }),
        }
        return advanceCommandPlayback(nextBase, command, { entrySuffix: 'shake' })
      }
      case 'waitForAllStationary':
        if (Object.values(nextState.actors).some((actor) => actor.movement)) {
          return {
            ...base,
            currentEntry: {
              id: `${command.id}:waitForAllStationary`,
              tone: 'system',
              title: command.title,
              detail: command.detail || 'waiting for movement',
            },
            activeDialogue: null,
            waitingMs: 80,
            waitingStartedAtMs: performance.now(),
            blockingMovement: true,
            ended: false,
            pendingChoice: null,
          }
        }
        return advanceCommandPlayback(base, command, { entrySuffix: 'waitForAllStationary', entryDetail: 'all stationary' })
      case 'waitForOtherPlayers':
        return advanceCommandPlayback(
          {
            ...base,
            notices: enqueuePlaybackNotice(base, {
              title: command.title,
              detail: command.detail || 'Single-user preview advances immediately',
              tone: 'system',
              durationMs: 2200,
            }),
          },
          command,
          { entrySuffix: 'waitForOtherPlayers', entryDetail: 'single-user preview' },
        )
      case 'beginSimultaneousCommand':
      case 'endSimultaneousCommand':
      case 'skippable':
      case 'setSkipActions':
      case 'ignoreEventTileOffset':
      case 'ignoreCollisions':
      case 'ignoreMovementAnimation':
      case 'playerControl':
      case 'tutorialMenu':
      case 'animalNaming':
      case 'catQuestion':
      case 'cave':
      case 'updateMinigame':
      case 'broadcastEvent':
      case 'loadActors':
      case 'replaceWithClone':
      case 'removeTile':
      case 'changeMapTile':
      case 'setRunning':
      case 'stopRunning':
      case 'emote':
      case 'jump':
      case 'advancedMove':
      case 'speed':
      case 'stopAdvancedMoves':
      case 'tossConcession':
      case 'awardFestivalPrize':
      case 'action':
      case 'doAction':
      case 'textAboveHead':
      case 'changeName':
      case 'translateName':
      case 'changeYSourceRectOffset':
      case 'extendSourceRect':
      case 'makeInvisible':
      case 'addBigProp':
      case 'addFloorProp':
      case 'addProp':
      case 'addLantern':
      case 'proceedPosition':
      case 'resetVariable':
      case 'startJittering':
      case 'stopJittering':
      case 'hideShadow':
      case 'cutscene':
      case 'halt':
      case 'minedeath':
      case 'hospitaldeath':
      case 'characterSelect':
      case 'elliotbooktalk':
      case 'grandpaCandles':
      case 'grandpaEvaluation':
      case 'grandpaEvaluation2':
      case 'warpFarmers':
        return advanceCommandPlayback(
          {
            ...base,
            notices: enqueuePlaybackNotice(base, {
              title: command.title,
              detail: command.detail || command.raw,
              tone: 'visual',
              durationMs: 2600,
            }),
          },
          command,
          { entrySuffix: 'fallback' },
        )
      case 'fork': {
        const targetEvent = command.targetEventKey && !command.isTranslationKey ? eventIndex[command.targetEventKey] : undefined
        if (targetEvent && shouldTakeFork(command, nextState.forkFlag)) {
          nextState = {
            ...nextState,
            ...mergeEventScene(nextState, targetEvent),
            currentEntry: {
              id: `${command.id}:fork`,
              tone: 'system',
              title: command.title,
              detail: command.targetEventKey ?? command.detail,
            },
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
            currentEntry: {
              id: `${command.id}:switch`,
              tone: 'system',
              title: command.title,
              detail: command.targetEventKey ?? command.detail,
            },
            currentCommandId: command.id,
            activeDialogue: null,
            waitingMs: null,
            blockingMovement: false,
          }
          continue
        }

        nextState = { ...nextState, pointer: nextState.pointer + 1 }
        break
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
        return advanceCommandPlayback(
          {
            ...base,
            notices: enqueuePlaybackNotice(base, {
              title: command.title,
              detail: command.detail || command.raw,
              tone: 'system',
              durationMs: 2200,
            }),
          },
          command,
        )
    }
  }

  return nextState
}

function resolveChoice(
  state: PlaybackState,
  eventIndex: Record<string, EventScript>,
  choiceIndex: number,
  copy: EventStageCopy,
  playbackContext: PlaybackContext = {},
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

  return continuePlayback(
    {
      ...state,
      commands,
      pointer: state.pointer + 1,
      forkFlag,
      activeDialogue: null,
      pendingChoice: null,
      waitingMs: null,
      waitingStartedAtMs: null,
      ended: false,
    },
    eventIndex,
    copy,
    playbackContext,
  )
}

export { advanceCommandPlayback, continuePlayback, resolveChoice, seekPlaybackToEntry }

export type { PlaybackContext }
