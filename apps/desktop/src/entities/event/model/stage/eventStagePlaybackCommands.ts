import type { EventCommand } from '../types'
import {
  buildEventAnimationFrames,
  buildFarmerSingleAnimationFrames,
  getFarmerEatAnimationId,
  inferFarmerAnimationFramesVisualState,
  inferFarmerFrameVisualState,
  inferFarmerSingleAnimationVisualState,
} from './farmerEventAnimationData'
import {
  getActorByName,
  getActorDefaultFrameState,
  isFarmerActor,
  parsePoint,
  parseSpringObjectIndexFromItemId,
  toActorKey,
  type EventActorState,
  type PlaybackState,
} from './eventStageShared'

function updateFarmerRenderState(actor: EventActorState, mutate: NonNullable<EventActorState['farmerRenderState']>) {
  return {
    ...actor,
    farmerRenderState: mutate,
  }
}

export function applyMoveCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyWarpCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyFaceDirectionCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyShowFrameCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyPositionOffsetCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyFarmerEyesCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyFarmerSwimmingCommand(state: PlaybackState, actorName: string | undefined, swimming: boolean) {
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

export function applyChangePortraitCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyChangeSpriteCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyAnimateCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyStopAnimationCommand(actors: Record<string, EventActorState>, command: EventCommand) {
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

export function applyFarmerSingleAnimationCommand(actors: Record<string, EventActorState>, animationId: number) {
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

export function applyFarmerEatCommand(
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
