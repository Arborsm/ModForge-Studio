import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { ConfigSchemaEntry } from '../model/types'

type ConfigSchemaEditorProps = {
  entries: ConfigSchemaEntry[]
  /** Fires on every edit; the host writes through to the draft (dirty until save). */
  onChange: (entries: ConfigSchemaEntry[]) => void
}

/**
 * Editor for the pack's `ConfigSchema`: one collapsible row per config key with
 * Default in the row and AllowValues/Description/Section/AllowBlank/
 * AllowMultiple behind the expander. Rows with an empty key are dropped on change.
 */
export function ConfigSchemaEditor({ entries, onChange }: ConfigSchemaEditorProps) {
  const copy = useEditorCopy().studioDesk.configSchemaDialog
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

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

  function updateEntry(index: number, updates: Partial<ConfigSchemaEntry>) {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)))
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={index} className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted)">
          {/* Collapsed row */}
          <div className="flex items-center gap-2 px-2.5 py-2">
            <button type="button" className="icon-button h-5 w-5 shrink-0" onClick={() => toggleRow(index)}>
              {expandedRows.has(index) ? (
                <ChevronDown className="h-3.5 w-3.5 text-(--text-secondary)" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-(--text-secondary)" />
              )}
            </button>
            <input
              type="text"
              placeholder={copy.keyPlaceholder}
              className="min-w-0 flex-1 rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
              value={entry.key}
              onChange={(e) => updateEntry(index, { key: e.target.value })}
            />
            <input
              type="text"
              placeholder={copy.defaultPlaceholder}
              className="min-w-0 flex-1 rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
              value={
                entry.defaultValue === null
                  ? ''
                  : typeof entry.defaultValue === 'string'
                    ? entry.defaultValue
                    : JSON.stringify(entry.defaultValue)
              }
              onChange={(e) => {
                const text = e.target.value
                try {
                  updateEntry(index, { defaultValue: JSON.parse(text) })
                } catch {
                  updateEntry(index, { defaultValue: text })
                }
              }}
            />
            <button
              type="button"
              className="icon-button h-6 w-6 shrink-0 text-(--danger)"
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {/* Expanded detail */}
          {expandedRows.has(index) && (
            <div className="space-y-2 border-t border-(--border-color) px-2.5 py-2">
              <div>
                <label className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{copy.allowValuesLabel}</label>
                <input
                  type="text"
                  placeholder={copy.allowValuesPlaceholder}
                  className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={entry.allowValues ?? ''}
                  onChange={(e) => updateEntry(index, { allowValues: e.target.value || undefined })}
                />
              </div>

              <div>
                <label className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{copy.descriptionLabel}</label>
                <input
                  type="text"
                  placeholder={copy.descriptionPlaceholder}
                  className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={entry.description ?? ''}
                  onChange={(e) => updateEntry(index, { description: e.target.value || undefined })}
                />
              </div>

              <div>
                <label className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{copy.sectionLabel}</label>
                <input
                  type="text"
                  placeholder={copy.sectionPlaceholder}
                  className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={entry.section ?? ''}
                  onChange={(e) => updateEntry(index, { section: e.target.value || undefined })}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[11px] text-(--text-primary)">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-(--accent)"
                    checked={entry.allowBlank ?? false}
                    onChange={(e) => updateEntry(index, { allowBlank: e.target.checked || undefined })}
                  />
                  {copy.allowBlank}
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-(--text-primary)">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-(--accent)"
                    checked={entry.allowMultiple ?? false}
                    onChange={(e) => updateEntry(index, { allowMultiple: e.target.checked || undefined })}
                  />
                  {copy.allowMultiple}
                </label>
              </div>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
        onClick={() => onChange([...entries, { key: '', defaultValue: null }])}
      >
        <Plus className="h-3 w-3" /> {copy.addConfigEntry}
      </button>
    </div>
  )
}
