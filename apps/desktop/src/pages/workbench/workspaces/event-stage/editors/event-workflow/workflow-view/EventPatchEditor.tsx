import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Database, Plus, Trash2 } from 'lucide-react'
import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import { parseEventCommands, type PlayerAppearanceProfile } from '@entities/event'
import type { EventStagePreviewAssetLoader } from './EventStagePreview'
import { useEditorCopy, useLocale } from '@locales/provider'
import { buildEventPatchHubPatches } from '@entities/event'
import { EventConditionBuilderModal, type EventConditionBuilderResult } from './EventConditionBuilderModal'
import { rgbaFromHex } from '@shared/lib/color'
import { EVENT_SCENARIO_PRESETS, type EventScenarioPreset } from '../workflow-model/eventScenarioPresets'
import type { TextOperation } from '../workflow-model/eventComposerCopy'
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

type EditorTab = 'events' | 'fields' | 'textops' | 'moveentries'

const EMPTY_ENTRIES: Record<string, unknown> = {}

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
  onSelectedEventKeyChange?: (eventKey: string | null) => void
  onOpenConfig?: () => void
  onSaveDraft?: () => void
  onReloadDraft?: () => void
  isDirty?: boolean
  assetLoader?: EventStagePreviewAssetLoader
}

function eventShellStyle(theme: ThemeMode | undefined, accentColor: string | undefined): CSSProperties | undefined {
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
  onSelectedEventKeyChange,
  onOpenConfig,
  onSaveDraft,
  onReloadDraft,
  isDirty = false,
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
    <div className={theme === 'dark' ? 'event-edit-shell dark' : 'event-edit-shell'} style={eventShellStyle(theme, accentColor)}>
      {activeTab === 'events' ? (
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
          onOpenConfig={onOpenConfig}
          onSaveDraft={onSaveDraft}
          onReloadDraft={onReloadDraft}
          isDirty={isDirty}
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
      <div className="flex w-64 shrink-0 flex-col border-r border-(--border-color) bg-(--bg-panel)">
        <div className="flex items-center justify-between border-b border-(--border-color) px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">Entries ({entryList.length})</span>
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
              Fields for <span className="text-(--text-primary)">{selectedKey}</span>
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
          <div className="flex h-full flex-col items-center justify-center gap-2 text-(--text-secondary)">
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
      <div className="flex items-center justify-between border-b border-(--border-color) px-3 py-2">
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
                  <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase">
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
                  <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase">
                    Delimiter
                    <input
                      type="text"
                      className="control-input h-9 text-xs tracking-normal normal-case"
                      value={op.delimiter ?? ''}
                      onChange={(event) => updateOp(index, { delimiter: event.target.value || undefined })}
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase md:col-span-2">
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
                      <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase">
                        Search
                        <input
                          type="text"
                          className="control-input h-9 text-xs tracking-normal normal-case"
                          value={op.search ?? ''}
                          onChange={(event) => updateOp(index, { search: event.target.value || undefined })}
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase">
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
      <div className="flex items-center justify-between border-b border-(--border-color) px-3 py-2">
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
    <label className="grid gap-1 text-[10px] tracking-wider text-(--text-secondary) uppercase">
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
