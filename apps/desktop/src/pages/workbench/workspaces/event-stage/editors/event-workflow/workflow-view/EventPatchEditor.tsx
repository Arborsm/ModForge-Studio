import { useEffect, useMemo, useState } from 'react'
import { Database, Map, Plus, Trash2 } from 'lucide-react'
import type { DraftPatch, CpMakerDraft } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { parseEventCommand, parseEventCommands, parseEventSceneSetup } from '@entities/event'
import { serializeRaw } from '../workflow-model/rawSerializer'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import type { EventScript, EventSceneSetup } from '@entities/event'
import { EventStagePreview } from './EventStagePreview'
import { PickModeOverlay } from './PickModeOverlay'
import { SceneSetupBar } from './SceneSetupBar'
import { ScriptEditor } from './ScriptEditor'
import { useEditorStore } from '../workflow-model/editorStore'
import { useEditorCopy } from '@locales/localeContext'
import { buildEventPatchHubPatches } from '@entities/event'
import { EventConditionBuilderModal, type EventConditionBuilderResult } from './EventConditionBuilderModal'

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
}: EventPatchEditorProps) {
  void onAddVirtualAsset
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, unknown> | undefined) ?? EMPTY_ENTRIES
  const fields = (editorState['fields'] as Record<string, Record<string, string>> | undefined) ?? {}
  const moveEntries = (editorState['moveEntries'] as Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }> | undefined) ?? []
  const gameRootPath = externalGameRootPath ?? draft.projectMetadata.gameRootPath ?? null
  const [conditionBuilderOpen, setConditionBuilderOpen] = useState(false)

  const activeTab: EditorTab = 'events'
  const entryKeys = useMemo(() => Object.keys(entries), [entries])
  const selectedKey = selectedEventKey && entries[selectedEventKey] != null ? selectedEventKey : entryKeys[0] ?? null
  const setSelectedKey: (key: string | null) => void = () => {}
  const hubPatch = useMemo(() => buildEventPatchHubPatches([patch])[0] ?? null, [patch])
  const conditionBuilderEvent = selectedKey ? hubPatch?.events.find((event) => event.key === selectedKey) ?? null : null
  const eventAliases = eventAliasesFromState(editorState)
  const conditionBuilderAlias = conditionBuilderEvent ? eventAliases[conditionBuilderEvent.key] ?? '' : ''

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

    const disabledKeys = Array.isArray(editorState['disabledEventKeys'])
      ? editorState['disabledEventKeys'].map((key) => key === selectedKey ? result.eventKey : key)
      : []
    onPatchChange(patch.id, {
      editorState: {
        ...editorState,
        entries: nextEntries,
        disabledEventKeys: disabledKeys,
        eventAliases: nextAliases,
      },
    })
    setConditionBuilderOpen(false)
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
      {activeTab === 'events' ? (
        <EventsEditor
          entries={entries}
          selectedKey={selectedKey}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
          patchTarget={patch.target}
          gameRootPath={gameRootPath}
          locale={locale}
          theme={theme}
          accentColor={accentColor}
          viewportLabels={viewportLabels}
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
    Object.entries(state['eventAliases'] as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function EventsEditor({
  entries,
  selectedKey,
  updateEntries,
  updateCommand,
  patchTarget,
  gameRootPath,
  locale,
  theme,
  accentColor,
  viewportLabels,
  conditionBuilderLabel,
  onOpenConditionBuilder,
}: {
  entries: Record<string, unknown>
  selectedKey: string | null
  updateEntries: (entries: Record<string, unknown>) => void
  updateCommand: (index: number, newRaw: string) => void
  patchTarget: string
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  conditionBuilderLabel: string
  onOpenConditionBuilder: () => void
}) {
  const selectedEntry = selectedKey ? entries[selectedKey] ?? null : null
  const selectedEntryString = typeof selectedEntry === 'string' ? selectedEntry : null
  const [pickingActorIndex, setPickingActorIndex] = useState<number | null>(null)
  const isPickMode = useEditorStore((state) => state.isPickMode)

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
    const parts = patchTarget.split('/')
    return parts[parts.length - 1] ?? null
  }, [patchTarget])

  useEffect(() => {
    useEditorStore.getState().reset()
  }, [selectedKey])

  useEffect(() => {
    if (!isPickMode && pickingActorIndex === null) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        useEditorStore.getState().setPickModeTarget(null)
        setPickingActorIndex(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isPickMode, pickingActorIndex])

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
    const actorSegment = nextScene.actors.map((actor) => `${actor.actorName} ${actor.tileX} ${actor.tileY} ${actor.facingDirection}`).join(' ')
    const newSegments = ensureSegmentPadding([nextScene.musicCue ?? '', nextScene.cameraInstruction ?? '', actorSegment, ...parsedEvent.segments.slice(3)])
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
  }

  function handleTileClick(tileX: number, tileY: number) {
    const state = useEditorStore.getState()
    if (state.isPickMode) {
      const target = state.pickModeTarget
      if (target != null) {
        const command = parsedEvent?.commands[target.commandIndex]
        if (command) {
          const nextArgs = [...command.args]
          nextArgs[target.paramIndex] = `${tileX}`
          if (target.controlType === 'tile_picker') {
            const schema = getSchema(command.command)
            const nextParam = schema?.template.find(
              (template): template is { type: 'param'; index: number; ui: 'tile_picker' } =>
                template.type === 'param' && template.index === target.paramIndex + 1 && template.ui === 'tile_picker',
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

    if (pickingActorIndex === null || !parsedEvent || !selectedKey) {
      return
    }
    const newActors = parsedEvent.scene.actors.map((actor, index) =>
      index === pickingActorIndex ? { ...actor, tileX, tileY } : actor,
    )
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
            <SceneSetupBar
              scene={parsedEvent.scene}
              locale={locale}
              pickMode={pickingActorIndex !== null || isPickMode}
              pickingActorIndex={pickingActorIndex}
              onPickModeToggle={() => {
                if (isPickMode) {
                  useEditorStore.getState().setPickModeTarget(null)
                }
                setPickingActorIndex((current) => (current !== null ? null : 0))
              }}
              onPickActor={(index) => {
                if (isPickMode) {
                  useEditorStore.getState().setPickModeTarget(null)
                }
                setPickingActorIndex(index)
              }}
              onSceneChange={handleSceneChange}
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
              className="h-full"
              hideHeader
              onTileClick={handleTileClick}
              onContextMenuAction={handleContextMenuAction}
              conditionBuilderLabel={conditionBuilderLabel}
              additionalViewportOverlay={
                <PickModeOverlay
                  active={isPickMode || pickingActorIndex !== null}
                  label={isPickMode ? 'Click the map to choose coordinates' : pickingActorIndex !== null ? 'Click the map to place the actor' : undefined}
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
        <ScriptEditor script={eventScript} locale={locale} onScriptChange={handleScriptChange} className="h-full" />
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
  const selectedFieldMap = selectedKey ? fields[selectedKey] ?? null : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
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
                  <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Target
                    <input
                      type="text"
                      className="control-input h-9 text-xs normal-case tracking-normal"
                      value={op.target.join(', ')}
                      onChange={(event) => {
                        const parts = event.target.value.split(',').map((part) => part.trim()).filter(Boolean)
                        updateOp(index, { target: parts.length ? parts : [''] })
                      }}
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Delimiter
                    <input
                      type="text"
                      className="control-input h-9 text-xs normal-case tracking-normal"
                      value={op.delimiter ?? ''}
                      onChange={(event) => updateOp(index, { delimiter: event.target.value || undefined })}
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] md:col-span-2">
                    {op.operation === 'RemoveDelimited' ? 'Value to remove' : 'Value'}
                    <input
                      type="text"
                      className="control-input h-9 text-xs normal-case tracking-normal"
                      value={op.value}
                      onChange={(event) => updateOp(index, { value: event.target.value })}
                    />
                  </label>
                  {(op.operation === 'ReplaceDelimited' || op.operation === 'RemoveDelimited') ? (
                    <>
                      <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                        Search
                        <input
                          type="text"
                          className="control-input h-9 text-xs normal-case tracking-normal"
                          value={op.search ?? ''}
                          onChange={(event) => updateOp(index, { search: event.target.value || undefined })}
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                        ReplaceMode
                        <select
                          className="control-input h-9 text-xs normal-case tracking-normal"
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
                  <MoveEntryInput label="ToPosition" value={entry.toPosition ?? ''} onChange={(value) => updateEntry(index, { toPosition: value || undefined })} />
                  <MoveEntryInput label="BeforeId" value={entry.beforeId ?? ''} onChange={(value) => updateEntry(index, { beforeId: value || undefined })} />
                  <MoveEntryInput label="AfterId" value={entry.afterId ?? ''} onChange={(value) => updateEntry(index, { afterId: value || undefined })} />
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
    <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
      {label}
      <input
        type="text"
        className="control-input h-9 text-xs normal-case tracking-normal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
