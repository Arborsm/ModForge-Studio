import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { ConfigSchemaEntry, DraftPatch } from '@shared/contracts'
import { useEditorCopy } from '@locales/localeContext'

interface ConfigSchemaDialogProps {
  open: boolean
  mode: 'properties' | 'config'
  patch: DraftPatch | null
  configSchema: ConfigSchemaEntry[]
  onClose: () => void
  onPatchPropertiesChange: (patchId: string, properties: Partial<DraftPatch>) => void
  onConfigSchemaChange: (entries: ConfigSchemaEntry[]) => void
}

export function ConfigSchemaDialog({
  open,
  mode: initialMode,
  patch,
  configSchema,
  onClose,
  onPatchPropertiesChange,
  onConfigSchemaChange,
}: ConfigSchemaDialogProps) {
  const copy = useEditorCopy().studioDesk.configSchemaDialog
  const [activeTab, setActiveTab] = useState<'properties' | 'config'>(initialMode)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Properties tab state
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
  const [priority, setPriority] = useState(() => (patch?.priority !== undefined ? String(patch.priority) : ''))
  const initialEnabledMode = typeof patch?.enabled === 'string' ? 'token' : 'bool'
  const [enabledMode, setEnabledMode] = useState<'bool' | 'token'>(initialEnabledMode)
  const [enabledBool, setEnabledBool] = useState(() => (typeof patch?.enabled === 'boolean' ? patch.enabled : true))
  const [enabledToken, setEnabledToken] = useState(() => (typeof patch?.enabled === 'string' ? patch.enabled : ''))
  const [targetLocale, setTargetLocale] = useState(() => patch?.targetLocale ?? '')
  const [update, setUpdate] = useState(() => patch?.update ?? '')
  const [localTokens, setLocalTokens] = useState<Array<{ key: string; value: string }>>(() => {
    const entries: Array<{ key: string; value: string }> = []
    if (patch?.localTokens) {
      for (const [key, value] of Object.entries(patch.localTokens)) {
        entries.push({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })
      }
    }
    return entries.length > 0 ? entries : [{ key: '', value: '' }]
  })

  const [schemaEntries, setSchemaEntries] = useState<ConfigSchemaEntry[]>(configSchema)
  const initializedPatchIdRef = useRef<string | null>(null)

  // Sync patch-related state only when the patch identity changes
  useEffect(() => {
    if (!patch || initializedPatchIdRef.current === patch.id) return
    initializedPatchIdRef.current = patch.id
    setWhenEntries(() => {
      const entries: Array<{ key: string; value: string }> = []
      if (patch.when) {
        for (const [key, value] of Object.entries(patch.when)) {
          entries.push({
            key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
          })
        }
      }
      return entries.length > 0 ? entries : [{ key: '', value: '' }]
    })
    setPriority(patch.priority !== undefined ? String(patch.priority) : '')
    setEnabledMode(typeof patch.enabled === 'string' ? 'token' : 'bool')
    setEnabledBool(typeof patch.enabled === 'boolean' ? patch.enabled : true)
    setEnabledToken(typeof patch.enabled === 'string' ? patch.enabled : '')
    setTargetLocale(patch.targetLocale ?? '')
    setUpdate(patch.update ?? '')
    setLocalTokens(() => {
      const entries: Array<{ key: string; value: string }> = []
      if (patch.localTokens) {
        for (const [key, value] of Object.entries(patch.localTokens)) {
          entries.push({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })
        }
      }
      return entries.length > 0 ? entries : [{ key: '', value: '' }]
    })
  }, [patch])

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

  function handleSaveProperties() {
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
    const tokens: Record<string, string> = {}
    for (const entry of localTokens) {
      if (entry.key.trim()) {
        tokens[entry.key.trim()] = entry.value
      }
    }
    const props: Partial<DraftPatch> = {}
    props.when = Object.keys(when).length > 0 ? when : undefined
    if (priority !== '') {
      const num = Number(priority)
      props.priority = Number.isNaN(num) ? priority : num
    } else {
      props.priority = undefined
    }
    if (enabledMode === 'token') {
      props.enabled = enabledToken.trim() || undefined
    } else {
      props.enabled = enabledBool
    }
    if (update) props.update = update as DraftPatch['update']
    if (targetLocale) props.targetLocale = targetLocale
    props.localTokens = Object.keys(tokens).length > 0 ? tokens : undefined
    onPatchPropertiesChange(patch.id, props)
    onClose()
  }

  function handleSaveConfig() {
    onConfigSchemaChange(schemaEntries.filter((e) => e.key.trim()))
    onClose()
  }

  function handleSave() {
    if (activeTab === 'properties') {
      handleSaveProperties()
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
                activeTab === 'properties'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('properties')}
            >
              {copy.propertiesTab}
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
              {copy.configTab}
            </button>
          </div>
          <button type="button" className="icon-button h-7 w-7" aria-label={copy.closeLabel} onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-auto px-4 py-3">
          {activeTab === 'properties' ? (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                {patch ? copy.patchPropertiesTitle(patch.logName) : copy.noPatchSelected}
              </p>

              {/* Priority */}
              <div>
                <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.priority}</label>
                <input
                  type="text"
                  list="priority-options"
                  placeholder={patch?.action === 'Load' ? copy.priorityLoadPlaceholder : copy.priorityPatchPlaceholder}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
                <datalist id="priority-options">
                  {patch?.action === 'Load' ? (
                    <>
                      <option value="Low" />
                      <option value="Medium" />
                      <option value="High" />
                      <option value="Exclusive" />
                    </>
                  ) : (
                    <>
                      <option value="Early" />
                      <option value="Default" />
                      <option value="Late" />
                    </>
                  )}
                </datalist>
              </div>

              {/* Enabled */}
              <div>
                <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.enabled}</label>
                <select
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={enabledMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'bool' | 'token'
                    setEnabledMode(mode)
                    if (mode === 'bool' && !enabledBool) {
                      setEnabledBool(true)
                    }
                  }}
                >
                  <option value="bool">{copy.enabledModeBoolean}</option>
                  <option value="token">{copy.enabledModeToken}</option>
                </select>
                {enabledMode === 'bool' ? (
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={enabledBool}
                      onChange={(e) => setEnabledBool(e.target.checked)}
                    />
                    {enabledBool ? copy.enabledState : copy.disabledState}
                  </label>
                ) : (
                  <input
                    type="text"
                    className="mt-1.5 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={enabledToken}
                    onChange={(e) => setEnabledToken(e.target.value)}
                    placeholder={copy.enabledTokenPlaceholder}
                  />
                )}
              </div>

              {/* TargetLocale */}
              <div>
                <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.targetLocale}</label>
                <input
                  type="text"
                  placeholder={copy.targetLocalePlaceholder}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                />
              </div>

              {/* Update */}
              <div>
                <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.update}</label>
                <select
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={update}
                  onChange={(e) => setUpdate(e.target.value)}
                >
                  <option value="">{copy.updateDefault}</option>
                  <option value="OnDayStart">OnDayStart</option>
                  <option value="OnLocationChange">OnLocationChange</option>
                  <option value="OnTimeChange">OnTimeChange</option>
                </select>
              </div>

              {/* When conditions */}
              <div className="border-t border-[var(--border-color)] pt-2">
                <span className="text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">{copy.when}</span>
                <div className="mt-1.5 space-y-2">
                  {whenEntries.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={copy.whenKeyPlaceholder}
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
                        placeholder={copy.whenValuePlaceholder}
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
                    <Plus className="h-3 w-3" /> {copy.addCondition}
                  </button>
                </div>
              </div>

              {/* LocalTokens */}
              <div className="border-t border-[var(--border-color)] pt-2">
                <span className="text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">{copy.localTokens}</span>
                <div className="mt-1.5 space-y-2">
                  {localTokens.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={copy.tokenNamePlaceholder}
                        className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...localTokens]
                          next[index] = { ...entry, key: e.target.value }
                          setLocalTokens(next)
                        }}
                      />
                      <input
                        type="text"
                        placeholder={copy.valuePlaceholder}
                        className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...localTokens]
                          next[index] = { ...entry, value: e.target.value }
                          setLocalTokens(next)
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button h-7 w-7 shrink-0 text-red-400"
                        onClick={() => setLocalTokens(localTokens.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    onClick={() => setLocalTokens([...localTokens, { key: '', value: '' }])}
                  >
                    <Plus className="h-3 w-3" /> {copy.addToken}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">{copy.configDescription}</p>
              {schemaEntries.map((entry, index) => (
                <div key={index} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
                  {/* Collapsed row */}
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <button type="button" className="icon-button h-5 w-5 shrink-0" onClick={() => toggleRow(index)}>
                      {expandedRows.has(index) ? (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      )}
                    </button>
                    <input
                      type="text"
                      placeholder={copy.keyPlaceholder}
                      className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.key}
                      onChange={(e) => updateSchemaEntry(index, { key: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder={copy.defaultPlaceholder}
                      className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
                        <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.allowValuesLabel}</label>
                        <input
                          type="text"
                          placeholder={copy.allowValuesPlaceholder}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={entry.allowValues ?? ''}
                          onChange={(e) => updateSchemaEntry(index, { allowValues: e.target.value || undefined })}
                        />
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.descriptionLabel}</label>
                        <input
                          type="text"
                          placeholder={copy.descriptionPlaceholder}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={entry.description ?? ''}
                          onChange={(e) => updateSchemaEntry(index, { description: e.target.value || undefined })}
                        />
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[9px] text-[var(--text-secondary)] uppercase">{copy.sectionLabel}</label>
                        <input
                          type="text"
                          placeholder={copy.sectionPlaceholder}
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
                          {copy.allowBlank}
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                            checked={entry.allowMultiple ?? false}
                            onChange={(e) => updateSchemaEntry(index, { allowMultiple: e.target.checked || undefined })}
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
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                onClick={() => setSchemaEntries([...schemaEntries, { key: '', defaultValue: null }])}
              >
                <Plus className="h-3 w-3" /> {copy.addConfigEntry}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <button type="button" className="control-button text-xs" onClick={onClose}>
            {copy.cancel}
          </button>
          <button type="button" className="control-button control-button-primary text-xs" onClick={handleSave}>
            {copy.save}
          </button>
        </div>
      </div>
    </div>
  )
}
