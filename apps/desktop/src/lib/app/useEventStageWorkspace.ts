import { useEffect, useMemo, useState } from 'react'
import type { ViewportWorldPoint } from '../../components/MapViewport'
import { loadMapAsset, loadTextAsset, type GameDirectoryInfo } from '../desktop'
import { parseTmxMap } from '../maps/tmx'
import type { MapDocument } from '../maps/types'
import { EVENT_SETUP_ENTRY_ID } from '../events/timeline'
import type { EventScript, ParsedEventAsset } from '../events/types'
import type { EventStageCopy, ViewportLabels } from '../editor-shell'
import {
  CHARACTER_DATA_PATH,
  EVENT_STAGE_INITIAL_ZOOM,
  OBJECT_DATA_PATH,
  advanceFadeOverlayState,
  createInitialPlaybackState,
  getActorByName,
  getActorDefaultFrameState,
  isFadeOverlayAnimating,
  isFarmerActor,
  isPathsLayerName,
  normalizeActorName,
  normalizeStageMapName,
  prunePlaybackNotices,
  resolveFadeOverlayAlpha,
  toActorKey,
  type ActorAssetRequest,
  type ActorAssetState,
  type CharacterTextureIndex,
  type EffectAssetState,
  type ObjectDataEntry,
  type PlaybackState,
} from './eventStageShared'
import { deriveMapDrivenFarmerBedState } from './eventStageFarmerState'
import { continuePlayback, resolveChoice, seekPlaybackToEntry } from './eventStagePlayback'
import {
  areAssetMapsEqual,
  buildCharacterTextureIndex,
  getAnimatedFrame,
  getPortraitFrameBounds,
  getTextureCandidates,
  resolveActorAssets,
  resolveEffectAsset,
} from './eventStageAssets'
import type { PlayerAppearanceProfile } from './playerAppearance'

type UseEventStageWorkspaceOptions = {
  copy: EventStageCopy
  directoryInfo: GameDirectoryInfo | null
  viewportLabels: ViewportLabels
  parsedEventAsset: ParsedEventAsset | null
  selectedEvent: EventScript | null
  playerAppearanceProfile: PlayerAppearanceProfile | null
  timelineJumpRequestId: string | null
  onTimelineJumpHandled: () => void
  onSelectTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
}

export function useEventStageWorkspace({
  copy,
  directoryInfo,
  viewportLabels,
  parsedEventAsset,
  selectedEvent,
  playerAppearanceProfile,
  timelineJumpRequestId,
  onTimelineJumpHandled,
  onSelectTimelineEntry,
  onPlaybackCommandChange,
}: UseEventStageWorkspaceOptions) {
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
  const [eventObjectDrinkIndex, setEventObjectDrinkIndex] = useState<Record<string, boolean>>({})
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
      setEventObjectDrinkIndex({})
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const objectDataAsset = await loadTextAsset(directoryInfo.rootPath, OBJECT_DATA_PATH)
        const parsed = JSON.parse(objectDataAsset.content) as Record<string, ObjectDataEntry>
        if (!cancelled) {
          setEventObjectDrinkIndex(
            Object.fromEntries(Object.entries(parsed).map(([itemId, entry]) => [itemId, Boolean(entry?.IsDrink)])),
          )
        }
      } catch {
        if (!cancelled) {
          setEventObjectDrinkIndex({})
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
      setMapMessage(copy.stageMissing)
      return
    }

    if (!playbackState.currentMapName) {
      setMapDocument(null)
      setMapMessage('')
      return
    }

    const mapPath = `${directoryInfo.unpackedMapsPath}\\${playbackState.currentMapName}.tmx`
    let cancelled = false
    setMapMessage(copy.stageWaiting)

    void (async () => {
      try {
        const asset = await loadMapAsset(directoryInfo.rootPath, mapPath)
        if (cancelled) {
          return
        }
        if (asset.format !== 'tmx') {
          throw new Error(copy.stageMapUnsupported)
        }

        setMapDocument(parseTmxMap(asset.absolutePath, asset.relativePath, asset.content))
        setMapMessage(asset.relativePath)
      } catch (error) {
        if (!cancelled) {
          setMapDocument(null)
          setMapMessage(`${copy.stageFailed}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    directoryInfo?.rootPath,
    directoryInfo?.unpackedMapsPath,
    copy.stageFailed,
    copy.stageMapUnsupported,
    copy.stageMissing,
    copy.stageWaiting,
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
    setPlaybackState(
      seekPlaybackToEntry(selectedEvent, parsedEventAsset?.eventIndex ?? {}, timelineJumpRequestId, initialMapName, copy, {
        objectDrinkIndex: eventObjectDrinkIndex,
      }),
    )
    onTimelineJumpHandled()
  }, [copy, eventObjectDrinkIndex, initialMapName, onTimelineJumpHandled, parsedEventAsset?.eventIndex, selectedEvent, timelineJumpRequestId])

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
    const hasAnimatedHud =
      playbackState.notices.length > 0 ||
      playbackState.flashOverlay != null ||
      isFadeOverlayAnimating(playbackState.fadeOverlay, performance.now())
    if (!hasAnimatedActors && !hasAnimatedEffects && !hasAnimatedHud) {
      return
    }

    let frameId = 0
    const tick = () => {
      setAnimationNowMs(performance.now())
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [playbackState.actors, playbackState.flashOverlay, playbackState.notices.length, playbackState.stageEffects])

  useEffect(() => {
    if (playbackState.notices.length === 0 && playbackState.flashOverlay == null && playbackState.fadeOverlay == null) {
      return
    }

    setPlaybackState((current) => {
      const nowMs = performance.now()
      const notices = prunePlaybackNotices(current.notices, nowMs)
      const flashOverlay =
        current.flashOverlay && nowMs - current.flashOverlay.startedAtMs >= current.flashOverlay.durationMs
          ? null
          : current.flashOverlay
      const fadeOverlay = advanceFadeOverlayState(current.fadeOverlay, nowMs)

      if (notices === current.notices && flashOverlay === current.flashOverlay && fadeOverlay === current.fadeOverlay) {
        return current
      }

      if (notices.length === current.notices.length && flashOverlay === current.flashOverlay && fadeOverlay === current.fadeOverlay) {
        return current
      }

      return {
        ...current,
        notices,
        flashOverlay,
        fadeOverlay,
      }
    })
  }, [animationNowMs, playbackState.fadeOverlay, playbackState.flashOverlay, playbackState.notices])

  useEffect(() => {
    setPlaybackState((current) => {
      let changed = false
      const nextActors = { ...current.actors }

      for (const [actorKey, actor] of Object.entries(current.actors)) {
        if (!actor.farmerRenderState) {
          continue
        }

        const derivedBedState = deriveMapDrivenFarmerBedState(mapDocument, actor)
        if (
          actor.farmerRenderState.isInBed === derivedBedState.isInBed &&
          actor.farmerRenderState.timeWentToBed === derivedBedState.timeWentToBed
        ) {
          continue
        }

        nextActors[actorKey] = {
          ...actor,
          farmerRenderState: {
            ...actor.farmerRenderState,
            isInBed: derivedBedState.isInBed,
            timeWentToBed: derivedBedState.timeWentToBed,
          },
        }
        changed = true
      }

      return changed ? { ...current, actors: nextActors } : current
    })
  }, [mapDocument, playbackState.currentMapName, playbackState.actors])

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

        const finalFrame = actor.animation.frames[actor.animation.frames.length - 1]?.frame ?? actor.frame
        nextActors[actorKey] = {
          ...actor,
          frame: finalFrame,
          animation: null,
          farmerRenderState: actor.farmerRenderState
            ? {
                ...actor.farmerRenderState,
                pauseForSingleAnimation: false,
                usingTool: false,
                toolKind: 'none' as const,
                armOffset: 6,
                fishingRodIsCasting: true,
                slingshotAimRadians: null,
                slingshotBackArmDistance: 8,
              }
            : null,
        }
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
        nextActors[actorKey] = {
          ...actor,
          movement: null,
          frame: frameState.frame,
          directionalFlip: frameState.directionalFlip,
          farmerRenderState: actor.farmerRenderState
            ? {
                ...actor.farmerRenderState,
                lastMovementEndedAtMs: animationNowMs,
              }
            : null,
        }
        changed = true
      }

      if (!changed) {
        return current
      }

      const stillMoving = Object.values(nextActors).some((actor) => actor.movement)
      const nextState = { ...current, actors: nextActors, blockingMovement: stillMoving ? current.blockingMovement : false }

      if (!stillMoving && current.blockingMovement && autoPlay && !current.pendingChoice && !current.ended) {
        return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, copy, {
          objectDrinkIndex: eventObjectDrinkIndex,
        })
      }

      return nextState
    })
  }, [animationNowMs, autoPlay, copy, eventObjectDrinkIndex, parsedEventAsset?.eventIndex, playbackState.actors])

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
      setPlaybackState((current) =>
        continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, copy, {
          objectDrinkIndex: eventObjectDrinkIndex,
        }),
      )
      return
    }

    const elapsedWaitMs =
      playbackState.waitingStartedAtMs == null ? 0 : Math.max(0, performance.now() - playbackState.waitingStartedAtMs)
    const remainingWaitMs = Math.max(0, waitMs - elapsedWaitMs)

    const timeout = window.setTimeout(() => {
      setPlaybackState((current) => {
        const readyState = {
          ...current,
          waitingMs: null,
          waitingStartedAtMs: null,
        }
        return continuePlayback(readyState, parsedEventAsset?.eventIndex ?? {}, copy, {
          objectDrinkIndex: eventObjectDrinkIndex,
        })
      })
    }, remainingWaitMs)

    return () => window.clearTimeout(timeout)
  }, [autoPlay, copy, eventObjectDrinkIndex, parsedEventAsset?.eventIndex, playbackState])

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
    () =>
      Array.from(
        new Set(
          [
            ...playbackState.stageEffects.map((effect) => effect.textureName),
            ...playbackState.notices.map((notice) => notice.icon?.textureName ?? null),
          ].filter((value): value is string => Boolean(value)),
        ),
      ),
    [playbackState.notices, playbackState.stageEffects],
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
  const flashOverlayOpacity = useMemo(() => {
    if (!playbackState.flashOverlay) {
      return 0
    }

    const elapsedMs = Math.max(0, animationNowMs - playbackState.flashOverlay.startedAtMs)
    const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, playbackState.flashOverlay.durationMs)))
    return playbackState.flashOverlay.alpha * (1 - progress)
  }, [animationNowMs, playbackState.flashOverlay])
  const fadeOverlayOpacity = useMemo(
    () => resolveFadeOverlayAlpha(playbackState.fadeOverlay, animationNowMs),
    [animationNowMs, playbackState.fadeOverlay],
  )
  const playbackStatusChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; value: string }> = []

    if (playbackState.activeMusicCue) {
      chips.push({ id: 'music', label: copy.statusMusic, value: playbackState.activeMusicCue })
    }
    if (playbackState.activeSoundCue) {
      chips.push({ id: 'sound', label: copy.statusSound, value: playbackState.activeSoundCue })
    }
    if (playbackState.ambientOverlayColor) {
      chips.push({ id: 'ambient', label: copy.statusAmbient, value: playbackState.ambientOverlayColor })
    }
    if (playbackState.fadeOverlay) {
      chips.push({
        id: 'fade',
        label: copy.statusFade,
        value: `${Math.round(fadeOverlayOpacity * 100)}%`,
      })
    }

    return chips
  }, [
    copy.statusAmbient,
    copy.statusFade,
    copy.statusMusic,
    copy.statusSound,
    playbackState.activeMusicCue,
    playbackState.activeSoundCue,
    playbackState.ambientOverlayColor,
    playbackState.fadeOverlay,
    fadeOverlayOpacity,
  ])

  function handleSelectChoice(index: number) {
    setPlaybackState((current) =>
      resolveChoice(current, parsedEventAsset?.eventIndex ?? {}, index, copy, {
        objectDrinkIndex: eventObjectDrinkIndex,
      }),
    )
  }

  function playNextFrame() {
    setAutoPlay(false)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent, initialMapName)
      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, copy, {
        objectDrinkIndex: eventObjectDrinkIndex,
      })
    })
  }

  function toggleAutoPlayback() {
    setAutoPlay((current) => !current)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended ? current : createInitialPlaybackState(selectedEvent, initialMapName)
      const shouldAdvanceImmediately =
        current.rootEventKey !== selectedEvent?.key || current.ended || (!current.currentEntry && !current.pendingChoice)

      return shouldAdvanceImmediately
        ? continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, copy, {
            objectDrinkIndex: eventObjectDrinkIndex,
          })
        : nextState
    })
  }

  function resetPlayback() {
    setAutoPlay(false)
    setPlaybackState(createInitialPlaybackState(selectedEvent, initialMapName))
    onSelectTimelineEntry(EVENT_SETUP_ENTRY_ID)
  }

  function handleZoomChange(nextZoom: number) {
    setViewportZoom(nextZoom)
    setZoomLabel(viewportLabels.zoomLabel(nextZoom))
  }

  return {
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
    labels: copy,
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
    viewportZoom,
    zoomLabel,
  }
}

