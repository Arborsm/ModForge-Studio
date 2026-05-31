import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Clapperboard, Database, GitBranch, Map, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { DraftPatch, CpMakerDraft, GameDirectoryInfo } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { parseEventCommand, parseEventCommands, parseEventSceneSetup } from '@entities/event'
import { loadResourceRegistry, type ResourceRegistry } from '@entities/game/api'
import {
  loadItemTextureAssetState,
  loadItemWorkspaceEntries,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '@pages/workbench/workspaces/item/entities/item'
import { serializeRaw } from '../workflow-model/rawSerializer'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import type { EventScript, EventSceneSetup, PlayerAppearanceProfile } from '@entities/event'
import { EventStagePreview, type EventStagePreviewAssetLoader } from './EventStagePreview'
import { PickModeOverlay } from './PickModeOverlay'
import { SceneSetupBar } from './SceneSetupBar'
import { ScriptEditor } from './ScriptEditor'
import { useEditorStore } from '../workflow-model/editorStore'
import { useEditorCopy, useLocale } from '@locales/localeContext'
import { buildEventPatchHubPatches } from '@entities/event'
import { EventConditionBuilderModal, type EventConditionBuilderResult } from './EventConditionBuilderModal'
import { scheduleDeferred } from '@shared/lib/react'
import { buildEventResourceRegistry, type EventActorAssetPreview, type EventResourceRegistry } from './eventResourceRegistry'

type EditorTab = 'events' | 'fields' | 'textops' | 'moveentries'
type DraftPathPoint = { tileX: number; tileY: number }

type ItemCatalogState = {
  entries: ItemWorkspaceEntry[]
  texturesByAssetName: Record<string, ItemTextureAssetState>
}

type ItemCatalogAction =
  | { type: 'reset' }
  | { type: 'entries'; entries: ItemWorkspaceEntry[] }
  | { type: 'textures'; texturesByAssetName: Record<string, ItemTextureAssetState> }

function itemCatalogReducer(state: ItemCatalogState, action: ItemCatalogAction): ItemCatalogState {
  switch (action.type) {
    case 'reset':
      return { entries: [], texturesByAssetName: {} }
    case 'entries':
      return { entries: action.entries, texturesByAssetName: {} }
    case 'textures':
      return { ...state, texturesByAssetName: action.texturesByAssetName }
  }
}

type GlobalResourceRegistryAction = { type: 'reset' } | { type: 'loaded'; registry: ResourceRegistry }

function globalResourceRegistryReducer(_state: ResourceRegistry | null, action: GlobalResourceRegistryAction) {
  switch (action.type) {
    case 'reset':
      return null
    case 'loaded':
      return action.registry
  }
}

const EMPTY_ENTRIES: Record<string, unknown> = {}

const EVENT_LOCATIONS = ['Town', 'Beach', 'Mine', 'Forest', 'Saloon', 'Farm', 'Mountain', 'CommunityCenter'] as const

type EventScenarioPreset = {
  id: string
  label: string
  description: string
  location: (typeof EVENT_LOCATIONS)[number]
  eventKey: string
  alias: string
  music: string
  camera: string
  actors: string
  commands: string[]
}

const EVENT_SCENARIO_PRESETS: EventScenarioPreset[] = [
  {
    id: 'town-market',
    label: 'Town market introduction',
    description: 'Town scene with two NPCs, dialogue, movement, emotion, a reward, and a clean ending.',
    location: 'Town',
    eventKey: '900001/Season spring/Time 900 1400/Weather Sun',
    alias: 'Spring market meeting',
    music: 'spring2',
    camera: '12 45',
    actors: 'farmer 12 47 0 Abigail 12 45 2 Lewis 16 45 3',
    commands: [
      'skippable',
      'viewport 12 45',
      'pause 400',
      'speak Abigail "The square feels alive today.$h"',
      'move Abigail 1 0 1 Abigail 1 0 1',
      'faceDirection Lewis 3',
      'emote Lewis 16',
      'speak Lewis "A proper market needs a proper opening."',
      'addItem "(O)24" 1',
      'message "You received a market parsnip."',
      'end dialogue',
    ],
  },
  {
    id: 'beach-find',
    label: 'Beach lost item',
    description: 'Beach item event with props, sound, player animation, head-held item, and friendship reward.',
    location: 'Beach',
    eventKey: '900002/Season summer/Time 1200 1800',
    alias: 'Lost shell on the pier',
    music: 'wavy',
    camera: '34 11',
    actors: 'farmer 34 14 0 Elliott 37 11 3',
    commands: [
      'skippable',
      'playSound waves',
      'addObject 35 12 "(O)372"',
      'speak Elliott "The tide left something curious behind."',
      'warp farmer 35 12 2',
      'farmerAnimation 7',
      'itemAboveHead "(O)372"',
      'removeObject 35 12',
      'friendship Elliott 80',
      'speak Elliott "A small discovery, but a memorable one."',
      'end dialogue',
    ],
  },
  {
    id: 'mine-rescue',
    label: 'Mine rescue branch',
    description: 'Mine scene with temporary actor, movement path, animation, sound, shake, choice, and branch hook.',
    location: 'Mine',
    eventKey: '900003/PlayerGender male female/MailReceived guildMember',
    alias: 'Lantern in the dark',
    music: 'Cavern',
    camera: '18 8',
    actors: 'farmer 18 12 0 Marlon 20 8 3',
    commands: [
      'skippable',
      'ambientLight 80 80 120',
      'addLantern 19 9',
      'addTemporaryActor Shadow 16 32 17 8 2',
      'playSound shadowpeep',
      'shake 500',
      'animate Shadow true true 120 0 1 2 3',
      'move Marlon -1 0 3 Marlon 0 2 2',
      'speak Marlon "Stay behind me. Something is moving."',
      'quickQuestion "Hold the lantern?#Yes#No(break)glow farmer\\message You steady the light.(break)screenFlash"',
      'switchEvent 900004',
      'end dialogue',
    ],
  },
]

interface EventPatchEditorProps {
  patch: DraftPatch
  draft: CpMakerDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  selectedEventKey?: string | null
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
  assetLoader?: EventStagePreviewAssetLoader
}

type TextOperation = {
  operation: 'Append' | 'Prepend' | 'ReplaceDelimited' | 'RemoveDelimited'
  target: string[]
  value: string
  search?: string
  delimiter?: string
  replaceMode?: 'First' | 'All'
}

export function EventPatchEditor({
  patch,
  draft,
  onPatchChange,
  onAddVirtualAsset,
  locale,
  theme,
  accentColor,
  viewportLabels,
  selectedEventKey,
  gameRootPath: externalGameRootPath,
  directoryInfo,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  assetLoader,
}: EventPatchEditorProps) {
  void onAddVirtualAsset
  const currentLocale = useLocale()
  const effectiveLocale = locale ?? currentLocale
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, unknown> | undefined) ?? EMPTY_ENTRIES
  const fields = (editorState['fields'] as Record<string, Record<string, string>> | undefined) ?? {}
  const moveEntries =
    (editorState['moveEntries'] as Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }> | undefined) ?? []
  const gameRootPath = externalGameRootPath ?? draft.projectMetadata.gameRootPath ?? null
  const [conditionBuilderOpen, setConditionBuilderOpen] = useState(false)
  const [localSelectedKey, setLocalSelectedKey] = useState<string | null>(null)

  const activeTab: EditorTab = 'events'
  const entryKeys = useMemo(() => Object.keys(entries), [entries])
  const selectedKey =
    localSelectedKey && entries[localSelectedKey] != null
      ? localSelectedKey
      : selectedEventKey && entries[selectedEventKey] != null
        ? selectedEventKey
        : (entryKeys[0] ?? null)
  const setSelectedKey = setLocalSelectedKey
  const hubPatch = useMemo(() => buildEventPatchHubPatches([patch])[0] ?? null, [patch])
  const conditionBuilderEvent = selectedKey ? (hubPatch?.events.find((event) => event.key === selectedKey) ?? null) : null
  const eventAliases = eventAliasesFromState(editorState)
  const conditionBuilderAlias = conditionBuilderEvent ? (eventAliases[conditionBuilderEvent.key] ?? '') : ''
  const eventLocations = eventLocationsFromState(editorState)
  const activeLocation = (selectedKey ? eventLocations[selectedKey] : null) ?? getLocationFromTarget(patch.target)

  function updateEntries(newEntries: Record<string, unknown>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, entries: newEntries },
    })
  }

  function updateFields(newFields: Record<string, Record<string, string>>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, fields: newFields },
    })
  }

  function updateTextOperations(newOps: unknown[]) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, textOperations: newOps },
    })
  }

  function updateMoveEntries(newEntries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, moveEntries: newEntries },
    })
  }

  function applyConditionBuilder(result: EventConditionBuilderResult) {
    if (!selectedKey) {
      setConditionBuilderOpen(false)
      return
    }

    const selectedEntry = entries[selectedKey]
    if (typeof selectedEntry !== 'string') {
      setConditionBuilderOpen(false)
      return
    }

    const nextEntries = { ...entries }
    if (result.eventKey !== selectedKey) {
      delete nextEntries[selectedKey]
    }
    nextEntries[result.eventKey] = selectedEntry

    const nextAliases = eventAliasesFromState(editorState)
    delete nextAliases[selectedKey]
    if (result.alias) {
      nextAliases[result.eventKey] = result.alias
    }

    const nextEventLocations = eventLocationsFromState(editorState)
    const selectedEventLocation = nextEventLocations[selectedKey]
    delete nextEventLocations[selectedKey]
    if (selectedEventLocation) {
      nextEventLocations[result.eventKey] = selectedEventLocation
    }

    const disabledKeys = Array.isArray(editorState['disabledEventKeys'])
      ? editorState['disabledEventKeys'].map((key) => (key === selectedKey ? result.eventKey : key))
      : []
    onPatchChange(patch.id, {
      editorState: {
        ...editorState,
        entries: nextEntries,
        disabledEventKeys: disabledKeys,
        eventAliases: nextAliases,
        eventLocations: nextEventLocations,
      },
    })
    setLocalSelectedKey(result.eventKey)
    setConditionBuilderOpen(false)
  }

  function updatePatchLocation(location: string) {
    const trimmed = location.trim()
    if (!trimmed) {
      return
    }

    const nextEventLocations = selectedKey
      ? { ...eventLocationsFromState(editorState), [selectedKey]: trimmed }
      : eventLocationsFromState(editorState)
    onPatchChange(patch.id, {
      target: `Data/Events/${trimmed}`,
      logName: patch.logName || `${trimmed} event scenes`,
      editorState: {
        ...editorState,
        eventLocations: nextEventLocations,
      },
    })
  }

  function addBlankEvent() {
    const location = activeLocation || 'Town'
    const suffix = Object.keys(entries).length + 1
    const key = createUniqueEventKey(entries, suffix)
    const script = 'spring2/12 12/farmer 12 14 0/skippable/end dialogue'
    const nextAliases = { ...eventAliasesFromState(editorState), [key]: `Untitled ${location} event ${suffix}` }
    const nextEventLocations = { ...eventLocationsFromState(editorState), [key]: location }
    onPatchChange(patch.id, {
      editorState: {
        ...editorState,
        entries: { ...entries, [key]: script },
        eventAliases: nextAliases,
        eventLocations: nextEventLocations,
      },
    })
    setLocalSelectedKey(key)
  }

  function applyScenarioPreset(preset: EventScenarioPreset) {
    const presetEventId = getEventIdFromKey(preset.eventKey)
    const nextEntries = {
      ...removeEntriesWithEventId(entries, presetEventId),
      [preset.eventKey]: buildPresetScript(preset),
    }
    const nextAliases = {
      ...removeEntriesWithEventId(eventAliasesFromState(editorState), presetEventId),
      [preset.eventKey]: preset.alias,
    }
    const nextEventLocations = {
      ...removeEntriesWithEventId(eventLocationsFromState(editorState), presetEventId),
      [preset.eventKey]: preset.location,
    }
    const disabledKeys = Array.isArray(editorState['disabledEventKeys'])
      ? editorState['disabledEventKeys'].filter(
          (key): key is string => typeof key === 'string' && getEventIdFromKey(key) !== presetEventId && key !== preset.eventKey,
        )
      : []

    onPatchChange(patch.id, {
      editorState: {
        ...editorState,
        entries: nextEntries,
        disabledEventKeys: disabledKeys,
        eventAliases: nextAliases,
        eventLocations: nextEventLocations,
      },
    })
    setLocalSelectedKey(preset.eventKey)
  }

  function updateCommand(index: number, newRaw: string) {
    if (!selectedKey) {
      return
    }
    const selectedEntry = entries[selectedKey]
    if (typeof selectedEntry !== 'string') {
      return
    }
    const segments = parseEventCommands(selectedEntry)
    segments[index + 3] = newRaw
    updateEntries({ ...entries, [selectedKey]: segments.join('/') })
  }

  return (
    <div className="event-edit-shell">
      <EventComposerHeader
        activeLocation={activeLocation}
        eventCount={entryKeys.length}
        commandCount={countEntryCommands(entries)}
        patchTarget={patch.target}
        presets={EVENT_SCENARIO_PRESETS}
        onAddBlankEvent={addBlankEvent}
        onApplyPreset={applyScenarioPreset}
        selectedEventKey={selectedKey}
        eventAliases={eventAliases}
        entries={entries}
        onSelectEvent={setSelectedKey}
        onLocationChange={updatePatchLocation}
        onOpenConditionBuilder={() => selectedKey && setConditionBuilderOpen(true)}
      />
      {activeTab === 'events' ? (
        <EventsEditor
          entries={entries}
          selectedKey={selectedKey}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
          patch={patch}
          draftPatches={draft.patches}
          eventLocations={eventLocations}
          patchTarget={patch.target}
          activeLocation={activeLocation}
          gameRootPath={gameRootPath}
          locale={effectiveLocale}
          theme={theme}
          accentColor={accentColor}
          viewportLabels={viewportLabels}
          assetLoader={assetLoader}
          directoryInfo={directoryInfo}
          playerAppearanceProfile={playerAppearanceProfile}
          onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
          conditionBuilderLabel={hubCopy.conditionBuilderAction}
          onOpenConditionBuilder={() => setConditionBuilderOpen(true)}
        />
      ) : activeTab === 'fields' ? (
        <FieldsEditor fields={fields} selectedKey={selectedKey} setSelectedKey={setSelectedKey} updateFields={updateFields} />
      ) : activeTab === 'textops' ? (
        <TextOpsEditor
          textOperations={(editorState['textOperations'] as unknown[] | undefined) ?? []}
          updateTextOperations={updateTextOperations}
        />
      ) : (
        <MoveEntriesEditor moveEntries={moveEntries} updateMoveEntries={updateMoveEntries} />
      )}
      {conditionBuilderOpen && conditionBuilderEvent && hubPatch ? (
        <EventConditionBuilderModal
          event={conditionBuilderEvent}
          allEvents={hubPatch.events}
          alias={conditionBuilderAlias}
          hubCopy={hubCopy}
          copy={hubCopy.conditionBuilder}
          onApply={applyConditionBuilder}
          onCancel={() => setConditionBuilderOpen(false)}
        />
      ) : null}
    </div>
  )
}

function eventAliasesFromState(state: Record<string, unknown>): Record<string, string> {
  if (typeof state['eventAliases'] !== 'object' || state['eventAliases'] === null || Array.isArray(state['eventAliases'])) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(state['eventAliases'] as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function eventLocationsFromState(state: Record<string, unknown>): Record<string, string> {
  if (typeof state['eventLocations'] !== 'object' || state['eventLocations'] === null || Array.isArray(state['eventLocations'])) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(state['eventLocations'] as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function buildPresetScript(preset: EventScenarioPreset) {
  return [preset.music, preset.camera, preset.actors, ...preset.commands].join('/')
}

function getLocationFromTarget(target: string) {
  const parts = target.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function getEventIdFromKey(key: string) {
  return key.split('/')[0] ?? key
}

function removeEntriesWithEventId<T>(records: Record<string, T>, eventId: string) {
  return Object.fromEntries(Object.entries(records).filter(([key]) => getEventIdFromKey(key) !== eventId))
}

function countEntryCommands(entries: Record<string, unknown>): number {
  return Object.values(entries).reduce<number>((total, value) => {
    if (typeof value !== 'string') {
      return total
    }
    return total + Math.max(0, parseEventCommands(value).length - 3)
  }, 0)
}

function createUniqueEventKey(entries: Record<string, unknown>, startAt: number) {
  for (let offset = 0; offset < 1000; offset += 1) {
    const suffix = startAt + offset
    const candidate = `900${String(suffix).padStart(3, '0')}/Season spring/Time 900 1700`
    if (entries[candidate] == null) {
      return candidate
    }
  }
  return `900${Date.now()}/Season spring/Time 900 1700`
}

function getStarterMusic(location: string) {
  switch (location) {
    case 'Beach':
      return 'wavy'
    case 'Mine':
      return 'Cavern'
    case 'Forest':
      return 'woodsTheme'
    case 'Saloon':
      return 'saloon1'
    case 'Mountain':
      return 'spring3'
    default:
      return 'spring2'
  }
}

function getStarterActorName(location: string) {
  switch (location) {
    case 'Beach':
      return 'Elliott'
    case 'Mine':
      return 'Marlon'
    case 'Forest':
      return 'JunimoGuide'
    case 'Saloon':
      return 'Gus'
    case 'Mountain':
      return 'Linus'
    default:
      return 'Abigail'
  }
}

function buildStarterFlowScript(scene: EventSceneSetup, location: string) {
  const farmer = scene.actors.find((actor) => /^farmer\d*$/iu.test(actor.actorName)) ?? scene.actors[0]
  const farmerTileX = farmer?.tileX ?? 12
  const farmerTileY = farmer?.tileY ?? 14
  const farmerDirection = farmer?.facingDirection ?? 0
  const actorName = scene.actors.find((actor) => !/^farmer\d*$/iu.test(actor.actorName))?.actorName ?? getStarterActorName(location)
  const actorTileX = farmerTileX + 2
  const actorTileY = Math.max(0, farmerTileY - 1)
  const objectTileX = actorTileX + 1
  const objectTileY = actorTileY
  const camera = `${Math.max(0, farmerTileX + 1)} ${Math.max(0, farmerTileY - 1)}`

  return [
    getStarterMusic(location),
    camera,
    `farmer ${farmerTileX} ${farmerTileY} ${farmerDirection} ${actorName} ${actorTileX} ${actorTileY} 3`,
    'skippable',
    `viewport ${Math.max(0, farmerTileX + 1)} ${Math.max(0, farmerTileY - 1)}`,
    `speak ${actorName} "I brought a small scene draft. We can tune every beat from here."`,
    `emote ${actorName} 16`,
    `move ${actorName} 1 0 1 ${actorName} 0 1 2`,
    `addObject ${objectTileX} ${objectTileY} "(O)72"`,
    'itemAboveHead "(O)72"',
    `animate ${actorName} true true 120 16 17 18 19`,
    'addItem "(O)72" 1',
    'message "The starter event now has movement, an item, and animation."',
    'end dialogue',
  ].join('/')
}

function EventComposerHeader({
  activeLocation,
  eventCount,
  commandCount,
  patchTarget,
  presets,
  selectedEventKey,
  eventAliases,
  entries,
  onAddBlankEvent,
  onApplyPreset,
  onSelectEvent,
  onLocationChange,
  onOpenConditionBuilder,
}: {
  activeLocation: string
  eventCount: number
  commandCount: number
  patchTarget: string
  presets: EventScenarioPreset[]
  selectedEventKey: string | null
  eventAliases: Record<string, string>
  entries: Record<string, unknown>
  onAddBlankEvent: () => void
  onApplyPreset: (preset: EventScenarioPreset) => void
  onSelectEvent: (key: string | null) => void
  onLocationChange: (location: string) => void
  onOpenConditionBuilder: () => void
}) {
  const eventCards = Object.entries(entries).flatMap(([key, value]) => {
    if (typeof value !== 'string') {
      return []
    }

    const segments = parseEventCommands(value)
    const scene = parseEventSceneSetup(segments)
    return [
      {
        key,
        label: eventAliases[key] || key.split('/')[0] || key,
        actors: scene.actors.map((actor) => actor.actorName),
        commandCount: Math.max(0, segments.length - 3),
      },
    ]
  })

  return (
    <div className="border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
            <Clapperboard className="h-3.5 w-3.5 text-[var(--accent)]" />
            Graphical event maker
          </span>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <MapPin className="h-3.5 w-3.5" />
            Location
            <select
              className="control-input h-7 w-40 text-xs"
              value={activeLocation}
              onChange={(event) => onLocationChange(event.target.value)}
            >
              {EVENT_LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>
          <span className="rounded-full bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {eventCount} events
          </span>
          <span className="rounded-full bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {commandCount} commands
          </span>
          <span className="max-w-[260px] truncate rounded-full bg-[var(--bg-panel-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            {patchTarget}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="control-button h-7" onClick={onOpenConditionBuilder}>
            <GitBranch className="h-3.5 w-3.5" />
            <span>Trigger</span>
          </button>
          <button type="button" className="control-button h-7" onClick={onAddBlankEvent}>
            <Plus className="h-3.5 w-3.5" />
            <span>Event</span>
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="group flex max-w-[260px] min-w-[220px] items-start gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2.5 py-2 text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-color))]"
            onClick={() => onApplyPreset(preset)}
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{preset.label}</span>
              <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
                {preset.location} · {preset.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      {eventCards.length > 0 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto border-t border-[var(--border-color)] pt-2">
          {eventCards.map((event) => {
            const selected = event.key === selectedEventKey
            return (
              <button
                key={event.key}
                type="button"
                className={`max-w-[240px] min-w-[190px] rounded-md border px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? 'border-[color-mix(in_srgb,var(--accent)_65%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]'
                }`}
                onClick={() => onSelectEvent(event.key)}
              >
                <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{event.label}</span>
                <span className="mt-1 block truncate text-[10px] text-[var(--text-tertiary)]">
                  {event.actors.length ? event.actors.join(', ') : 'No actors'} · {event.commandCount} commands
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function EventsEditor({
  entries,
  selectedKey,
  updateEntries,
  updateCommand,
  patch,
  draftPatches,
  eventLocations,
  patchTarget,
  activeLocation,
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
}: {
  entries: Record<string, unknown>
  selectedKey: string | null
  updateEntries: (entries: Record<string, unknown>) => void
  updateCommand: (index: number, newRaw: string) => void
  patch: DraftPatch
  draftPatches: DraftPatch[]
  eventLocations: Record<string, string>
  patchTarget: string
  activeLocation: string
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
}) {
  const selectedEntry = selectedKey ? (entries[selectedKey] ?? null) : null
  const selectedEntryString = typeof selectedEntry === 'string' ? selectedEntry : null
  const [pickingActorIndex, setPickingActorIndex] = useState<number | null>(null)
  const [cameraPickMode, setCameraPickMode] = useState(false)
  const [actorAssetPreviews, setActorAssetPreviews] = useState<Record<string, EventActorAssetPreview>>({})
  const [currentPlaybackCommandId, setCurrentPlaybackCommandId] = useState<string | null>(null)
  const [globalResourceRegistry, dispatchGlobalResourceRegistry] = useReducer(globalResourceRegistryReducer, null)
  const [itemCatalogState, dispatchItemCatalog] = useReducer(itemCatalogReducer, { entries: [], texturesByAssetName: {} })
  const [draftPathPoints, setDraftPathPoints] = useState<DraftPathPoint[]>([])
  const previousSelectedKeyRef = useRef<string | null>(null)
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

  const mapName = useMemo(() => {
    return activeLocation || getLocationFromTarget(patchTarget) || null
  }, [activeLocation, patchTarget])

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
        locale: locale ?? 'zh-CN',
      }),
    [actorAssetPreviews, draftPatches, entries, eventLocations, globalResourceRegistry, itemCatalogState, locale, patch],
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

  function applyStarterFlow() {
    if (!selectedKey || !parsedEvent) {
      return
    }
    updateEntries({ ...entries, [selectedKey]: buildStarterFlowScript(parsedEvent.scene, mapName ?? activeLocation) })
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
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-[7] flex-col border-r border-[var(--border-color)]">
        {parsedEvent ? (
          <div className="border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="min-w-[220px] flex-1 truncate rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
                Trigger: <strong className="font-semibold text-[var(--text-primary)]">{selectedKey?.split('/')[0] ?? 'New event'}</strong>
              </span>
              <button type="button" className="control-button h-8" onClick={applyStarterFlow}>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Starter flow</span>
              </button>
              <button type="button" className="control-button h-8" onClick={onOpenConditionBuilder}>
                <GitBranch className="h-3.5 w-3.5" />
                <span>Design trigger</span>
              </button>
            </div>
            <SceneSetupBar
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
              className="border-0"
            />
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
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
              className="h-full"
              hideHeader
              onTileClick={handleTileClick}
              onContextMenuAction={handleContextMenuAction}
              conditionBuilderLabel={conditionBuilderLabel}
              onActorAssetsChange={setActorAssetPreviews}
              onPlaybackCommandChange={setCurrentPlaybackCommandId}
              additionalViewportOverlay={
                <PickModeOverlay
                  active={isPickMode || pickingActorIndex !== null || cameraPickMode}
                  label={
                    pathPickingActive
                      ? draftPathPoints.length > 0
                        ? `${draftPathPoints.length} path points selected.`
                        : 'Click map tiles to build the movement path.'
                      : isPickMode
                        ? 'Click the map to choose coordinates'
                        : cameraPickMode
                          ? 'Click the map to set the camera target'
                          : pickingActorIndex !== null
                            ? 'Click the map to place the actor'
                            : undefined
                  }
                  completeLabel={locale === 'zh-CN' ? '完成路径' : 'Done'}
                  clearLabel={locale === 'zh-CN' ? '清空路径' : 'Clear'}
                  cancelLabel={locale === 'zh-CN' ? '取消拾取' : 'Cancel'}
                  onComplete={pathPickingActive ? finishPickMode : undefined}
                  onClear={pathPickingActive ? clearActivePath : undefined}
                  onCancel={finishPickMode}
                />
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
              <Map className="h-8 w-8 opacity-40" />
              <p className="text-xs">Choose an event entry from the menu above.</p>
              {gameRootPath ? null : <p className="text-[10px]">Configure the game root to render the map preview.</p>}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-[3] flex-col">
        <ScriptEditor
          script={eventScript}
          locale={locale}
          resourceRegistry={resourceRegistry}
          currentPlaybackCommandId={currentPlaybackCommandId}
          onScriptChange={handleScriptChange}
          className="h-full"
        />
      </div>
    </div>
  )
}

function FieldsEditor({
  fields,
  selectedKey,
  setSelectedKey,
  updateFields,
}: {
  fields: Record<string, Record<string, string>>
  selectedKey: string | null
  setSelectedKey: (key: string | null) => void
  updateFields: (fields: Record<string, Record<string, string>>) => void
}) {
  const entryList = Object.entries(fields)
  const selectedFieldMap = selectedKey ? (fields[selectedKey] ?? null) : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
            Entries ({entryList.length})
          </span>
          <button
            type="button"
            className="icon-button h-6 w-6"
            onClick={() => {
              const newKey = `Entry${entryList.length + 1}`
              updateFields({ ...fields, [newKey]: {} })
              setSelectedKey(newKey)
            }}
            title="Add entry"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {entryList.length ? (
            entryList.map(([key]) => (
              <button
                key={key}
                type="button"
                className={`asset-row mb-2 ${selectedKey === key ? 'asset-row-active' : ''}`}
                onClick={() => setSelectedKey(key)}
              >
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-xs font-semibold">{key}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="panel-empty-state text-center text-xs">No entries yet.</div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-auto p-4">
        {selectedFieldMap ? (
          <div className="space-y-3">
            <div className="panel-section-title">
              Fields for <span className="text-[var(--text-primary)]">{selectedKey}</span>
            </div>
            {Object.entries(selectedFieldMap).map(([fieldName, fieldValue]) => (
              <div key={fieldName} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  type="text"
                  className="control-input h-9 text-xs"
                  value={fieldName}
                  onChange={(event) => {
                    const next: Record<string, string> = {}
                    for (const [key, value] of Object.entries(selectedFieldMap)) {
                      next[key === fieldName ? event.target.value : key] = value
                    }
                    if (selectedKey) {
                      updateFields({ ...fields, [selectedKey]: next })
                    }
                  }}
                  placeholder="Field name"
                />
                <input
                  type="text"
                  className="control-input h-9 text-xs"
                  value={fieldValue}
                  onChange={(event) => {
                    if (selectedKey) {
                      updateFields({ ...fields, [selectedKey]: { ...selectedFieldMap, [fieldName]: event.target.value } })
                    }
                  }}
                  placeholder="Value"
                />
                <button
                  type="button"
                  className="icon-button h-9 w-9 text-red-400"
                  onClick={() => {
                    const next = { ...selectedFieldMap }
                    delete next[fieldName]
                    if (selectedKey) {
                      updateFields({ ...fields, [selectedKey]: next })
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="control-button"
              onClick={() => {
                if (!selectedKey) {
                  return
                }
                const fieldName = `field${Object.keys(selectedFieldMap).length + 1}`
                updateFields({ ...fields, [selectedKey]: { ...selectedFieldMap, [fieldName]: '' } })
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Add field</span>
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <Database className="h-8 w-8 opacity-40" />
            <p className="text-xs">Select an entry to edit its fields.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TextOpsEditor({
  textOperations,
  updateTextOperations,
}: {
  textOperations: unknown[]
  updateTextOperations: (ops: unknown[]) => void
}) {
  const ops = textOperations as TextOperation[]

  function updateOp(index: number, patch: Partial<TextOperation>) {
    const next = [...ops]
    next[index] = { ...next[index]!, ...patch }
    updateTextOperations(next)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="panel-section-title">TextOperations ({ops.length})</span>
        <button
          type="button"
          className="control-button"
          onClick={() => updateTextOperations([...ops, { operation: 'Append', target: ['Entries', ''], value: '' }])}
        >
          <Plus className="h-4 w-4" />
          <span>Add operation</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {ops.length ? (
          <div className="grid gap-3">
            {ops.map((op, index) => (
              <div key={index} className="panel-list-card">
                <div className="mb-3 flex items-center gap-2">
                  <select
                    className="control-input h-9 w-auto text-xs"
                    value={op.operation}
                    onChange={(event) => updateOp(index, { operation: event.target.value as TextOperation['operation'] })}
                  >
                    <option value="Append">Append</option>
                    <option value="Prepend">Prepend</option>
                    <option value="ReplaceDelimited">ReplaceDelimited</option>
                    <option value="RemoveDelimited">RemoveDelimited</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button h-8 w-8 text-red-400"
                    onClick={() => updateTextOperations(ops.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase">
                    Target
                    <input
                      type="text"
                      className="control-input h-9 text-xs tracking-normal normal-case"
                      value={op.target.join(', ')}
                      onChange={(event) => {
                        const parts = event.target.value
                          .split(',')
                          .map((part) => part.trim())
                          .filter(Boolean)
                        updateOp(index, { target: parts.length ? parts : [''] })
                      }}
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase">
                    Delimiter
                    <input
                      type="text"
                      className="control-input h-9 text-xs tracking-normal normal-case"
                      value={op.delimiter ?? ''}
                      onChange={(event) => updateOp(index, { delimiter: event.target.value || undefined })}
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase md:col-span-2">
                    {op.operation === 'RemoveDelimited' ? 'Value to remove' : 'Value'}
                    <input
                      type="text"
                      className="control-input h-9 text-xs tracking-normal normal-case"
                      value={op.value}
                      onChange={(event) => updateOp(index, { value: event.target.value })}
                    />
                  </label>
                  {op.operation === 'ReplaceDelimited' || op.operation === 'RemoveDelimited' ? (
                    <>
                      <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase">
                        Search
                        <input
                          type="text"
                          className="control-input h-9 text-xs tracking-normal normal-case"
                          value={op.search ?? ''}
                          onChange={(event) => updateOp(index, { search: event.target.value || undefined })}
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase">
                        ReplaceMode
                        <select
                          className="control-input h-9 text-xs tracking-normal normal-case"
                          value={op.replaceMode ?? 'First'}
                          onChange={(event) => updateOp(index, { replaceMode: event.target.value as 'First' | 'All' })}
                        >
                          <option value="First">First</option>
                          <option value="All">All</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty-state flex h-full items-center justify-center text-center text-xs">
            TextOperations let you append, prepend, replace, or remove delimited text inside data entries.
          </div>
        )}
      </div>
    </div>
  )
}

function MoveEntriesEditor({
  moveEntries,
  updateMoveEntries,
}: {
  moveEntries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>
  updateMoveEntries: (entries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) => void
}) {
  function updateEntry(index: number, updates: Partial<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) {
    const next = [...moveEntries]
    next[index] = { ...next[index]!, ...updates }
    for (const key of ['beforeId', 'afterId', 'toPosition'] as const) {
      if (updates[key] === '') {
        delete next[index]![key]
      }
    }
    updateMoveEntries(next)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="panel-section-title">MoveEntries ({moveEntries.length})</span>
        <button type="button" className="control-button" onClick={() => updateMoveEntries([...moveEntries, { id: '' }])}>
          <Plus className="h-4 w-4" />
          <span>Add entry</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {moveEntries.length ? (
          <div className="grid gap-3">
            {moveEntries.map((entry, index) => (
              <div key={index} className="panel-list-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="panel-section-title">#{index + 1}</span>
                  <button
                    type="button"
                    className="icon-button h-8 w-8 text-red-400"
                    onClick={() => updateMoveEntries(moveEntries.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <MoveEntryInput label="ID" value={entry.id} onChange={(value) => updateEntry(index, { id: value })} />
                  <MoveEntryInput
                    label="ToPosition"
                    value={entry.toPosition ?? ''}
                    onChange={(value) => updateEntry(index, { toPosition: value || undefined })}
                  />
                  <MoveEntryInput
                    label="BeforeId"
                    value={entry.beforeId ?? ''}
                    onChange={(value) => updateEntry(index, { beforeId: value || undefined })}
                  />
                  <MoveEntryInput
                    label="AfterId"
                    value={entry.afterId ?? ''}
                    onChange={(value) => updateEntry(index, { afterId: value || undefined })}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty-state flex h-full items-center justify-center text-center text-xs">
            MoveEntries can reorder entries by ID, BeforeId, AfterId, or ToPosition.
          </div>
        )}
      </div>
    </div>
  )
}

function MoveEntryInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[10px] tracking-wider text-[var(--text-secondary)] uppercase">
      {label}
      <input
        type="text"
        className="control-input h-9 text-xs tracking-normal normal-case"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
