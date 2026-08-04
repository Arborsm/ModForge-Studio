import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'
import type { EditorProps } from '@features/cp-maker'
import type { ThemeMode } from '@locales/api'
import { parseEventCommands } from '@entities/event'
import type { EventStagePreviewAssetLoader } from './EventStagePreview'
import { useEditorCopy } from '@locales/provider'
import { buildEventPatchHubPatches, warmEventEditorResources } from '@entities/event'
import { EventConditionBuilderModal, type EventConditionBuilderResult } from './EventConditionBuilderModal'
import { rgbaFromHex } from '@shared/lib/color'
import { EVENT_SCENARIO_PRESETS, type EventScenarioPreset } from '../workflow-model/eventScenarioPresets'
import {
  eventAliasesFromState,
  eventLocationsFromState,
  buildPresetScript,
  getLocationFromTarget,
  getEventIdFromKey,
  removeEntriesWithEventId,
  createUniqueEventKey,
} from '../workflow-model/eventEditorHelpers'
import EventsEditor from './EventsEditor'

const EMPTY_ENTRIES: Record<string, unknown> = {}

/** Editor contract plus a preview asset loader the dev harness can inject. */
type EventPatchEditorProps = EditorProps & {
  assetLoader?: EventStagePreviewAssetLoader
}

function eventShellStyle(theme: ThemeMode, accentColor: string): CSSProperties | undefined {
  if (!accentColor) {
    return undefined
  }

  const accentSoft = rgbaFromHex(accentColor, theme === 'dark' ? 0.18 : 0.14)
  const activeSurface = rgbaFromHex(accentColor, theme === 'dark' ? 0.22 : 0.12)
  return {
    '--color-accent': accentColor,
    '--accent': accentColor,
    '--accent-soft': accentSoft,
    '--surface-active': activeSurface,
    '--bg-active': activeSurface,
  } as CSSProperties
}

export function EventPatchEditor({ patch, draftPort, resources, assetLoader }: EventPatchEditorProps) {
  const { draft, updatePatch: onPatchChange, selectedEntryKey: selectedEventKey, selectEntry: onSelectedEventKeyChange } = draftPort
  const { openConfig: onOpenConfig, commit: onSaveDraft, revert: onReloadDraft } = draftPort
  const { locale, theme, accentColor, directoryInfo, playerAppearanceProfile, onOpenPlayerAppearanceWindow } = resources
  const externalGameRootPath = resources.gameRootPath
  const isDirty = draftPort.isDirty()
  const editorCopy = useEditorCopy()
  const viewportLabels = editorCopy.viewportLabels
  const hubCopy = editorCopy.studioDesk.eventPatchHub
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, unknown> | undefined) ?? EMPTY_ENTRIES
  const gameRootPath = externalGameRootPath ?? draft.projectMetadata.gameRootPath ?? null
  const [conditionBuilderOpen, setConditionBuilderOpen] = useState(false)
  const [localSelectedKey, setLocalSelectedKey] = useState<string | null>(null)
  const [preparedPatchId, setPreparedPatchId] = useState<string | null>(null)

  // Entry gate: pre-warm the shared caches (script analysis, resource
  // registry, item catalog) behind a loading state instead of letting the
  // editor freeze and pop in progressively. Cached loads make re-entry instant.
  useEffect(() => {
    let cancelled = false
    const warm = gameRootPath ? warmEventEditorResources(gameRootPath, locale ?? 'zh-CN') : Promise.resolve([])
    void warm.then(() => {
      if (!cancelled) {
        setPreparedPatchId(patch.id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [patch.id, gameRootPath, locale])
  const prepared = preparedPatchId === patch.id

  const entryKeys = useMemo(() => Object.keys(entries), [entries])
  const selectedKey =
    localSelectedKey && entries[localSelectedKey] != null
      ? localSelectedKey
      : selectedEventKey && entries[selectedEventKey] != null
        ? selectedEventKey
        : (entryKeys[0] ?? null)
  const setSelectedKey = setLocalSelectedKey

  useEffect(() => {
    onSelectedEventKeyChange?.(selectedKey)
  }, [onSelectedEventKeyChange, selectedKey])

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

  function addBlankEvent() {
    const location = activeLocation || 'Town'
    const suffix = Object.keys(entries).length + 1
    const key = createUniqueEventKey(entries, suffix)
    const script = 'spring2/12 12/farmer 12 14 0/skippable/end dialogue'
    const nextAliases = { ...eventAliasesFromState(editorState), [key]: hubCopy.untitledEventAlias(location, suffix) }
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
    <div className={theme === 'dark' ? 'event-edit-shell dark' : 'event-edit-shell'} style={eventShellStyle(theme, accentColor)}>
      {!prepared ? (
        <div className="event-editor-preparing" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>{hubCopy.preparingEditor}</span>
        </div>
      ) : (
        <EventsEditor
          entries={entries}
          selectedKey={selectedKey}
          onSelectEvent={setSelectedKey}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
          patch={patch}
          draftPatches={draft.patches}
          presets={EVENT_SCENARIO_PRESETS}
          eventAliases={eventAliases}
          eventLocations={eventLocations}
          activeLocation={activeLocation}
          onAddBlankEvent={addBlankEvent}
          onApplyPreset={applyScenarioPreset}
          gameRootPath={gameRootPath}
          locale={locale}
          theme={theme}
          accentColor={accentColor}
          viewportLabels={viewportLabels}
          assetLoader={assetLoader}
          directoryInfo={directoryInfo}
          playerAppearanceProfile={playerAppearanceProfile}
          onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
          conditionBuilderLabel={hubCopy.conditionBuilderAction}
          onOpenConditionBuilder={() => setConditionBuilderOpen(true)}
          onOpenConfig={onOpenConfig}
          onSaveDraft={onSaveDraft}
          onReloadDraft={onReloadDraft}
          onUndo={() => void draftPort.undo()}
          onRedo={() => void draftPort.redo()}
          isDirty={isDirty}
        />
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
