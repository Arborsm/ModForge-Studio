import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Camera,
  ChevronRight,
  Map,
  MapPin,
  MoreHorizontal,
  Music,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Settings,
  UserPlus,
} from 'lucide-react'
import type { DraftPatch } from '@features/cp-maker'
import {
  parseEventCommand,
  parseEventCommands,
  parseEventSceneSetup,
  type EventSceneActor,
  type EventSceneSetup,
  type EventScript,
  type PlayerAppearanceProfile,
} from '@entities/event'
import { loadResourceRegistry, type GameDirectoryInfo } from '@entities/game/api'
import { loadItemTextureAssetState, loadItemWorkspaceEntries } from '@pages/workbench/workspaces/item/entities/item'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import { useEditorCopy, useEventStageCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { scheduleDeferred } from '@shared/lib/react'
import { globalResourceRegistryReducer, itemCatalogReducer } from '../workflow-model/editorReducers'
import type { EventScenarioPreset } from '../workflow-model/eventScenarioPresets'
import { getEventComposerCopy } from '../workflow-model/eventComposerCopy'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import { serializeRaw } from '../workflow-model/rawSerializer'
import { eventLocationDotClass, getEventIdFromKey } from '../workflow-model/eventEditorHelpers'
import { useEditorStore } from '../workflow-model/editorStore'
import { EventStagePreview, type EventStagePreviewAssetLoader } from './EventStagePreview'
import { PickModeOverlay } from './PickModeOverlay'
import { ScriptEditor } from './ScriptEditor'
import { EventResourcePicker } from './EventResourcePicker'
import { buildEventResourceRegistry, type EventActorAssetPreview, type EventResourceRegistry } from './eventResourceRegistry'

type DraftPathPoint = { tileX: number; tileY: number }

export default function EventsEditor({
  entries,
  selectedKey,
  onSelectEvent,
  updateEntries,
  updateCommand,
  patch,
  draftPatches,
  presets,
  eventAliases,
  eventLocations,
  activeLocation,
  onAddBlankEvent,
  onApplyPreset,
  gameRootPath,
  locale,
  theme,
  accentColor,
  viewportLabels,
  assetLoader,
  directoryInfo,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  conditionBuilderLabel,
  onOpenConditionBuilder,
  onOpenConfig,
  onSaveDraft,
  onReloadDraft,
  isDirty,
}: {
  entries: Record<string, unknown>
  selectedKey: string | null
  onSelectEvent: (key: string | null) => void
  updateEntries: (entries: Record<string, unknown>) => void
  updateCommand: (index: number, newRaw: string) => void
  patch: DraftPatch
  draftPatches: DraftPatch[]
  presets: EventScenarioPreset[]
  eventAliases: Record<string, string>
  eventLocations: Record<string, string>
  activeLocation: string
  onAddBlankEvent: () => void
  onApplyPreset: (preset: EventScenarioPreset) => void
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  assetLoader?: EventStagePreviewAssetLoader
  directoryInfo?: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
  conditionBuilderLabel: string
  onOpenConditionBuilder: () => void
  onOpenConfig?: () => void
  onSaveDraft?: () => void
  onReloadDraft?: () => void
  isDirty: boolean
}) {
  const workflowCopy = useEventStageCopy().workflow
  const reloadLabel = useEditorCopy().studioDesk.toolbar.reload
  const copy = getEventComposerCopy(locale, workflowCopy)
  const selectedEntry = selectedKey ? (entries[selectedKey] ?? null) : null
  const selectedEntryString = typeof selectedEntry === 'string' ? selectedEntry : null
  const [pickingActorIndex, setPickingActorIndex] = useState<number | null>(null)
  const [cameraPickMode, setCameraPickMode] = useState(false)
  const [actorAssetPreviews, setActorAssetPreviews] = useState<Record<string, EventActorAssetPreview>>({})
  const [currentPlaybackCommandId, setCurrentPlaybackCommandId] = useState<string | null>(null)
  const [globalResourceRegistry, dispatchGlobalResourceRegistry] = useReducer(globalResourceRegistryReducer, null)
  const [itemCatalogState, dispatchItemCatalog] = useReducer(itemCatalogReducer, { entries: [], texturesByAssetName: {} })
  const [draftPathPoints, setDraftPathPoints] = useState<DraftPathPoint[]>([])
  const [eventSearch, setEventSearch] = useState('')
  const [eventPickerOpen, setEventPickerOpen] = useState(false)
  const previousSelectedKeyRef = useRef<string | null>(null)
  const eventPickerRef = useRef<HTMLDivElement>(null)
  const isPickMode = useEditorStore((state) => state.isPickMode)
  const pickModeTarget = useEditorStore((state) => state.pickModeTarget)
  const pathPickingActive = pickModeTarget?.controlType === 'path_picker'

  const parsedEvent = useMemo(() => {
    if (selectedEntryString === null) {
      return null
    }
    const segments = parseEventCommands(selectedEntryString)
    const scene = parseEventSceneSetup(segments)
    const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
    return { scene, commands, segments }
  }, [selectedEntryString])

  const eventScript: EventScript | null = useMemo(() => {
    if (!parsedEvent || !selectedKey || selectedEntryString === null) {
      return null
    }
    return {
      key: selectedKey,
      eventId: selectedKey,
      preconditions: [],
      rawScript: selectedEntryString,
      rawSegments: parsedEvent.segments,
      scene: parsedEvent.scene,
      commands: parsedEvent.commands,
    }
  }, [parsedEvent, selectedEntryString, selectedKey])

  const mapName = activeLocation || null

  const eventSummaries = useMemo(() => {
    const needle = eventSearch.trim().toLowerCase()
    return Object.entries(entries)
      .flatMap(([key, value]) => {
        if (typeof value !== 'string') {
          return []
        }
        const segments = parseEventCommands(value)
        const scene = parseEventSceneSetup(segments)
        return [
          {
            key,
            label: eventAliases[key] || key.split('/')[0] || key,
            location: eventLocations[key] || mapName || 'Town',
            actors: scene.actors.map((actor) => actor.actorName),
            commandCount: Math.max(0, segments.length - 3),
          },
        ]
      })
      .filter((event) => {
        if (!needle) {
          return true
        }
        return (
          event.key.toLowerCase().includes(needle) ||
          event.label.toLowerCase().includes(needle) ||
          event.location.toLowerCase().includes(needle) ||
          event.actors.join(' ').toLowerCase().includes(needle)
        )
      })
  }, [entries, eventAliases, eventLocations, eventSearch, mapName])
  const selectedEventSummary = useMemo(() => {
    if (!selectedKey) {
      return null
    }
    const value = entries[selectedKey]
    if (typeof value !== 'string') {
      return null
    }
    const segments = parseEventCommands(value)
    const scene = parseEventSceneSetup(segments)
    return {
      key: selectedKey,
      label: eventAliases[selectedKey] || selectedKey.split('/')[0] || selectedKey,
      location: eventLocations[selectedKey] || mapName || 'Town',
      actors: scene.actors.map((actor) => actor.actorName),
      commandCount: Math.max(0, segments.length - 3),
    }
  }, [entries, eventAliases, eventLocations, mapName, selectedKey])

  const resourceRegistry = useMemo<EventResourceRegistry>(
    () =>
      buildEventResourceRegistry({
        patch,
        draftPatches,
        entries,
        eventLocations,
        actorAssets: actorAssetPreviews,
        globalRegistry: globalResourceRegistry,
        itemCatalog: itemCatalogState.entries,
        itemTexturesByAssetName: itemCatalogState.texturesByAssetName,
        sourceLabels: workflowCopy.resourceSources,
      }),
    [
      actorAssetPreviews,
      draftPatches,
      entries,
      eventLocations,
      globalResourceRegistry,
      itemCatalogState,
      patch,
      workflowCopy.resourceSources,
    ],
  )

  useEffect(() => {
    if (!gameRootPath) {
      dispatchGlobalResourceRegistry({ type: 'reset' })
      return
    }

    let cancelled = false
    void loadResourceRegistry(gameRootPath, locale)
      .then((registry) => {
        if (!cancelled) {
          dispatchGlobalResourceRegistry({ type: 'loaded', registry })
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatchGlobalResourceRegistry({ type: 'reset' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale])

  useEffect(() => {
    if (!gameRootPath) {
      dispatchItemCatalog({ type: 'reset' })
      return
    }

    let cancelled = false
    const rootPath = gameRootPath
    const resolvedLocale = locale ?? 'zh-CN'
    void (async () => {
      const entries = await loadItemWorkspaceEntries(rootPath, resolvedLocale)
      if (cancelled) {
        return
      }

      dispatchItemCatalog({ type: 'entries', entries })
      const textureAssetNames = Array.from(
        new Set(entries.map((entry) => entry.textureAssetName).filter((assetName): assetName is string => Boolean(assetName))),
      )
      const textureEntries = await Promise.all(
        textureAssetNames.map(
          async (assetName) => [assetName, await loadItemTextureAssetState(rootPath, assetName, resolvedLocale)] as const,
        ),
      )
      if (!cancelled) {
        dispatchItemCatalog({ type: 'textures', texturesByAssetName: Object.fromEntries(textureEntries) })
      }
    })().catch(() => {
      if (!cancelled) {
        dispatchItemCatalog({ type: 'reset' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale])

  useEffect(() => {
    if (previousSelectedKeyRef.current === selectedKey) {
      return
    }
    previousSelectedKeyRef.current = selectedKey
    useEditorStore.getState().reset()
    return scheduleDeferred(() => setDraftPathPoints([]))
  }, [selectedKey])

  useEffect(() => {
    if (!eventPickerOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (eventPickerRef.current?.contains(event.target as Node)) {
        return
      }
      setEventPickerOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [eventPickerOpen])

  useEffect(() => {
    if (!isPickMode && pickingActorIndex === null && !cameraPickMode) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        useEditorStore.getState().setPickModeTarget(null)
        setPickingActorIndex(null)
        setCameraPickMode(false)
        setDraftPathPoints([])
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [cameraPickMode, isPickMode, pickingActorIndex])

  function ensureSegmentPadding(segments: string[]): string[] {
    const result = [...segments]
    while (result.length < 3) {
      result.push('')
    }
    return result
  }

  function handleScriptChange(nextScript: EventScript) {
    if (!selectedKey) {
      return
    }
    updateEntries({ ...entries, [selectedKey]: nextScript.rawScript })
  }

  function handleSceneChange(nextScene: EventSceneSetup) {
    if (!selectedKey || !parsedEvent) {
      return
    }
    const actorSegment = nextScene.actors
      .map((actor) => `${actor.actorName} ${actor.tileX} ${actor.tileY} ${actor.facingDirection}`)
      .join(' ')
    const newSegments = ensureSegmentPadding([
      nextScene.musicCue ?? '',
      nextScene.cameraInstruction ?? '',
      actorSegment,
      ...parsedEvent.segments.slice(3),
    ])
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
  }

  function directionFromPreviousPoint(points: DraftPathPoint[], tileX: number, tileY: number) {
    const previous = points[points.length - 1]
    if (!previous) {
      return 2
    }
    const dx = tileX - previous.tileX
    const dy = tileY - previous.tileY
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 1 : 3
    }
    return dy >= 0 ? 2 : 0
  }

  function resolvePathReferencePoint(commandArgs: string[], actorName: string | undefined) {
    const currentDraftPoint = draftPathPoints[draftPathPoints.length - 1]
    if (currentDraftPoint) {
      return currentDraftPoint
    }

    const selectedActor = actorName ? parsedEvent?.scene.actors.find((actor) => actor.actorName === actorName) : null
    if (!selectedActor) {
      return null
    }

    const point = { tileX: selectedActor.tileX, tileY: selectedActor.tileY }
    for (let index = 1; index + 3 < commandArgs.length; index += 4) {
      if (commandArgs[index] !== actorName) {
        continue
      }
      const dx = Number.parseInt(commandArgs[index + 1] ?? '', 10)
      const dy = Number.parseInt(commandArgs[index + 2] ?? '', 10)
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        point.tileX += dx
        point.tileY += dy
      }
    }

    return point
  }

  function hasDefaultMovePathPlaceholder(commandArgs: string[]) {
    return commandArgs.length === 5 && commandArgs[2] === '0' && commandArgs[3] === '0' && commandArgs[4] === '2'
  }

  function finishPickMode() {
    useEditorStore.getState().setPickModeTarget(null)
    setPickingActorIndex(null)
    setCameraPickMode(false)
    setDraftPathPoints([])
  }

  function clearActivePath() {
    const target = useEditorStore.getState().pickModeTarget
    if (!target || target.controlType !== 'path_picker') {
      setDraftPathPoints([])
      return
    }
    const command = parsedEvent?.commands[target.commandIndex]
    if (!command) {
      setDraftPathPoints([])
      return
    }
    const nextArgs = command.args.slice(0, Math.min(command.args.length, 2))
    updateCommand(target.commandIndex, serializeRaw(nextArgs))
    setDraftPathPoints([])
  }

  function handleTileClick(tileX: number, tileY: number) {
    const state = useEditorStore.getState()
    if (state.isPickMode) {
      const target = state.pickModeTarget
      if (target != null) {
        const command = parsedEvent?.commands[target.commandIndex]
        if (command) {
          if (target.controlType === 'path_picker') {
            const actorName = command.args[1] ?? parsedEvent?.scene.actors[0]?.actorName ?? 'farmer'
            const referencePoint = resolvePathReferencePoint(command.args, actorName) ?? { tileX, tileY }
            const dx = tileX - referencePoint.tileX
            const dy = tileY - referencePoint.tileY
            const direction = directionFromPreviousPoint(
              draftPathPoints.length ? draftPathPoints : [{ tileX: referencePoint.tileX, tileY: referencePoint.tileY }],
              tileX,
              tileY,
            )
            const nextArgs = [...command.args]
            if (!nextArgs[1]) {
              nextArgs[1] = actorName
            }
            if (nextArgs.length <= 2 || (draftPathPoints.length === 0 && hasDefaultMovePathPlaceholder(nextArgs))) {
              nextArgs.splice(2)
              nextArgs.push(`${dx}`, `${dy}`, `${direction}`)
            } else {
              nextArgs.push(actorName, `${dx}`, `${dy}`, `${direction}`)
            }
            updateCommand(target.commandIndex, serializeRaw(nextArgs))
            setDraftPathPoints((current) => [...current, { tileX, tileY }])
            return
          }

          const nextArgs = [...command.args]
          nextArgs[target.paramIndex] = `${tileX}`
          if (target.controlType === 'tile_picker') {
            const schema = getSchema(command.command)
            const nextParam = schema?.template.find(
              (template) => template.type === 'param' && template.index === target.paramIndex + 1 && template.ui === 'tile_picker',
            )
            if (nextParam && nextArgs[target.paramIndex + 1] != null) {
              nextArgs[target.paramIndex + 1] = `${tileY}`
            }
          }
          updateCommand(target.commandIndex, serializeRaw(nextArgs))
        }
        state.setPickModeTarget(null)
        return
      }
    }

    if (cameraPickMode && parsedEvent && selectedKey) {
      handleSceneChange({ ...parsedEvent.scene, cameraInstruction: `${tileX} ${tileY}` })
      setCameraPickMode(false)
      return
    }

    if (pickingActorIndex === null || !parsedEvent || !selectedKey) {
      return
    }
    const newActors = parsedEvent.scene.actors.map((actor, index) => (index === pickingActorIndex ? { ...actor, tileX, tileY } : actor))
    handleSceneChange({ ...parsedEvent.scene, actors: newActors })
    setPickingActorIndex(null)
  }

  function handleContextMenuAction(action: 'addActor' | 'setCamera' | 'addWarp' | 'conditionBuilder', tileX: number, tileY: number) {
    if (!selectedKey || !parsedEvent) {
      return
    }

    switch (action) {
      case 'conditionBuilder': {
        onOpenConditionBuilder()
        break
      }
      case 'addActor': {
        const defaultName = `actor${parsedEvent.scene.actors.length + 1}`
        const newActor = { id: `actor-${Date.now()}`, actorName: defaultName, tileX, tileY, facingDirection: 2 }
        handleSceneChange({ ...parsedEvent.scene, actors: [...parsedEvent.scene.actors, newActor] })
        break
      }
      case 'setCamera': {
        handleSceneChange({ ...parsedEvent.scene, cameraInstruction: `${tileX} ${tileY}` })
        break
      }
      case 'addWarp': {
        const targetActor = parsedEvent.scene.actors[0]?.actorName ?? 'farmer'
        const newSegments = ensureSegmentPadding([...parsedEvent.segments])
        newSegments.push(`warp ${targetActor} ${tileX} ${tileY}`)
        updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
        break
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="script-console-grid">
        <section className="stage">
          <div className="viewport">
            {parsedEvent ? (
              <ComposerSceneStrip
                scene={parsedEvent.scene}
                locale={locale}
                pickMode={pickingActorIndex !== null || cameraPickMode || isPickMode}
                cameraPickMode={cameraPickMode}
                pickingActorIndex={pickingActorIndex}
                onPickModeToggle={() => {
                  if (isPickMode) {
                    useEditorStore.getState().setPickModeTarget(null)
                    setDraftPathPoints([])
                  }
                  setCameraPickMode(false)
                  setPickingActorIndex((current) => (current !== null ? null : 0))
                }}
                onPickCamera={() => {
                  if (isPickMode) {
                    useEditorStore.getState().setPickModeTarget(null)
                  }
                  setPickingActorIndex(null)
                  setCameraPickMode((current) => !current)
                }}
                onPickActor={(index) => {
                  if (isPickMode) {
                    useEditorStore.getState().setPickModeTarget(null)
                  }
                  setCameraPickMode(false)
                  setPickingActorIndex(index)
                }}
                onSceneChange={handleSceneChange}
                resourceRegistry={resourceRegistry}
              />
            ) : null}

            <div className={cx('canvas', eventScript && 'canvas-with-map')}>
              {eventScript ? (
                <EventStagePreview
                  eventScript={eventScript}
                  mapName={mapName}
                  gameRootPath={gameRootPath}
                  locale={locale}
                  theme={theme}
                  accentColor={accentColor}
                  viewportLabels={viewportLabels}
                  assetLoader={assetLoader}
                  directoryInfo={directoryInfo}
                  playerAppearanceProfile={playerAppearanceProfile}
                  onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
                  className="script-console-preview h-full"
                  hideHeader
                  hideViewportStatus
                  chromeMode="console"
                  onTileClick={handleTileClick}
                  onContextMenuAction={handleContextMenuAction}
                  conditionBuilderLabel={conditionBuilderLabel}
                  onActorAssetsChange={setActorAssetPreviews}
                  onPlaybackCommandChange={setCurrentPlaybackCommandId}
                />
              ) : (
                <div className="stage-empty">
                  <span className="ring">
                    <Map className="h-7 w-7" />
                  </span>
                  <p>{copy.chooseEvent}</p>
                  {gameRootPath ? null : <small>{copy.configureGameRoot}</small>}
                </div>
              )}

              <PickModeOverlay
                active={isPickMode || pickingActorIndex !== null || cameraPickMode || pathPickingActive}
                label={
                  pathPickingActive
                    ? draftPathPoints.length > 0
                      ? copy.pathPointHint(draftPathPoints.length)
                      : copy.pathPickHint
                    : isPickMode
                      ? copy.coordinatePickHint
                      : cameraPickMode
                        ? copy.cameraPickHint
                        : pickingActorIndex !== null
                          ? copy.actorPickHint
                          : undefined
                }
                completeLabel={copy.donePath}
                clearLabel={copy.clearPath}
                cancelLabel={copy.cancelPick}
                onComplete={pathPickingActive ? finishPickMode : undefined}
                onClear={pathPickingActive ? clearActivePath : undefined}
                onCancel={finishPickMode}
                className="top-auto! right-auto! bottom-4! left-4! justify-start! px-0!"
              />
            </div>
          </div>
        </section>

        <aside className="script">
          <div className="script-header" ref={eventPickerRef}>
            <button type="button" className="event-picker" onClick={() => setEventPickerOpen((open) => !open)}>
              <span className={`ep-dot ${eventLocationDotClass(selectedEventSummary?.location)}`} />
              <span className="ep-alias">{selectedEventSummary?.label ?? copy.chooseEvent}</span>
              <ChevronRight className="ep-caret h-3.5 w-3.5" />
            </button>
            <div className="header-actions">
              {onReloadDraft ? (
                <button type="button" className="icon-btn" title={reloadLabel} aria-label={reloadLabel} onClick={onReloadDraft}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" className="icon-btn" title={copy.searchEvent} onClick={() => setEventPickerOpen(true)}>
                <Search className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="icon-btn" title={copy.configure} onClick={onOpenConfig}>
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cx('save-state', isDirty && 'dirty')}
                onClick={onSaveDraft}
                disabled={!isDirty || !onSaveDraft}
              >
                <span className="dot" />
                {isDirty ? copy.unsaved : copy.saved}
              </button>
            </div>
            {eventPickerOpen ? (
              <div className="script-event-menu">
                <input
                  className="script-event-search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder={copy.searchEvents}
                />
                <div className="script-event-list">
                  {eventSummaries.length ? (
                    eventSummaries.map((event) => {
                      const selected = event.key === selectedKey
                      return (
                        <button
                          key={event.key}
                          type="button"
                          className={cx('script-event-option', selected && 'script-event-option-active')}
                          onClick={() => {
                            onSelectEvent(event.key)
                            setEventPickerOpen(false)
                          }}
                        >
                          <span className={`ep-dot ${eventLocationDotClass(event.location)}`} />
                          <span className="script-event-option-main">
                            <b>{event.label}</b>
                            <small>
                              {event.key.split('/')[0] ?? event.key} · {copy.commandCountShort(event.commandCount)}
                            </small>
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <div className="script-event-empty">{copy.noEvents}</div>
                  )}
                </div>
                <div className="script-event-menu-foot">
                  <button
                    type="button"
                    className="foot-add"
                    onClick={() => {
                      onAddBlankEvent()
                      setEventPickerOpen(false)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {copy.addEvent}
                  </button>
                </div>
                <div className="preset-head">{copy.fromPreset}</div>
                <div className="script-preset-list">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="preset-item"
                      onClick={() => {
                        onApplyPreset(preset)
                        setEventPickerOpen(false)
                      }}
                    >
                      <Sparkles className="ic" />
                      <span>
                        <b>{copy.presetLabel(preset)}</b>
                        <small>
                          {preset.location} · {copy.presetDescription(preset)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <ScriptEditor
            script={eventScript}
            locale={locale}
            resourceRegistry={resourceRegistry}
            currentPlaybackCommandId={currentPlaybackCommandId}
            eventId={selectedKey ? getEventIdFromKey(selectedKey) : null}
            onScriptChange={handleScriptChange}
            className="h-full"
          />
        </aside>
      </div>
    </div>
  )
}

function ComposerSceneStrip({
  scene,
  locale = 'zh-CN',
  pickMode,
  cameraPickMode,
  pickingActorIndex,
  onPickModeToggle,
  onPickCamera,
  onPickActor,
  onSceneChange,
  resourceRegistry,
}: {
  scene: EventSceneSetup
  locale?: LocaleCode
  pickMode: boolean
  cameraPickMode: boolean
  pickingActorIndex: number | null
  onPickModeToggle: () => void
  onPickCamera: () => void
  onPickActor: (index: number | null) => void
  onSceneChange: (scene: EventSceneSetup) => void
  resourceRegistry: EventResourceRegistry
}) {
  const workflowCopy = useEventStageCopy().workflow
  const copy = getEventComposerCopy(locale, workflowCopy)
  const musicLabel = copy.music
  const actorLabel = copy.actor
  const pickLabel = copy.pick
  const addActorLabel = copy.addActor
  const cameraTarget = parseSceneCameraTarget(scene.cameraInstruction)

  function commitActors(nextActors: EventSceneActor[]) {
    onSceneChange({ ...scene, actors: nextActors, characterInstruction: nextActors.map(formatSceneActorToken).join(' ') })
  }

  function updateActor(index: number, patch: Partial<EventSceneActor>) {
    commitActors(scene.actors.map((actor, actorIndex) => (actorIndex === index ? { ...actor, ...patch } : actor)))
  }

  function addActor() {
    const used = new Set(scene.actors.map((actor) => actor.actorName))
    const nextName = resourceRegistry.actor.find((option) => !used.has(option.value))?.value ?? `actor${scene.actors.length + 1}`
    commitActors([
      ...scene.actors,
      { id: `actor-${scene.actors.length + 1}-${nextName}`, actorName: nextName, tileX: 0, tileY: 0, facingDirection: 2 },
    ])
  }

  return (
    <div className="scene-bar" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <span className="scene-chip">
        <Music className="h-3.5 w-3.5" />
        <EventResourcePicker
          value={scene.musicCue ?? ''}
          label={musicLabel}
          placeholder={musicLabel}
          options={resourceRegistry.music}
          onSelect={(value) => onSceneChange({ ...scene, musicCue: value || null })}
          triggerClassName="h-5 border-0 bg-transparent px-1 font-mono"
        />
      </span>

      <button
        type="button"
        className={cx('scene-chip', cameraPickMode && 'scene-chip-active')}
        title={copy.pickCamera}
        onClick={() => {
          if (!cameraTarget) {
            onSceneChange({ ...scene, cameraInstruction: '0 0' })
          }
          onPickCamera()
        }}
      >
        <Camera className="h-3.5 w-3.5 text-(--text-tertiary)" />
        <span className="mono">{cameraTarget ? `${cameraTarget.x},${cameraTarget.y}` : (scene.cameraInstruction ?? 'follow')}</span>
        <MapPin className="h-3.5 w-3.5 text-(--accent)" />
      </button>

      <span className="scene-label">{copy.actors.replace(/:$/u, '')}</span>
      {scene.actors.map((actor, index) => {
        const isPicking = pickingActorIndex === index
        return (
          <span key={actor.id} className={cx('scene-chip scene-chip-actor', isPicking && 'scene-chip-active')}>
            <EventResourcePicker
              value={actor.actorName}
              label={actorLabel}
              placeholder={actorLabel}
              options={resourceRegistry.actor}
              onSelect={(actorName) => updateActor(index, { actorName })}
              triggerClassName="h-5 max-w-24 border-0 bg-transparent px-1 font-semibold"
            />
            <span className="mono">
              {actor.tileX},{actor.tileY}
            </span>
            <button type="button" className="dir" title={pickLabel} onClick={() => onPickActor(isPicking ? null : index)}>
              {directionArrow(actor.facingDirection)}
            </button>
          </span>
        )
      })}

      <button type="button" className="scene-chip scene-chip-add" onClick={addActor}>
        <UserPlus className="h-3.5 w-3.5" />
        {addActorLabel}
      </button>

      <button
        type="button"
        className={cx('scene-chip scene-more', pickMode && 'scene-chip-active')}
        title={pickLabel}
        onClick={onPickModeToggle}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function formatSceneActorToken(actor: EventSceneActor) {
  return `${actor.actorName} ${actor.tileX} ${actor.tileY} ${actor.facingDirection}`
}

function parseSceneCameraTarget(value: string | null | undefined) {
  if (!value) {
    return null
  }
  const [xRaw, yRaw] = value.trim().split(/\s+/u)
  const x = Number.parseInt(xRaw ?? '', 10)
  const y = Number.parseInt(yRaw ?? '', 10)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x, y }
}

function directionArrow(direction: number) {
  switch (direction) {
    case 0:
      return '↑'
    case 1:
      return '→'
    case 3:
      return '←'
    default:
      return '↓'
  }
}
