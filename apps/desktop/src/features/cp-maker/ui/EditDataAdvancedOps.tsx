import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { Disclosure } from '@shared/ui/Disclosure'
import type { DraftPatch } from '../model/types'
import {
  readAdvancedFields,
  readMoveEntries,
  readTextOperations,
  writeAdvancedFields,
  writeMoveEntries,
  writeTextOperations,
  TEXT_OPERATION_KINDS,
  TEXT_OPERATION_REPLACE_MODES,
} from '../model/editDataAdvancedOps'

type EditDataAdvancedOpsProps = {
  patch: DraftPatch
  /** Writes a full replacement `editorState` back to the patch. */
  onEditorStateChange: (editorState: Record<string, unknown>) => void
}

type TextOpRow = { operation: string; target: string; value: string; delimiter: string; search: string; replaceMode: string }
type MoveRow = { id: string; mode: 'before' | 'after' | 'position'; target: string }
type FieldRow = { entryKey: string; fieldName: string; valueText: string }

const inputClass =
  'w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-xs text-(--text-primary) outline-none focus:border-(--accent)'

/**
 * GUI for the EditData advanced operations (`Fields`, `MoveEntries`,
 * `TextOperations`) parked in `editorState`. Rows write straight through to
 * the patch; the export merges them with the entry editor's `entries`.
 */
export function EditDataAdvancedOps({ patch, onEditorStateChange }: EditDataAdvancedOpsProps) {
  return <EditDataAdvancedOpsInner key={patch.id} patch={patch} onEditorStateChange={onEditorStateChange} />
}

function EditDataAdvancedOpsInner({ patch, onEditorStateChange }: EditDataAdvancedOpsProps) {
  const copy = useEditorCopy().studioDesk.editDataOps
  const [textOps, setTextOps] = useState<TextOpRow[]>(() =>
    readTextOperations(patch.editorState).map((op) => ({
      operation: op.operation,
      target: op.target,
      value: op.value ?? '',
      delimiter: op.delimiter ?? '',
      search: op.search ?? '',
      replaceMode: op.replaceMode ?? '',
    })),
  )
  const [moves, setMoves] = useState<MoveRow[]>(() =>
    readMoveEntries(patch.editorState).map((entry) => ({
      id: entry.id,
      mode: entry.beforeId !== undefined ? 'before' : entry.afterId !== undefined ? 'after' : 'position',
      target: entry.beforeId ?? entry.afterId ?? (entry.toPosition !== undefined ? String(entry.toPosition) : ''),
    })),
  )
  const [fields, setFields] = useState<FieldRow[]>(() =>
    Object.entries(readAdvancedFields(patch.editorState)).flatMap(([entryKey, fieldMap]) =>
      Object.entries(fieldMap).map(([fieldName, value]) => ({
        entryKey,
        fieldName,
        valueText: typeof value === 'string' ? value : JSON.stringify(value),
      })),
    ),
  )

  function commit(next: { textOps?: TextOpRow[]; moves?: MoveRow[]; fields?: FieldRow[] }) {
    const nextTextOps = next.textOps ?? textOps
    const nextMoves = next.moves ?? moves
    const nextFields = next.fields ?? fields
    if (next.textOps) setTextOps(next.textOps)
    if (next.moves) setMoves(next.moves)
    if (next.fields) setFields(next.fields)

    let state = writeTextOperations(
      patch.editorState,
      nextTextOps
        .filter((row) => row.target.trim() !== '')
        .map((row) => ({
          operation: row.operation,
          target: row.target,
          value: row.value === '' ? undefined : row.value,
          delimiter: row.delimiter === '' ? undefined : row.delimiter,
          search: row.search === '' ? undefined : row.search,
          replaceMode: row.replaceMode === '' ? undefined : row.replaceMode,
        })),
    )
    state = writeMoveEntries(
      state,
      nextMoves
        .filter((row) => row.id.trim() !== '')
        .map((row) => ({
          id: row.id,
          beforeId: row.mode === 'before' ? row.target : undefined,
          afterId: row.mode === 'after' ? row.target : undefined,
          toPosition:
            row.mode === 'position' && row.target.trim() !== '' && !Number.isNaN(Number(row.target)) ? Number(row.target) : undefined,
        })),
    )
    const fieldMap: Record<string, Record<string, unknown>> = {}
    for (const row of nextFields) {
      if (row.entryKey.trim() === '' || row.fieldName.trim() === '') continue
      const entry = fieldMap[row.entryKey] ?? {}
      try {
        entry[row.fieldName] = JSON.parse(row.valueText)
      } catch {
        entry[row.fieldName] = row.valueText
      }
      fieldMap[row.entryKey] = entry
    }
    state = writeAdvancedFields(state, fieldMap)
    onEditorStateChange(state)
  }

  return (
    <Disclosure title={copy.title} subtitle={copy.subtitle} className="rounded-none border-0 border-t">
      <div className="custom-scrollbar max-h-72 space-y-4 overflow-y-auto">
        {/* Fields */}
        <section>
          <h4 className="text-xs font-medium text-(--text-primary)">{copy.fieldsTitle}</h4>
          <p className="mt-0.5 mb-2 text-[11px] text-(--text-secondary)">{copy.fieldsHint}</p>
          {fields.map((row, index) => {
            const patchRow = (updates: Partial<FieldRow>) =>
              commit({ fields: fields.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)) })
            return (
              <div key={index} className="mb-1.5 flex items-center gap-2">
                <input
                  type="text"
                  placeholder={copy.fieldEntryPlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.entryKey}
                  onChange={(e) => patchRow({ entryKey: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={copy.fieldNamePlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.fieldName}
                  onChange={(e) => patchRow({ fieldName: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={copy.fieldValuePlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.valueText}
                  onChange={(e) => patchRow({ valueText: e.target.value })}
                />
                <RemoveRowButton label={copy.removeRow} onClick={() => commit({ fields: fields.filter((_, i) => i !== index) })} />
              </div>
            )
          })}
          <AddRowButton
            label={copy.addField}
            onClick={() => commit({ fields: [...fields, { entryKey: '', fieldName: '', valueText: '' }] })}
          />
        </section>

        {/* MoveEntries */}
        <section>
          <h4 className="text-xs font-medium text-(--text-primary)">{copy.moveTitle}</h4>
          <p className="mt-0.5 mb-2 text-[11px] text-(--text-secondary)">{copy.moveHint}</p>
          {moves.map((row, index) => {
            const patchRow = (updates: Partial<MoveRow>) =>
              commit({ moves: moves.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)) })
            return (
              <div key={index} className="mb-1.5 flex items-center gap-2">
                <input
                  type="text"
                  placeholder={copy.moveIdPlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.id}
                  onChange={(e) => patchRow({ id: e.target.value })}
                />
                <select
                  className={`w-40 ${inputClass}`}
                  value={row.mode}
                  onChange={(e) => patchRow({ mode: e.target.value as MoveRow['mode'] })}
                >
                  <option value="before">{copy.moveModes.before}</option>
                  <option value="after">{copy.moveModes.after}</option>
                  <option value="position">{copy.moveModes.position}</option>
                </select>
                <input
                  type="text"
                  placeholder={copy.moveTargetPlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.target}
                  onChange={(e) => patchRow({ target: e.target.value })}
                />
                <RemoveRowButton label={copy.removeRow} onClick={() => commit({ moves: moves.filter((_, i) => i !== index) })} />
              </div>
            )
          })}
          <AddRowButton label={copy.addMove} onClick={() => commit({ moves: [...moves, { id: '', mode: 'after', target: '' }] })} />
        </section>

        {/* TextOperations */}
        <section>
          <h4 className="text-xs font-medium text-(--text-primary)">{copy.textOpsTitle}</h4>
          <p className="mt-0.5 mb-2 text-[11px] text-(--text-secondary)">{copy.textOpsHint}</p>
          {textOps.map((row, index) => {
            const patchRow = (updates: Partial<TextOpRow>) =>
              commit({ textOps: textOps.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)) })
            return (
              <div key={index} className="mb-1.5 space-y-1.5 rounded-md border border-(--border-color) p-2">
                <div className="flex items-center gap-2">
                  <select className={`w-36 ${inputClass}`} value={row.operation} onChange={(e) => patchRow({ operation: e.target.value })}>
                    {TEXT_OPERATION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder={copy.textOpTargetPlaceholder}
                    className={`flex-1 ${inputClass}`}
                    value={row.target}
                    onChange={(e) => patchRow({ target: e.target.value })}
                  />
                  <RemoveRowButton label={copy.removeRow} onClick={() => commit({ textOps: textOps.filter((_, i) => i !== index) })} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={copy.textOpValuePlaceholder}
                    className={`flex-1 ${inputClass}`}
                    value={row.value}
                    onChange={(e) => patchRow({ value: e.target.value })}
                  />
                  {row.operation === 'RemoveDelimited' ? (
                    <>
                      <input
                        type="text"
                        placeholder={copy.textOpDelimiterPlaceholder}
                        className={`w-28 ${inputClass}`}
                        value={row.delimiter}
                        onChange={(e) => patchRow({ delimiter: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder={copy.textOpSearchPlaceholder}
                        className={`flex-1 ${inputClass}`}
                        value={row.search}
                        onChange={(e) => patchRow({ search: e.target.value })}
                      />
                      <select
                        className={`w-28 ${inputClass}`}
                        aria-label={copy.replaceModeLabel}
                        value={row.replaceMode}
                        onChange={(e) => patchRow({ replaceMode: e.target.value })}
                      >
                        <option value="">{copy.replaceModeLabel}</option>
                        {TEXT_OPERATION_REPLACE_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
          <AddRowButton
            label={copy.addTextOp}
            onClick={() =>
              commit({ textOps: [...textOps, { operation: 'Append', target: '', value: '', delimiter: '', search: '', replaceMode: '' }] })
            }
          />
        </section>
      </div>
    </Disclosure>
  )
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="flex items-center gap-1 text-xs text-(--accent) hover:underline" onClick={onClick}>
      <Plus className="h-3 w-3" /> {label}
    </button>
  )
}

function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} className="icon-button h-6 w-6 shrink-0 text-(--danger)" onClick={onClick}>
      <Trash2 className="h-3 w-3" />
    </button>
  )
}
