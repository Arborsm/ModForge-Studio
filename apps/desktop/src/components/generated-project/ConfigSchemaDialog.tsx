import { useState } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { ConfigSchemaEntry, DraftPatch } from '../../lib/app/useGeneratedProject'

interface ConfigSchemaDialogProps {
  open: boolean
  mode: 'when' | 'config'
  patch: DraftPatch | null
  configSchema: ConfigSchemaEntry[]
  onClose: () => void
  onPatchWhenChange: (patchId: string, when: Record<string, unknown> | undefined) => void
  onConfigSchemaChange: (entries: ConfigSchemaEntry[]) => void
}

export function ConfigSchemaDialog({
  open,
  mode: initialMode,
  patch,
  configSchema,
  onClose,
  onPatchWhenChange,
  onConfigSchemaChange,
}: ConfigSchemaDialogProps) {
  const [activeTab, setActiveTab] = useState<'when' | 'config'>(initialMode)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [whenEntries, setWhenEntries] = useState<Array<{ key: string; value: string }>>(() => {
    const entries: Array<{ key: string; value: string }> = []
    if (patch?.when) {
      for (const [key, value] of Object.entries(patch.when)) {
        entries.push({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        })
      }
    }
    return entries.length > 0 ? entries : [{ key: '', value: '' }]
  })
  const [schemaEntries, setSchemaEntries] = useState<ConfigSchemaEntry[]>(configSchema)

  if (!open) return null

  function toggleRow(index: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function updateSchemaEntry(index: number, updates: Partial<ConfigSchemaEntry>) {
    const next = [...schemaEntries]
    next[index] = { ...next[index]!, ...updates }
    setSchemaEntries(next)
  }

  function handleSaveWhen() {
    if (!patch) return
    const when: Record<string, unknown> = {}
    for (const entry of whenEntries) {
      if (entry.key.trim()) {
        try {
          when[entry.key.trim()] = JSON.parse(entry.value)
        } catch {
          when[entry.key.trim()] = entry.value
        }
      }
    }
    onPatchWhenChange(patch.id, Object.keys(when).length > 0 ? when : undefined)
    onClose()
  }

  function handleSaveConfig() {
    onConfigSchemaChange(schemaEntries.filter((e) => e.key.trim()))
    onClose()
  }

  function handleSave() {
    if (activeTab === 'when') {
      handleSaveWhen()
    } else {
      handleSaveConfig()
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-panel-muted)] p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'when'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('when')}
            >
              When
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'config'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('config')}
            >
              ConfigSchema
            </button>
          </div>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-auto px-4 py-3">
          {activeTab === 'when' ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
                {patch ? `Edit When conditions for: ${patch.logName}` : 'Select a patch to edit its When conditions.'}
              </p>
              {whenEntries.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Key (e.g. Season)"
                    className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={entry.key}
                    onChange={(e) => {
                      const next = [...whenEntries]
                      next[index] = { ...entry, key: e.target.value }
                      setWhenEntries(next)
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. spring)"
                    className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={entry.value}
                    onChange={(e) => {
                      const next = [...whenEntries]
                      next[index] = { ...entry, value: e.target.value }
                      setWhenEntries(next)
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button h-7 w-7 shrink-0 text-red-400"
                    onClick={() => setWhenEntries(whenEntries.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                onClick={() => setWhenEntries([...whenEntries, { key: '', value: '' }])}
              >
                <Plus className="h-3 w-3" /> Add condition
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
                Define ConfigSchema entries for your mod.
              </p>
              {schemaEntries.map((entry, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
                >
                  {/* Collapsed row */}
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <button
                      type="button"
                      className="icon-button h-5 w-5 shrink-0"
                      onClick={() => toggleRow(index)}
                    >
                      {expandedRows.has(index) ? (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      )}
                    </button>
                    <input
                      type="text"
                      placeholder="Key"
                      className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.key}
                      onChange={(e) => updateSchemaEntry(index, { key: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Default"
                      className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.defaultValue === null ? '' : typeof entry.defaultValue === 'string' ? entry.defaultValue : JSON.stringify(entry.defaultValue)}
                      onChange={(e) => {
                        const text = e.target.value
                        try {
                          updateSchemaEntry(index, { defaultValue: JSON.parse(text) })
                        } catch {
                          updateSchemaEntry(index, { defaultValue: text })
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="icon-button h-6 w-6 shrink-0 text-red-400"
                      onClick={() => setSchemaEntries(schemaEntries.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {expandedRows.has(index) && (
                    <div className="space-y-2 border-t border-[var(--border-color)] px-2.5 py-2">
                      <div>
                        <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                          AllowValues (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="spring, summer, fall, winter"
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={entry.allowValues ?? ''}
                          onChange={(e) => updateSchemaEntry(index, { allowValues: e.target.value || undefined })}
                        />
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                          Description
                        </label>
                        <input
                          type="text"
                          placeholder="Explain this option to players"
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={entry.description ?? ''}
                          onChange={(e) => updateSchemaEntry(index, { description: e.target.value || undefined })}
                        />
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                          Section
                        </label>
                        <input
                          type="text"
                          placeholder="Group name (optional)"
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={entry.section ?? ''}
                          onChange={(e) => updateSchemaEntry(index, { section: e.target.value || undefined })}
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                            checked={entry.allowBlank ?? false}
                            onChange={(e) => updateSchemaEntry(index, { allowBlank: e.target.checked || undefined })}
                          />
                          AllowBlank
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                            checked={entry.allowMultiple ?? false}
                            onChange={(e) => updateSchemaEntry(index, { allowMultiple: e.target.checked || undefined })}
                          />
                          AllowMultiple
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                onClick={() => setSchemaEntries([...schemaEntries, { key: '', defaultValue: null }])}
              >
                <Plus className="h-3 w-3" /> Add config entry
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <button type="button" className="control-button text-xs" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="control-button control-button-primary text-xs" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
