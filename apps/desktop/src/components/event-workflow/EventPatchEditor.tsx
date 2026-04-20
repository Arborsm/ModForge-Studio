import { useMemo, useState } from 'react'
import { Plus, Trash2, FileText, ChevronDown, ChevronRight, Database, ListTree, Text } from 'lucide-react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import { parseEventCommands, parseEventCommand, parseEventSceneSetup } from '../../lib/events/parser'
import type { EventCommand } from '../../lib/events/types'

// TODO: Support TextOperations (Append/Prepend/ReplaceDelimited) for event script editing
// TODO: Support Fork condition editing in a more visual way

interface EventPatchEditorProps {
  patch: DraftPatch
  draft: GeneratedProjectDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
}

export function EventPatchEditor({ patch, draft, onPatchChange, onAddVirtualAsset }: EventPatchEditorProps) {
  void draft
  void onAddVirtualAsset
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, string> | undefined) ?? {}
  const fields = (editorState['fields'] as Record<string, Record<string, string>> | undefined) ?? {}

  type EditorTab = 'events' | 'fields' | 'textops'
  const [activeTab, setActiveTab] = useState<EditorTab>('events')

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [expandedCmds, setExpandedCmds] = useState<Set<string>>(new Set())

  function updateEntries(newEntries: Record<string, string>) {
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

  function updateCommand(index: number, newRaw: string) {
    if (!selectedKey) return
    const selectedEntry = entries[selectedKey]
    if (!selectedEntry) return
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
            onClick={() => { setActiveTab('events'); setSelectedKey(null); setExpandedCmds(new Set()) }}
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
            onClick={() => { setActiveTab('fields'); setSelectedKey(null); setExpandedCmds(new Set()) }}
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
            onClick={() => { setActiveTab('textops'); setSelectedKey(null); setExpandedCmds(new Set()) }}
          >
            <Text className="h-3 w-3" /> TextOps
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
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          expandedCmds={expandedCmds}
          setExpandedCmds={setExpandedCmds}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
        />
      ) : activeTab === 'fields' ? (
        <FieldsEditor
          fields={fields}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          updateFields={updateFields}
        />
      ) : (
        <TextOpsEditor
          textOperations={(editorState['textOperations'] as unknown[] | undefined) ?? []}
          updateTextOperations={updateTextOperations}
        />
      )}
    </div>
  )
}

// ─── Events Sub-Editor ───────────────────────────────────────────────────

function EventsEditor({
  entries,
  selectedKey,
  setSelectedKey,
  expandedCmds,
  setExpandedCmds,
  updateEntries,
  updateCommand,
}: {
  entries: Record<string, string>
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  expandedCmds: Set<string>
  setExpandedCmds: React.Dispatch<React.SetStateAction<Set<string>>>
  updateEntries: (e: Record<string, string>) => void
  updateCommand: (index: number, newRaw: string) => void
}) {
  const entryList = Object.entries(entries)
  const selectedEntry = selectedKey ? entries[selectedKey] ?? null : null

  const parsedEvent = useMemo(() => {
    if (!selectedEntry) return null
    const segments = parseEventCommands(selectedEntry)
    const scene = parseEventSceneSetup(segments)
    const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
    return { scene, commands, segments }
  }, [selectedEntry])

  function toggleCommandExpand(cmdId: string) {
    setExpandedCmds((prev) => {
      const next = new Set(prev)
      if (next.has(cmdId)) {
        next.delete(cmdId)
      } else {
        next.add(cmdId)
      }
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: Entry List */}
      <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Events ({entryList.length})
          </span>
          <button
            type="button"
            className="icon-button h-6 w-6"
            onClick={() => {
              const newKey = `newEvent${entryList.length + 1}`
              updateEntries({ ...entries, [newKey]: '' })
              setSelectedKey(newKey)
            }}
            title="Add event"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {entryList.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
              No events yet.
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
                onClick={() => {
                  setSelectedKey(key)
                  setExpandedCmds(new Set())
                }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{key}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Event Editor */}
      <div className="min-w-0 flex-1 overflow-auto">
        {parsedEvent ? (
          <div className="space-y-3 p-3">
            {/* Scene Setup */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Scene Setup
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">Music</label>
                  <input
                    type="text"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={parsedEvent.scene.musicCue ?? ''}
                    onChange={(e) => {
                      const newScene = { ...parsedEvent.scene, musicCue: e.target.value || null }
                      const newSegments = [newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)]
                      if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                    }}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">Camera</label>
                  <input
                    type="text"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={parsedEvent.scene.cameraInstruction ?? ''}
                    onChange={(e) => {
                      const newScene = { ...parsedEvent.scene, cameraInstruction: e.target.value || null }
                      const newSegments = [newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)]
                      if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                    }}
                  />
                </div>
              </div>

              {/* Actors */}
              <div className="mt-2">
                <div className="mb-1 text-[9px] uppercase text-[var(--text-secondary)]">Actors ({parsedEvent.scene.actors.length})</div>
                <div className="space-y-1">
                  {parsedEvent.scene.actors.map((actor) => (
                    <div key={actor.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-medium text-[var(--text-primary)]">{actor.actorName}</span>
                      <span className="text-[var(--text-secondary)]">
                        ({actor.tileX}, {actor.tileY}) dir {actor.facingDirection}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Commands */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Commands ({parsedEvent.commands.length})
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
                  onClick={() => {
                    if (!selectedKey) return
                    const newSegments = [...parsedEvent.segments, 'pause 1000']
                    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                  }}
                >
                  <Plus className="h-3 w-3" /> Add command
                </button>
              </div>

              <div className="space-y-1.5">
                {parsedEvent.commands.map((cmd) => (
                  <EventCommandCard
                    key={cmd.id}
                    command={cmd}
                    expanded={expandedCmds.has(cmd.id)}
                    onToggle={() => toggleCommandExpand(cmd.id)}
                    onChange={(newRaw) => updateCommand(cmd.index, newRaw)}
                    onDelete={() => {
                      if (!selectedKey) return
                      const newSegments = parsedEvent.segments.filter((_, i) => i !== cmd.index + 3)
                      if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                      setExpandedCmds((prev) => {
                        const next = new Set(prev)
                        next.delete(cmd.id)
                        return next
                      })
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Raw Script (collapsible) */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Raw Script
              </div>
              <textarea
                className="h-32 w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-[10px] leading-4 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={selectedEntry ?? ''}
                onChange={(e) => {
                  if (!selectedKey) return
                  updateEntries({ ...entries, [selectedKey]: e.target.value })
                }}
                spellCheck={false}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-xs">Select an event from the left to edit.</p>
            <p className="text-[10px]">Or click + to add a new event entry.</p>
          </div>
        )}
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EventCommandCard({
  command,
  expanded,
  onToggle,
  onChange,
  onDelete,
}: {
  command: EventCommand
  expanded: boolean
  onToggle: () => void
  onChange: (newRaw: string) => void
  onDelete: () => void
}) {
  const kindColors: Record<EventCommand['kind'], string> = {
    dialogue: 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)]',
    message: 'border-[color-mix(in_srgb,var(--success)_45%,transparent)]',
    choice: 'border-[color-mix(in_srgb,var(--accent)_55%,transparent)]',
    branch: 'border-[color-mix(in_srgb,var(--danger)_42%,transparent)]',
    timing: 'border-[color-mix(in_srgb,var(--text-secondary)_38%,transparent)]',
    flow: 'border-[color-mix(in_srgb,var(--text-secondary)_38%,transparent)]',
    action: 'border-[var(--border-color)]',
  }

  const argFields = useMemo(() => {
    // Build editable fields based on command type
    const fields: Array<{ label: string; value: string; index: number }> = []
    const args = command.args

    switch (command.command) {
      case 'speak':
      case 'splitSpeak':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Text', value: args[2] ?? '', index: 2 })
        break
      case 'message':
        fields.push({ label: 'Text', value: args[1] ?? '', index: 1 })
        break
      case 'pause':
        fields.push({ label: 'Delay (ms)', value: args[1] ?? '0', index: 1 })
        break
      case 'move':
        // Show all args after command
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
        break
      case 'warp':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'X', value: args[2] ?? '', index: 2 })
        fields.push({ label: 'Y', value: args[3] ?? '', index: 3 })
        break
      case 'faceDirection':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Direction', value: args[2] ?? '', index: 2 })
        break
      case 'showFrame':
        if (args.length === 2) {
          fields.push({ label: 'Frame', value: args[1] ?? '', index: 1 })
        } else {
          fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
          fields.push({ label: 'Frame', value: args[2] ?? '', index: 2 })
        }
        break
      case 'viewport':
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
        break
      case 'question':
        fields.push({ label: 'Key', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Choices', value: args[2] ?? '', index: 2 })
        break
      case 'fork':
        if (args.length >= 3) {
          fields.push({ label: 'Condition', value: args[1] ?? '', index: 1 })
          fields.push({ label: 'Target', value: args[2] ?? '', index: 2 })
        } else {
          fields.push({ label: 'Target', value: args[1] ?? '', index: 1 })
        }
        break
      case 'switchEvent':
        fields.push({ label: 'Target', value: args[1] ?? '', index: 1 })
        break
      case 'end':
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
        break
      default:
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
    }

    return fields
  }, [command])

  function updateArg(index: number, newValue: string) {
    const newArgs = [...command.args]
    newArgs[index] = newValue
    // Rebuild raw string
    const newRaw = newArgs.map((arg) => (arg.includes(' ') || arg.includes('/') ? `"${arg}"` : arg)).join(' ')
    onChange(newRaw)
  }

  return (
    <div className={`rounded-lg border ${kindColors[command.kind] ?? 'border-[var(--border-color)]'} bg-[var(--bg-panel-muted)]`}>
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {command.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
          {command.title}
        </span>
        <button
          type="button"
          className="icon-button h-5 w-5 shrink-0 text-red-400 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </button>

      {/* Expanded Form */}
      {expanded && (
        <div className="space-y-2 border-t border-[var(--border-color)] px-3 py-2">
          {argFields.map((field) => (
            <div key={field.index}>
              <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field.label}</label>
              {field.label === 'Text' || field.value.length > 40 ? (
                <textarea
                  className="h-16 w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={stripOuterQuotes(field.value)}
                  onChange={(e) => {
                    const text = e.target.value
                    const quoted = text.includes(' ') || text.includes('/') ? `"${text}"` : text
                    updateArg(field.index, quoted)
                  }}
                  spellCheck={false}
                />
              ) : (
                <input
                  type="text"
                  className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={stripOuterQuotes(field.value)}
                  onChange={(e) => {
                    const text = e.target.value
                    const quoted = text.includes(' ') || text.includes('/') ? `"${text}"` : text
                    updateArg(field.index, quoted)
                  }}
                />
              )}
            </div>
          ))}

          <div className="pt-1">
            <span className="text-[9px] text-[var(--text-secondary)]">Raw: {command.raw}</span>
          </div>
        </div>
      )}

      {/* Collapsed detail */}
      {!expanded && command.detail && (
        <div className="px-3 pb-2 text-[10px] text-[var(--text-secondary)]">
          {command.detail}
        </div>
      )}
    </div>
  )
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
