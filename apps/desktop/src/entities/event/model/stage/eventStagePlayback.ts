import { parseEventCommand, EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventStageCopy } from '@locales/api'
import type { EventCommand, EventDialoguePage, EventScript } from '@entities/event'
import {
  applyAnimateCommand,
  applyChangePortraitCommand,
  applyChangeSpriteCommand,
  applyFaceDirectionCommand,
  applyFarmerEatCommand,
  applyFarmerEyesCommand,
  applyFarmerSingleAnimationCommand,
  applyFarmerSwimmingCommand,
  applyMoveCommand,
  applyPositionOffsetCommand,
  applyShowFrameCommand,
  applyStopAnimationCommand,
  applyWarpCommand,
} from './eventStagePlaybackCommands'
import {
  applyEventFarmerStateSeeds,
  applyStageEffectCommand,
  buildActorMap,
  createFadeOverlayState,
  createActorState,
  createInitialPlaybackState,
  createItemAboveActorEffect,
  createItemAtTileEffect,
  createNoticeIconForItemId,
  enqueuePlaybackNotice,
  getActorByName,
  getFadeDurationMsFromSpeed,
  normalizeEventItemId,
  normalizeStageMapName,
  parseBoolean,
  parseNumber,
  parsePoint,
  parseRgbColorFromArgs,
  removeStageEffectsByTile,
  resolveActorFocusTile,
  resolveCameraFocus,
  resolveFadeOverlayAlpha,
  toActorKey,
  type EventActorState,
  type PlaybackLogEntry,
  type PlaybackNoticeTone,
  type PlaybackState,
} from '@entities/event'

type PlaybackContext = {
  objectDrinkIndex?: Record<string, boolean>
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
        if (command.embeddedQuestion) {
          return {
            ...base,
            currentEntry: {
              id: `${command.id}:question`,
              tone: 'choice',
              title: command.title,
              detail: command.embeddedQuestion.prompt,
            },
            activeDialogue: null,
            pendingChoice: { command, question: command.embeddedQuestion.prompt, choices: command.embeddedQuestion.choices },
            waitingMs: null,
            blockingMovement: false,
            ended: false,
          }
        }

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
            symbol: 'music',
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
            symbol: 'stop',
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
            symbol: 'sound',
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
            symbol: 'stop',
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
