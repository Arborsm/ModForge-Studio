import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadMapAsset, loadTextAsset, type GameDirectoryInfo, type MapAssetContent } from '@entities/game/api'
import type { ViewportWorldPoint } from '@entities/map'
import type { MapDocument } from '@entities/map'
import { scheduleDeferred } from '@shared/lib/react'
import { EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import type { EventStageCopy, LocaleCode, ViewportLabels } from '@locales/api'
import {
  CHARACTER_DATA_PATH,
  EVENT_STAGE_INITIAL_ZOOM,
  OBJECT_DATA_PATH,
  advanceFadeOverlayState,
  createInitialPlaybackState,
  enqueuePlaybackNotice,
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
} from '@entities/event'
import { deriveMapDrivenFarmerBedState } from '@entities/event'
import { continuePlayback, resolveChoice, seekPlaybackToEntry } from '@entities/event'
import {
  buildCharacterTextureIndex,
  getAnimatedFrame,
  getPortraitFrameBounds,
  getTextureCandidates,
  resolveActorAssets,
  resolveEffectAsset,
} from '@entities/event'
import { buildBuildingDataIndex, buildStageWorldOverlaySprites, type StageWorldOverlaySprite } from '@entities/map'
import type { PlayerAppearanceProfile } from '@entities/event'
import { playMusicCue, playSoundCue, resetAudioPreview, stopMusicPreview, stopSoundPreview } from './audioPreview'

type UseEventStageWorkspaceOptions = {
  copy: EventStageCopy
  locale: LocaleCode
  directoryInfo: GameDirectoryInfo | null
  viewportLabels: ViewportLabels
  parsedEventAsset: ParsedEventAsset | null
  selectedEvent: EventScript | null
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onSelectTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
  mapAssetLoader?: (gameRootPath: string, mapPath: string, locale: string) => Promise<MapAssetContent>
}

type BuildingDataIndex = Record<
  string,
  {
    Texture?: string | null
    Size?: { X: number; Y: number } | null
    SourceRect?: { X: number; Y: number; Width: number; Height: number } | null
    DrawOffset?: { X: number; Y: number } | null
    SortTileOffset?: number | null
  }
>

type KeyedResourceState<T> = {
  requestKey: string
  value: T
}

type StageMapLoadState = {
  document: MapDocument | null
  message: string
  requestKey: string
  status: 'idle' | 'ready' | 'error'
}

const EMPTY_CHARACTER_TEXTURE_INDEX: CharacterTextureIndex = {}
const EMPTY_BUILDING_DATA_INDEX: BuildingDataIndex = {}
const EMPTY_OBJECT_DRINK_INDEX: Record<string, boolean> = {}

function deriveMapDrivenPlaybackState(state: PlaybackState, mapDocument: MapDocument | null) {
  let changed = false
  const nextActors = { ...state.actors }

  for (const [actorKey, actor] of Object.entries(state.actors)) {
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

  return changed ? { ...state, actors: nextActors } : state
}

function advancePlaybackTimeState(
  state: PlaybackState,
  nowMs: number,
  options: {
    autoPlay: boolean
    copy: EventStageCopy
    eventIndex: Record<string, EventScript>
    objectDrinkIndex: Record<string, boolean>
  },
) {
  let changed = false
  let nextState = state

  if (nextState.notices.length > 0 || nextState.flashOverlay != null || nextState.fadeOverlay != null) {
    const notices = prunePlaybackNotices(nextState.notices, nowMs)
    const flashOverlay =
      nextState.flashOverlay && nowMs - nextState.flashOverlay.startedAtMs >= nextState.flashOverlay.durationMs
        ? null
        : nextState.flashOverlay
    const fadeOverlay = advanceFadeOverlayState(nextState.fadeOverlay, nowMs)

    if (
      (notices !== nextState.notices && notices.length !== nextState.notices.length) ||
      flashOverlay !== nextState.flashOverlay ||
      fadeOverlay !== nextState.fadeOverlay
    ) {
      nextState = {
        ...nextState,
        notices,
        flashOverlay,
        fadeOverlay,
      }
      changed = true
    }
  }

  const nextActors = { ...nextState.actors }
  let actorsChanged = false

  for (const [actorKey, actor] of Object.entries(nextState.actors)) {
    if (actor.animation && !actor.animation.loop && getAnimatedFrame(actor, nowMs).complete) {
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
      actorsChanged = true
      continue
    }

    if (actor.movement && nowMs - actor.movement.startedAtMs >= actor.movement.durationMs) {
      const frameState = getActorDefaultFrameState(actor.actorName, actor.facingDirection)
      nextActors[actorKey] = {
        ...actor,
        movement: null,
        frame: frameState.frame,
        directionalFlip: frameState.directionalFlip,
        farmerRenderState: actor.farmerRenderState
          ? {
              ...actor.farmerRenderState,
              lastMovementEndedAtMs: nowMs,
            }
          : null,
      }
      actorsChanged = true
    }
  }

  if (actorsChanged) {
    const stillMoving = Object.values(nextActors).some((actor) => actor.movement)
    nextState = {
      ...nextState,
      actors: nextActors,
      blockingMovement: stillMoving ? nextState.blockingMovement : false,
    }
    changed = true

    if (!stillMoving && state.blockingMovement && options.autoPlay && !nextState.pendingChoice && !nextState.ended) {
      nextState = continuePlayback(nextState, options.eventIndex, options.copy, {
        objectDrinkIndex: options.objectDrinkIndex,
      })
    }
  }

  return changed ? nextState : state
}

export function useEventStageWorkspace({
  copy,
  locale,
  directoryInfo,
  viewportLabels,
  parsedEventAsset,
  selectedEvent,
  playerAppearanceProfile,
  onSelectTimelineEntry,
  onPlaybackCommandChange,
  mapAssetLoader = loadMapAsset,
}: UseEventStageWorkspaceOptions) {
  const initialMapName = normalizeStageMapName(parsedEventAsset?.asset.name)
  const [autoPlay, setAutoPlay] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showMapPaths, setShowMapPaths] = useState(false)
  const [viewportZoom, setViewportZoom] = useState(EVENT_STAGE_INITIAL_ZOOM)
  const [zoomLabel, setZoomLabel] = useState(() => viewportLabels.zoomLabel(EVENT_STAGE_INITIAL_ZOOM))
  const [musicSyncEnabled, setMusicSyncEnabled] = useState(false)
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() => createInitialPlaybackState(selectedEvent, initialMapName))
  const [animationNowMs, setAnimationNowMs] = useState(() => performance.now())
  const [mapLoadState, setMapLoadState] = useState<StageMapLoadState>({
    document: null,
    message: '',
    requestKey: '',
    status: 'idle',
  })
  const [characterTextureState, setCharacterTextureState] = useState<KeyedResourceState<CharacterTextureIndex>>({
    requestKey: '',
    value: EMPTY_CHARACTER_TEXTURE_INDEX,
  })
  const [buildingDataState, setBuildingDataState] = useState<KeyedResourceState<BuildingDataIndex>>({
    requestKey: '',
    value: EMPTY_BUILDING_DATA_INDEX,
  })
  const [eventObjectDrinkState, setEventObjectDrinkState] = useState<KeyedResourceState<Record<string, boolean>>>({
    requestKey: '',
    value: EMPTY_OBJECT_DRINK_INDEX,
  })
  const [actorAssets, setActorAssets] = useState<Record<string, ActorAssetState>>({})
  const [effectAssets, setEffectAssets] = useState<Record<string, EffectAssetState>>({})
  const lastAudioCommandIdRef = useRef<string | null>(null)
  const lastSyncedMusicCueKeyRef = useRef<string | null>(null)
  const lastAnimationNowMsRef = useRef(animationNowMs)
  const onSelectTimelineEntryRef = useRef(onSelectTimelineEntry)
  const onPlaybackCommandChangeRef = useRef(onPlaybackCommandChange)

  useEffect(() => {
    onSelectTimelineEntryRef.current = onSelectTimelineEntry
  }, [onSelectTimelineEntry])

  useEffect(() => {
    onPlaybackCommandChangeRef.current = onPlaybackCommandChange
  }, [onPlaybackCommandChange])

  useEffect(() => {
    return () => {
      resetAudioPreview()
      lastAudioCommandIdRef.current = null
      lastSyncedMusicCueKeyRef.current = null
      onPlaybackCommandChangeRef.current(null)
    }
  }, [])

  function createStageReadyPlaybackState(event: EventScript | null, mapName: string | null) {
    const initialState = createInitialPlaybackState(event, mapName)
    const musicCue = event?.scene.musicCue && event.scene.musicCue !== 'none' ? event.scene.musicCue : null
    return musicCue === initialState.activeMusicCue ? initialState : { ...initialState, activeMusicCue: musicCue }
  }

  useEffect(() => {
    lastAudioCommandIdRef.current = null
    lastSyncedMusicCueKeyRef.current = null
    onSelectTimelineEntryRef.current(EVENT_SETUP_ENTRY_ID)
    return scheduleDeferred(() => {
      setAutoPlay(false)
      setMusicSyncEnabled(false)
      setPlaybackState(createStageReadyPlaybackState(selectedEvent, initialMapName))
    })
  }, [initialMapName, selectedEvent])

  function preparePlaybackStep(state: PlaybackState) {
    if (state.waitingMs == null) {
      return state
    }

    return {
      ...state,
      waitingMs: null,
      waitingStartedAtMs: null,
    }
  }

  const characterTextureRequestKey = directoryInfo?.rootPath ? `${directoryInfo.rootPath}::${locale}` : ''
  const objectDrinkRequestKey = directoryInfo?.rootPath ? `${directoryInfo.rootPath}::${locale}` : ''
  const buildingDataRequestKey = directoryInfo?.rootPath ? `${directoryInfo.rootPath}::${locale}` : ''
  const characterTextureIndex =
    characterTextureState.requestKey === characterTextureRequestKey ? characterTextureState.value : EMPTY_CHARACTER_TEXTURE_INDEX
  const eventObjectDrinkIndex =
    eventObjectDrinkState.requestKey === objectDrinkRequestKey ? eventObjectDrinkState.value : EMPTY_OBJECT_DRINK_INDEX
  const buildingDataIndex = buildingDataState.requestKey === buildingDataRequestKey ? buildingDataState.value : EMPTY_BUILDING_DATA_INDEX
  const mapLoadRequestKey =
    directoryInfo?.rootPath && directoryInfo.mapsPath && playbackState.currentMapName
      ? `${directoryInfo.rootPath}::${directoryInfo.mapsPath}::${playbackState.currentMapName}::${locale}`
      : ''
  const mapDocument = mapLoadState.requestKey === mapLoadRequestKey && mapLoadState.status === 'ready' ? mapLoadState.document : null
  const mapMessage =
    !directoryInfo?.rootPath || !playbackState.currentMapName
      ? ''
      : !directoryInfo.mapsPath
        ? copy.stageMissing
        : mapLoadState.requestKey === mapLoadRequestKey
          ? mapLoadState.message
          : copy.stageWaiting
  const renderedPlaybackState = useMemo(() => deriveMapDrivenPlaybackState(playbackState, mapDocument), [mapDocument, playbackState])

  const visibleLayerIds = useMemo(
    () =>
      mapDocument
        ? mapDocument.layers.filter((layer) => layer.visible && (showMapPaths || !isPathsLayerName(layer.name))).map((layer) => layer.id)
        : [],
    [mapDocument, showMapPaths],
  )
  const visibleObjectGroupIds = useMemo(
    () => (mapDocument ? mapDocument.objectGroups.filter((group) => group.visible).map((group) => group.id) : []),
    [mapDocument],
  )
  const worldOverlaySprites = useMemo<StageWorldOverlaySprite[]>(
    () => buildStageWorldOverlaySprites(mapDocument, buildingDataIndex),
    [buildingDataIndex, mapDocument],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return
    }

    let cancelled = false
    const requestKey = characterTextureRequestKey

    void (async () => {
      try {
        const characterDataAsset = await loadTextAsset(directoryInfo.rootPath, CHARACTER_DATA_PATH, locale)
        if (!cancelled) {
          setCharacterTextureState({
            requestKey,
            value: buildCharacterTextureIndex(characterDataAsset.content),
          })
        }
      } catch {
        if (!cancelled) {
          setCharacterTextureState({
            requestKey,
            value: EMPTY_CHARACTER_TEXTURE_INDEX,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [characterTextureRequestKey, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return
    }

    let cancelled = false
    const requestKey = objectDrinkRequestKey

    void (async () => {
      try {
        const objectDataAsset = await loadTextAsset(directoryInfo.rootPath, OBJECT_DATA_PATH, locale)
        const parsed = JSON.parse(objectDataAsset.content) as Record<string, ObjectDataEntry>
        if (!cancelled) {
          setEventObjectDrinkState({
            requestKey,
            value: Object.fromEntries(Object.entries(parsed).map(([itemId, entry]) => [itemId, Boolean(entry?.IsDrink)])),
          })
        }
      } catch {
        if (!cancelled) {
          setEventObjectDrinkState({
            requestKey,
            value: EMPTY_OBJECT_DRINK_INDEX,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale, objectDrinkRequestKey])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return
    }

    let cancelled = false
    const requestKey = buildingDataRequestKey

    void (async () => {
      try {
        const buildingsDataAsset = await loadTextAsset(directoryInfo.rootPath, 'Content\\Data\\Buildings.xnb', locale)
        if (!cancelled) {
          setBuildingDataState({
            requestKey,
            value: buildBuildingDataIndex(buildingsDataAsset.content),
          })
        }
      } catch {
        if (!cancelled) {
          setBuildingDataState({
            requestKey,
            value: EMPTY_BUILDING_DATA_INDEX,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildingDataRequestKey, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath || !directoryInfo.mapsPath || !playbackState.currentMapName) {
      return
    }

    const mapPath = `${directoryInfo.mapsPath}\\${playbackState.currentMapName}.xnb`
    let cancelled = false
    const requestKey = mapLoadRequestKey

    void (async () => {
      try {
        const asset = await mapAssetLoader(directoryInfo.rootPath, mapPath, locale)
        if (cancelled) {
          return
        }
        if (asset.format === 'xnb') {
          setMapLoadState({
            document: JSON.parse(asset.content) as MapDocument,
            message: asset.relativePath,
            requestKey,
            status: 'ready',
          })
        } else {
          throw new Error(copy.stageMapUnsupported)
        }
      } catch (error) {
        if (!cancelled) {
          setMapLoadState({
            document: null,
            message: `${copy.stageFailed}: ${error instanceof Error ? error.message : String(error)}`,
            requestKey,
            status: 'error',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    directoryInfo?.rootPath,
    directoryInfo?.mapsPath,
    copy.stageFailed,
    copy.stageMapUnsupported,
    locale,
    mapAssetLoader,
    mapLoadRequestKey,
    playbackState.currentMapName,
  ])

  useEffect(() => {
    resetAudioPreview()
    lastAudioCommandIdRef.current = null
    lastSyncedMusicCueKeyRef.current = null
  }, [directoryInfo?.rootPath])

  useEffect(() => {
    onPlaybackCommandChange(playbackState.currentCommandId)
    if (playbackState.currentCommandId) {
      onSelectTimelineEntry(playbackState.currentCommandId)
    }
  }, [onPlaybackCommandChange, onSelectTimelineEntry, playbackState.currentCommandId])

  useEffect(() => {
    const rootPath = directoryInfo?.rootPath
    const musicCue = playbackState.activeMusicCue
    const syncKey = `${rootPath ?? ''}::${musicSyncEnabled ? (musicCue ?? 'none') : '__disabled__'}`
    if (!rootPath || syncKey === lastSyncedMusicCueKeyRef.current) {
      return
    }

    lastSyncedMusicCueKeyRef.current = syncKey
    if (!musicSyncEnabled) {
      stopMusicPreview()
    } else if (musicCue) {
      void playMusicCue(rootPath, musicCue)
    } else {
      stopMusicPreview()
    }
  }, [directoryInfo?.rootPath, musicSyncEnabled, playbackState.activeMusicCue])

  useEffect(() => {
    const rootPath = directoryInfo?.rootPath
    const commandId = playbackState.currentCommandId
    if (!rootPath || !commandId || commandId === lastAudioCommandIdRef.current) {
      return
    }

    lastAudioCommandIdRef.current = commandId
    const command = playbackState.commands.find((item) => item.id === commandId)
    if (!command) {
      return
    }

    switch (command.command) {
      case 'playSound': {
        const cue = command.args[1] && command.args[1] !== 'none' ? command.args[1] : null
        if (cue) {
          void playSoundCue(rootPath, cue).then((result) => {
            if (!result.played) {
              setPlaybackState((current) => {
                if (current.currentCommandId !== command.id || directoryInfo?.rootPath !== rootPath) {
                  return current
                }

                return {
                  ...current,
                  notices: enqueuePlaybackNotice(current, {
                    id: `${command.id}:sound-error`,
                    title: command.title,
                    detail: result.reason,
                    tone: 'loss',
                    durationMs: 4200,
                    symbol: 'sound',
                  }),
                }
              })
            }
          })
        } else {
          stopSoundPreview()
        }
        break
      }
      case 'stopSound':
        stopSoundPreview(command.args[1] ?? null)
        break
      default:
        break
    }
  }, [directoryInfo?.rootPath, playbackState.commands, playbackState.currentCommandId])

  const actorAssetRequests = useMemo<ActorAssetRequest[]>(
    () =>
      Object.values(renderedPlaybackState.actors).map((actor) => {
        const actorMetadata = characterTextureIndex[toActorKey(actor.actorName)] ?? null
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
            {
              farmerAppearanceProfile:
                isFarmerActor(actor.actorName) || normalizeActorName(actor.actorName) === 'farmer' ? playerAppearanceProfile : null,
              characterMetadata: actorMetadata,
            },
          )}`,
          spriteTextureCandidates,
          portraitTextureCandidates,
          farmerAppearanceProfile:
            isFarmerActor(actor.actorName) || normalizeActorName(actor.actorName) === 'farmer' ? playerAppearanceProfile : null,
          characterMetadata: actorMetadata,
        }
      }),
    [characterTextureIndex, directoryInfo?.rootPath, playerAppearanceProfile, renderedPlaybackState.actors],
  )

  const currentActorAssets = useMemo(
    () =>
      Object.fromEntries(
        actorAssetRequests.flatMap((request) => {
          const asset = actorAssets[request.actorKey]
          return asset?.requestKey === request.requestKey ? [[request.actorKey, asset] as const] : []
        }),
      ),
    [actorAssetRequests, actorAssets],
  )

  const pendingActorAssetRequests = useMemo(
    () => actorAssetRequests.filter((request) => currentActorAssets[request.actorKey]?.requestKey !== request.requestKey),
    [actorAssetRequests, currentActorAssets],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath || !pendingActorAssetRequests.length) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingActorAssetRequests.map(
          async (request) => [request.actorKey, await resolveActorAssets(request, directoryInfo.rootPath, locale)] as const,
        ),
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
  }, [directoryInfo?.rootPath, locale, pendingActorAssetRequests])

  useEffect(() => {
    const nowMs = performance.now()
    const hasAnimatedActors = Object.values(renderedPlaybackState.actors).some((actor) => {
      if (actor.animation || actor.movement) {
        return true
      }

      if (actor.shakeStartedAtMs != null && nowMs - actor.shakeStartedAtMs < actor.shakeDurationMs) {
        return true
      }

      if (actor.farmerRenderState?.swimming) {
        return true
      }

      const asset = currentActorAssets[toActorKey(actor.actorName)]
      const breatherEnabled = actor.breatherOverride ?? asset?.characterMetadata?.breather ?? false
      return actor.visible && breatherEnabled && !actor.farmerPassesThrough
    })
    const hasAnimatedEffects = renderedPlaybackState.stageEffects.some(
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
      renderedPlaybackState.notices.length > 0 ||
      renderedPlaybackState.flashOverlay != null ||
      isFadeOverlayAnimating(renderedPlaybackState.fadeOverlay, performance.now())
    if (!hasAnimatedActors && !hasAnimatedEffects && !hasAnimatedHud) {
      return
    }

    let frameId = 0
    const tick = () => {
      const nowMs = performance.now()
      if (nowMs - lastAnimationNowMsRef.current >= 16) {
        lastAnimationNowMsRef.current = nowMs
        setAnimationNowMs(nowMs)
      }
      setPlaybackState((current) =>
        advancePlaybackTimeState(current, nowMs, {
          autoPlay,
          copy,
          eventIndex: parsedEventAsset?.eventIndex ?? {},
          objectDrinkIndex: eventObjectDrinkIndex,
        }),
      )
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [
    currentActorAssets,
    autoPlay,
    copy,
    eventObjectDrinkIndex,
    parsedEventAsset?.eventIndex,
    renderedPlaybackState.actors,
    renderedPlaybackState.fadeOverlay,
    renderedPlaybackState.flashOverlay,
    renderedPlaybackState.notices.length,
    renderedPlaybackState.stageEffects,
  ])

  useEffect(() => {
    if (!autoPlay || playbackState.pendingChoice || playbackState.ended || playbackState.blockingMovement) {
      return
    }

    const waitMs =
      playbackState.waitingMs ??
      (playbackState.currentEntry?.tone === 'dialogue' ? 1500 : playbackState.currentEntry?.tone === 'message' ? 1200 : null)

    if (waitMs == null) {
      const timeout = window.setTimeout(() => {
        setPlaybackState((current) =>
          continuePlayback(current, parsedEventAsset?.eventIndex ?? {}, copy, {
            objectDrinkIndex: eventObjectDrinkIndex,
          }),
        )
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    const elapsedWaitMs = playbackState.waitingStartedAtMs == null ? 0 : Math.max(0, performance.now() - playbackState.waitingStartedAtMs)
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

  const effectTextureRequests = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...renderedPlaybackState.stageEffects.map((effect) => effect.textureName),
            ...renderedPlaybackState.notices.map((notice) => notice.icon?.textureName ?? null),
            ...worldOverlaySprites.map((sprite) => sprite.textureName),
          ].filter((value): value is string => Boolean(value)),
        ),
      ),
    [renderedPlaybackState.notices, renderedPlaybackState.stageEffects, worldOverlaySprites],
  )

  const currentEffectAssets = useMemo(
    () =>
      Object.fromEntries(
        effectTextureRequests.flatMap((textureName) => {
          const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
          const asset = effectAssets[textureName]
          return asset?.requestKey === requestKey ? [[textureName, asset] as const] : []
        }),
      ),
    [directoryInfo?.rootPath, effectAssets, effectTextureRequests],
  )

  const pendingEffectTextureRequests = useMemo(
    () =>
      effectTextureRequests.filter((textureName) => {
        const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
        return currentEffectAssets[textureName]?.requestKey !== requestKey
      }),
    [directoryInfo?.rootPath, currentEffectAssets, effectTextureRequests],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath || pendingEffectTextureRequests.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingEffectTextureRequests.map(
          async (textureName) => [textureName, await resolveEffectAsset(textureName, directoryInfo.rootPath)] as const,
        ),
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
    if (!mapDocument || !renderedPlaybackState.focusTile) {
      return null
    }

    return {
      worldX: (renderedPlaybackState.focusTile.tileX + 0.5) * mapDocument.tileWidth,
      worldY: (renderedPlaybackState.focusTile.tileY + 0.5) * mapDocument.tileHeight,
    }
  }, [mapDocument, renderedPlaybackState.focusTile])

  const currentDialogueActor =
    renderedPlaybackState.currentEntry?.tone === 'dialogue' && renderedPlaybackState.currentEntry.actorName
      ? getActorByName(renderedPlaybackState.actors, renderedPlaybackState.currentEntry.actorName)
      : null
  const currentDialogueActorAsset = currentDialogueActor ? (currentActorAssets[toActorKey(currentDialogueActor.actorName)] ?? null) : null
  const currentDialoguePortrait = useMemo(
    () => getPortraitFrameBounds(currentDialogueActorAsset, renderedPlaybackState.currentEntry?.portraitIndex ?? 0),
    [currentDialogueActorAsset, renderedPlaybackState.currentEntry?.portraitIndex],
  )
  const flashOverlayOpacity = useMemo(() => {
    if (!renderedPlaybackState.flashOverlay) {
      return 0
    }

    const elapsedMs = Math.max(0, animationNowMs - renderedPlaybackState.flashOverlay.startedAtMs)
    const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, renderedPlaybackState.flashOverlay.durationMs)))
    return renderedPlaybackState.flashOverlay.alpha * (1 - progress)
  }, [animationNowMs, renderedPlaybackState.flashOverlay])
  const fadeOverlayOpacity = useMemo(
    () => resolveFadeOverlayAlpha(renderedPlaybackState.fadeOverlay, animationNowMs),
    [animationNowMs, renderedPlaybackState.fadeOverlay],
  )
  const playbackStatusChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; value: string }> = []

    if (renderedPlaybackState.activeMusicCue) {
      chips.push({ id: 'music', label: copy.statusMusic, value: renderedPlaybackState.activeMusicCue })
    }
    if (renderedPlaybackState.activeSoundCue) {
      chips.push({ id: 'sound', label: copy.statusSound, value: renderedPlaybackState.activeSoundCue })
    }
    if (renderedPlaybackState.ambientOverlayColor) {
      chips.push({ id: 'ambient', label: copy.statusAmbient, value: renderedPlaybackState.ambientOverlayColor })
    }
    if (renderedPlaybackState.fadeOverlay) {
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
    renderedPlaybackState.activeMusicCue,
    renderedPlaybackState.activeSoundCue,
    renderedPlaybackState.ambientOverlayColor,
    renderedPlaybackState.fadeOverlay,
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
    setMusicSyncEnabled(true)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended
          ? preparePlaybackStep(current)
          : createStageReadyPlaybackState(selectedEvent, initialMapName)
      return continuePlayback(nextState, parsedEventAsset?.eventIndex ?? {}, copy, {
        objectDrinkIndex: eventObjectDrinkIndex,
      })
    })
  }

  function toggleAutoPlayback() {
    setMusicSyncEnabled(true)
    setAutoPlay((current) => !current)
    setPlaybackState((current) => {
      const nextState =
        current.rootEventKey === selectedEvent?.key && !current.ended
          ? current
          : createStageReadyPlaybackState(selectedEvent, initialMapName)
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
    setMusicSyncEnabled(false)
    setPlaybackState(createStageReadyPlaybackState(selectedEvent, initialMapName))
    onSelectTimelineEntry(EVENT_SETUP_ENTRY_ID)
  }

  const seekTimelineEntry = useCallback(
    (entryId: string) => {
      setAutoPlay(false)
      setMusicSyncEnabled(true)
      setPlaybackState(
        seekPlaybackToEntry(selectedEvent, parsedEventAsset?.eventIndex ?? {}, entryId, initialMapName, copy, {
          objectDrinkIndex: eventObjectDrinkIndex,
        }),
      )
    },
    [copy, eventObjectDrinkIndex, initialMapName, parsedEventAsset?.eventIndex, selectedEvent],
  )

  function handleZoomChange(nextZoom: number) {
    setViewportZoom(nextZoom)
    setZoomLabel(viewportLabels.zoomLabel(nextZoom))
  }

  return {
    actorAssets: currentActorAssets,
    animationNowMs,
    autoPlay,
    currentDialogueActor,
    currentDialogueActorAsset,
    currentDialoguePortrait,
    effectAssets: currentEffectAssets,
    fadeOverlayOpacity,
    flashOverlayOpacity,
    focusWorldPoint,
    handleSelectChoice,
    handleZoomChange,
    labels: copy,
    mapDocument,
    mapMessage,
    playbackState: renderedPlaybackState,
    playbackStatusChips,
    playNextFrame,
    resetPlayback,
    seekTimelineEntry,
    setShowGrid,
    setShowMapPaths,
    showGrid,
    showMapPaths,
    toggleAutoPlayback,
    visibleLayerIds,
    visibleObjectGroupIds,
    viewportZoom,
    worldOverlaySprites,
    zoomLabel,
  }
}
