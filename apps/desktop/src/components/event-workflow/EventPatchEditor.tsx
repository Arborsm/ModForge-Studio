import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, FileText, Database, ListTree, Text,
  Map,
} from 'lucide-react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { parseEventCommands, parseEventCommand, parseEventSceneSetup } from '../../lib/events/parser'
import { serializeRaw } from '../../lib/events/rawSerializer'
import { getSchema } from '../../lib/events/commandSchemaRegistry'
import type { EventScript, EventSceneSetup } from '../../lib/events/types'
import { EventStagePreview } from './EventStagePreview'
import { SceneSetupBar } from './SceneSetupBar'
import { EventSelector } from './EventSelector'
import { ScriptEditor } from './ScriptEditor'
import { PickModeOverlay } from './PickModeOverlay'
import { useEditorStore } from '../../lib/events/editorStore'

// TODO: Support TextOperations (Append/Prepend/ReplaceDelimited) for event script editing
// TODO: Support Fork condition editing in a more visual way

interface EventPatchEditorProps {
  patch: DraftPatch
  draft: GeneratedProjectDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  gameRootPath?: string | null
}

export function EventPatchEditor({ patch, draft, onPatchChange, onAddVirtualAsset, locale, theme, accentColor, viewportLabels, gameRootPath: externalGameRootPath }: EventPatchEditorProps) {
  void onAddVirtualAsset
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, unknown> | undefined) ?? {}
  const fields = (editorState['fields'] as Record<string, Record<string, string>> | undefined) ?? {}
  const moveEntries = (editorState['moveEntries'] as Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }> | undefined) ?? []

  // Prefer external gameRootPath (from app-level scan), fallback to draft metadata
  const gameRootPath = externalGameRootPath ?? draft.projectMetadata.gameRootPath ?? null

  // Original event scripts from scanned game data (read-only reference)
  const eventSnapshot = draft.eventSourceSnapshotsByTarget[patch.target]
  const originalScripts = eventSnapshot?.rawScriptsByKey ?? {}

  type EditorTab = 'events' | 'fields' | 'textops' | 'moveentries'
  const [activeTab, setActiveTab] = useState<EditorTab>('events')

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

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

  function updateCommand(index: number, newRaw: string) {
    if (!selectedKey) return
    const selectedEntry = entries[selectedKey]
    if (typeof selectedEntry !== 'string') return
    const segments = parseEventCommands(selectedEntry)
    segments[index + 3] = newRaw
    const newScript = segments.join('/')
    updateEntries({ ...entries, [selectedKey]: newScript })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">{patch.target}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">({patch.action})</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-[var(--bg-panel-muted)] p-0.5">
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'events'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('events'); setSelectedKey(null) }}
          >
            <ListTree className="h-3 w-3" /> Events
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'fields'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('fields'); setSelectedKey(null) }}
          >
            <Database className="h-3 w-3" /> Fields
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'textops'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('textops'); setSelectedKey(null) }}
          >
            <Text className="h-3 w-3" /> TextOps
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'moveentries'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('moveentries'); setSelectedKey(null) }}
          >
            <FileText className="h-3 w-3" /> MoveEntries
          </button>
        </div>
      </div>

      {/* TargetField */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-1.5">
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">TargetField</span>
        <input
          type="text"
          placeholder="e.g. Emily, Appearance (comma-separated path segments)"
          className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          value={patch.targetField?.join(', ') ?? ''}
          onChange={(e) => {
            const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            onPatchChange(patch.id, { targetField: parts.length > 0 ? parts : undefined })
          }}
        />
      </div>

      {activeTab === 'events' ? (
        <EventsEditor
          entries={entries}
          originalScripts={originalScripts}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
          patchTarget={patch.target}
          gameRootPath={gameRootPath}
          locale={locale}
          theme={theme}
          accentColor={accentColor}
          viewportLabels={viewportLabels}
        />
      ) : activeTab === 'fields' ? (
        <FieldsEditor
          fields={fields}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          updateFields={updateFields}
        />
      ) : activeTab === 'textops' ? (
        <TextOpsEditor
          textOperations={(editorState['textOperations'] as unknown[] | undefined) ?? []}
          updateTextOperations={updateTextOperations}
        />
      ) : (
        <MoveEntriesEditor
          moveEntries={moveEntries}
          updateMoveEntries={updateMoveEntries}
        />
      )}
    </div>
  )
}

// ─── Events Sub-Editor ───────────────────────────────────────────────────

function EventsEditor({
  entries,
  originalScripts,
  selectedKey,
  setSelectedKey,
  updateEntries,
  updateCommand,
  patchTarget,
  gameRootPath,
  locale,
  theme,
  accentColor,
  viewportLabels,
}: {
  entries: Record<string, unknown>
  originalScripts: Record<string, string>
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  updateEntries: (e: Record<string, unknown>) => void
  updateCommand: (index: number, newRaw: string) => void
  patchTarget: string
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
}) {
  const entryList = Object.entries(entries)
  const selectedEntry = selectedKey ? entries[selectedKey] ?? null : null
  const selectedEntryString = typeof selectedEntry === 'string' ? selectedEntry : null

  const parsedEvent = useMemo(() => {
    if (selectedEntryString === null) return null
    const segments = parseEventCommands(selectedEntryString)
    const scene = parseEventSceneSetup(segments)
    const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
    return { scene, commands, segments }
  }, [selectedEntryString])

  const eventScript: EventScript | null = useMemo(() => {
    if (!parsedEvent || !selectedKey || selectedEntryString === null) return null
    return {
      key: selectedKey,
      eventId: selectedKey,
      preconditions: [],
      rawScript: selectedEntryString,
      rawSegments: parsedEvent.segments,
      scene: parsedEvent.scene,
      commands: parsedEvent.commands,
    }
  }, [parsedEvent, selectedKey, selectedEntryString])

  const mapName = useMemo(() => {
    const parts = patchTarget.split('/')
    return parts[parts.length - 1] ?? null
  }, [patchTarget])

  const [pickingActorIndex, setPickingActorIndex] = useState<number | null>(null)

  function ensureSegmentPadding(segments: string[]): string[] {
    const result = [...segments]
    while (result.length < 3) {
      result.push('')
    }
    return result
  }

  const isPickMode = useEditorStore((s) => s.isPickMode)

  // Reset store when switching events
  useEffect(() => {
    useEditorStore.getState().reset()
  }, [selectedKey])

  // ESC to cancel pick mode
  useEffect(() => {
    if (!isPickMode && pickingActorIndex === null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useEditorStore.getState().setPickModeTarget(null)
        setPickingActorIndex(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isPickMode, pickingActorIndex])

  function handleScriptChange(nextScript: EventScript) {
    if (!selectedKey) return
    updateEntries({ ...entries, [selectedKey]: nextScript.rawScript })
  }

  function handleSceneChange(nextScene: EventSceneSetup) {
    if (!selectedKey || !parsedEvent) return
    const actorSegment = nextScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
    const newSegments = ensureSegmentPadding([nextScene.musicCue ?? '', nextScene.cameraInstruction ?? '', actorSegment, ...parsedEvent.segments.slice(3)])
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
  }

  function handleTileClick(tileX: number, tileY: number) {
    const state = useEditorStore.getState()
    if (state.isPickMode) {
      const target = state.pickModeTarget
      if (target != null) {
        const cmd = parsedEvent?.commands[target.commandIndex]
        if (cmd) {
          const nextArgs = [...cmd.args]
          nextArgs[target.paramIndex] = `${tileX}`
          if (target.controlType === 'tile_picker') {
            // Only fill adjacent Y if the schema says the next param is also a tile_picker
            const schema = getSchema(cmd.command)
            const nextParam = schema?.template.find(
              (t): t is { type: 'param'; index: number; ui: 'tile_picker' } =>
                t.type === 'param' && t.index === target.paramIndex + 1 && t.ui === 'tile_picker',
            )
            if (nextParam && nextArgs[target.paramIndex + 1] != null) {
              nextArgs[target.paramIndex + 1] = `${tileY}`
            }
          }
          const raw = serializeRaw(nextArgs)
          updateCommand(target.commandIndex, raw)
        }
        state.setPickModeTarget(null)
        return
      }
    }
    if (pickingActorIndex === null || !parsedEvent || !selectedKey) return
    const newActors = parsedEvent.scene.actors.map((a, i) => (i === pickingActorIndex ? { ...a, tileX, tileY } : a))
    handleSceneChange({ ...parsedEvent.scene, actors: newActors })
    setPickingActorIndex(null)
  }

  function handleContextMenuAction(action: 'addActor' | 'setCamera' | 'addWarp', tileX: number, tileY: number) {
    if (!selectedKey || !parsedEvent) return
    switch (action) {
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

  const eventSelectorOptions = entryList.map(([key]) => ({
    key,
    isModified: originalScripts[key] != null && originalScripts[key] !== entries[key],
  }))

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: Stage (70%) */}
      <div className="flex min-w-0 flex-[7] flex-col border-r border-[var(--border-color)]">
        {/* Event Selector + Scene Bar */}
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2"
        >
          <EventSelector
            events={eventSelectorOptions}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            locale={locale}
            className="w-56 shrink-0"
          />
          {parsedEvent && (
            <SceneSetupBar
              scene={parsedEvent.scene}
              locale={locale}
              pickMode={pickingActorIndex !== null || isPickMode}
              pickingActorIndex={pickingActorIndex}
              onPickModeToggle={() => {
                if (isPickMode) useEditorStore.getState().setPickModeTarget(null)
                setPickingActorIndex((prev) => (prev !== null ? null : 0))
              }}
              onPickActor={(idx) => {
                if (isPickMode) useEditorStore.getState().setPickModeTarget(null)
                setPickingActorIndex(idx)
              }}
              onSceneChange={handleSceneChange}
              className="flex-1 border-0"
            />
          )}
        </div>

        {/* Stage Preview */}
        <div className="relative min-h-0 flex-1"
        >
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
              additionalViewportOverlay={
                <PickModeOverlay
                  active={isPickMode || pickingActorIndex !== null}
                  label={
                    isPickMode
                      ? '点击地图选择坐标'
                      : pickingActorIndex !== null
                        ? '点击地图选择角色位置'
                        : undefined
                  }
                />
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]"
            >
              <Map className="h-8 w-8 opacity-40" />
              <p className="text-xs">选择一个事件来预览舞台。</p>
              {gameRootPath ? null : (
                <p className="text-[10px]">配置游戏根目录以显示地图预览。</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Script Editor (30%) */}
      <div className="flex min-w-0 flex-[3] flex-col"
      >
        <ScriptEditor
          script={eventScript}
          locale={locale}
          onScriptChange={handleScriptChange}
          className="h-full"
        />
      </div>
    </div>
  )
}

// ─── Fields Sub-Editor ───────────────────────────────────────────────────

function FieldsEditor({
  fields,
  selectedKey,
  setSelectedKey,
  updateFields,
}: {
  fields: Record<string, Record<string, string>>
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  updateFields: (f: Record<string, Record<string, string>>) => void
}) {
  const entryList = Object.entries(fields)
  const selectedFieldMap = selectedKey ? fields[selectedKey] ?? null : null

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: Entry Key List */}
      <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
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

        <div className="flex-1 overflow-auto py-1">
          {entryList.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
              No entries yet.
              <br />
              Click + to add one.
            </div>
          ) : (
            entryList.map(([key]) => (
              <button
                key={key}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  selectedKey === key
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => setSelectedKey(key)}
              >
                <Database className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{key}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Field Editor */}
      <div className="min-w-0 flex-1 overflow-auto p-3">
        {selectedFieldMap ? (
          <div className="space-y-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Fields for entry: <span className="text-[var(--text-primary)]">{selectedKey}</span>
            </div>

            <div className="space-y-2">
              {Object.entries(selectedFieldMap).map(([fieldName, fieldValue]) => (
                <div key={fieldName} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Field name (e.g. Price)"
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={fieldName}
                    onChange={(e) => {
                      const newMap: Record<string, string> = {}
                      for (const [k, v] of Object.entries(selectedFieldMap)) {
                        if (k === fieldName) {
                          newMap[e.target.value] = v
                        } else {
                          newMap[k] = v
                        }
                      }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={fieldValue}
                    onChange={(e) => {
                      const newMap = { ...selectedFieldMap, [fieldName]: e.target.value }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button h-7 w-7 shrink-0 text-red-400"
                    onClick={() => {
                      const newMap: Record<string, string> = {}
                      for (const [k, v] of Object.entries(selectedFieldMap)) {
                        if (k !== fieldName) newMap[k] = v
                      }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              onClick={() => {
                if (!selectedKey) return
                const newFieldName = `field${Object.keys(selectedFieldMap).length + 1}`
                updateFields({ ...fields, [selectedKey]: { ...selectedFieldMap, [newFieldName]: '' } })
              }}
            >
              <Plus className="h-3 w-3" /> Add field
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <Database className="h-8 w-8 opacity-40" />
            <p className="text-xs">Select an entry from the left to edit its fields.</p>
            <p className="text-[10px]">Fields let you modify specific columns within a data entry.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TextOps Sub-Editor ──────────────────────────────────────────────────

interface TextOperation {
  operation: 'Append' | 'Prepend' | 'ReplaceDelimited' | 'RemoveDelimited'
  target: string[]
  value: string
  search?: string
  delimiter?: string
  replaceMode?: 'First' | 'All'
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

  function addOp() {
    updateTextOperations([
      ...ops,
      { operation: 'Append', target: ['Entries', ''], value: '' },
    ])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          TextOperations ({ops.length})
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
          onClick={addOp}
        >
          <Plus className="h-3 w-3" /> Add operation
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {ops.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <Text className="h-8 w-8 opacity-40" />
            <p className="text-xs">No text operations yet.</p>
            <p className="max-w-xs text-center text-[10px]">
              TextOperations let you Append, Prepend, ReplaceDelimited, or RemoveDelimited
              text within data entries (e.g. adding items to NPCGiftTastes).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ops.map((op, index) => (
              <div
                key={index}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <select
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={op.operation}
                    onChange={(e) =>
                      updateOp(index, { operation: e.target.value as TextOperation['operation'] })
                    }
                  >
                    <option value="Append">Append</option>
                    <option value="Prepend">Prepend</option>
                    <option value="ReplaceDelimited">ReplaceDelimited</option>
                    <option value="RemoveDelimited">RemoveDelimited</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-red-400"
                    onClick={() =>
                      updateTextOperations(ops.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                      Target (comma-separated path)
                    </label>
                    <input
                      type="text"
                      placeholder="Entries, Universal_Love"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={op.target.join(', ')}
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                        updateOp(index, { target: parts.length > 0 ? parts : [''] })
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                      Delimiter
                    </label>
                    <input
                      type="text"
                      placeholder=" "
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={op.delimiter ?? ''}
                      onChange={(e) =>
                        updateOp(index, { delimiter: e.target.value || undefined })
                      }
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                    {op.operation === 'RemoveDelimited' ? 'Value to remove' : 'Value'}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={op.value}
                    onChange={(e) => updateOp(index, { value: e.target.value })}
                  />
                </div>

                {(op.operation === 'ReplaceDelimited' || op.operation === 'RemoveDelimited') && (
                  <>
                    <div className="mt-2">
                      <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                        Search
                      </label>
                      <input
                        type="text"
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={op.search ?? ''}
                        onChange={(e) =>
                          updateOp(index, { search: e.target.value || undefined })
                        }
                      />
                    </div>
                    <div className="mt-2">
                      <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                        ReplaceMode
                      </label>
                      <select
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={op.replaceMode ?? 'First'}
                        onChange={(e) =>
                          updateOp(index, { replaceMode: e.target.value as 'First' | 'All' })
                        }
                      >
                        <option value="First">First</option>
                        <option value="All">All</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MoveEntries Sub-Editor ──────────────────────────────────────────────

function MoveEntriesEditor({
  moveEntries,
  updateMoveEntries,
}: {
  moveEntries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>
  updateMoveEntries: (entries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) => void
}) {
  function addEntry() {
    updateMoveEntries([...moveEntries, { id: '' }])
  }

  function updateEntry(index: number, updates: Partial<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) {
    const next = [...moveEntries]
    next[index] = { ...next[index], ...updates }
    // Clean up empty optional fields
    if (updates.beforeId === '') delete (next[index] as Record<string, unknown>)['beforeId']
    if (updates.afterId === '') delete (next[index] as Record<string, unknown>)['afterId']
    if (updates.toPosition === '') delete (next[index] as Record<string, unknown>)['toPosition']
    updateMoveEntries(next)
  }

  function removeEntry(index: number) {
    updateMoveEntries(moveEntries.filter((_, i) => i !== index))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          MoveEntries ({moveEntries.length})
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
          onClick={addEntry}
        >
          <Plus className="h-3 w-3" /> Add entry
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {moveEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-xs">No move entries yet.</p>
            <p className="max-w-xs text-center text-[10px]">
              MoveEntries let you reorder entries in an EditData patch by specifying
              ID, BeforeId, AfterId, or ToPosition.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {moveEntries.map((entry, index) => (
              <div
                key={index}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-[var(--text-secondary)]">#{index + 1}</span>
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-red-400"
                    onClick={() => removeEntry(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">ID</label>
                    <input
                      type="text"
                      placeholder="Entry ID"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.id}
                      onChange={(e) => updateEntry(index, { id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">ToPosition</label>
                    <input
                      type="text"
                      placeholder="e.g. 5"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.toPosition ?? ''}
                      onChange={(e) => updateEntry(index, { toPosition: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">BeforeId</label>
                    <input
                      type="text"
                      placeholder="ID to insert before"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.beforeId ?? ''}
                      onChange={(e) => updateEntry(index, { beforeId: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">AfterId</label>
                    <input
                      type="text"
                      placeholder="ID to insert after"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.afterId ?? ''}
                      onChange={(e) => updateEntry(index, { afterId: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
