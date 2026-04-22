import { useEffect, useMemo, useRef, useState } from 'react'

type ContentPatcherPatchPropertiesPanelProps = {
  patch: Record<string, unknown> | null
  patchWhenError: string | null
  onFieldChange: (field: string, value: string | boolean) => void
  onWhenChange: (value: string) => void
  onAddPatch: () => void
  onRemoveSelectedPatch: () => void
}

function getStringValue(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function stringifyWhen(value: unknown): string {
  if (value == null) {
    return ''
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const ACTIONS = ['Load', 'EditData', 'EditImage', 'EditMap', 'Include']

const IMAGE_PATCH_MODES = ['Replace', 'Overlay', 'Mask']
const MAP_PATCH_MODES = ['ReplaceByLayer', 'Overlay', 'Replace']

export function ContentPatcherPatchPropertiesPanel({
  patch,
  patchWhenError,
  onFieldChange,
  onWhenChange,
  onAddPatch,
  onRemoveSelectedPatch,
}: ContentPatcherPatchPropertiesPanelProps) {
  const enabledIsBoolean = useMemo(() => typeof patch?.Enabled === 'boolean', [patch?.Enabled])

  // Local draft for When to preserve user input on parse errors
  const whenText = useMemo(() => stringifyWhen(patch?.When), [patch?.When])
  const [whenDraft, setWhenDraft] = useState(whenText)
  const prevWhenTextRef = useRef(whenText)

  useEffect(() => {
    if (prevWhenTextRef.current !== whenText) {
      prevWhenTextRef.current = whenText
      setWhenDraft(whenText)
    }
  }, [whenText])

  const action = getStringValue(patch?.Action)
  const logName = getStringValue(patch?.LogName)
  const target = getStringValue(patch?.Target)
  const fromFile = getStringValue(patch?.FromFile)
  const patchMode = getStringValue(patch?.PatchMode)
  const priority = getStringValue(patch?.Priority)
  const targetLocale = getStringValue(patch?.TargetLocale)
  const update = getStringValue(patch?.Update)

  const enabledBooleanValue = patch?.Enabled === true
  const enabledStringValue = enabledIsBoolean ? '' : getStringValue(patch?.Enabled)

  const needsTarget = action === 'EditData' || action === 'EditImage' || action === 'EditMap' || action === 'Load'
  const needsFromFile = action === 'EditImage' || action === 'EditMap' || action === 'Load' || action === 'Include'
  const needsPatchMode = action === 'EditImage' || action === 'EditMap'
  const patchModeOptions = action === 'EditImage' ? IMAGE_PATCH_MODES : action === 'EditMap' ? MAP_PATCH_MODES : []

  return (
    <section className="cp-debugger-card" style={{ flex: '0 0 auto', maxHeight: '50%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
        <h3 className="cp-debugger-card-title cp-debugger-card-title-tight">Patch Properties</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="control-button" onClick={onAddPatch}>
            Add
          </button>
          <button type="button" className="control-button" disabled={!patch} onClick={onRemoveSelectedPatch}>
            Remove
          </button>
        </div>
      </div>

      {!patch ? (
        <p className="panel-empty-state">Select a patch to edit its properties.</p>
      ) : (
        <div className="cp-debugger-form-grid cp-debugger-form-grid-compact">
          <label className="cp-debugger-field">
            <span>Action</span>
            <select
              value={action}
              onChange={(event) => onFieldChange('Action', event.target.value)}
              aria-label="Patch Action"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a || '—'}
                </option>
              ))}
            </select>
          </label>

          <label className="cp-debugger-field">
            <span>LogName</span>
            <input
              value={logName}
              onChange={(event) => onFieldChange('LogName', event.target.value)}
              aria-label="Patch LogName"
              placeholder="LogName"
            />
          </label>

          {needsTarget && (
            <label className="cp-debugger-field">
              <span>Target</span>
              <input
                value={target}
                onChange={(event) => onFieldChange('Target', event.target.value)}
                aria-label="Patch Target"
                placeholder="Target"
              />
            </label>
          )}

          {needsFromFile && (
            <label className="cp-debugger-field">
              <span>FromFile</span>
              <input
                value={fromFile}
                onChange={(event) => onFieldChange('FromFile', event.target.value)}
                aria-label="Patch FromFile"
                placeholder="FromFile"
              />
            </label>
          )}

          {needsPatchMode && (
            <label className="cp-debugger-field">
              <span>PatchMode</span>
              <select
                value={patchMode}
                onChange={(event) => onFieldChange('PatchMode', event.target.value)}
                aria-label="Patch PatchMode"
              >
                <option value="">Default</option>
                {patchModeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="cp-debugger-field">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Enabled
              <button
                type="button"
                onClick={() => {
                  if (enabledIsBoolean) {
                    onFieldChange('Enabled', String(patch?.Enabled ?? ''))
                  } else {
                    onFieldChange('Enabled', patch?.Enabled === 'true' || patch?.Enabled === true)
                  }
                }}
                style={{
                  fontSize: 9,
                  letterSpacing: 0,
                  textTransform: 'none',
                  padding: '2px 6px',
                  borderRadius: 6,
                  border: '1px solid color-mix(in srgb, var(--border-color) 84%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-panel-muted) 80%, transparent)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                aria-label="Toggle Enabled type"
              >
                {enabledIsBoolean ? 'bool' : 'text'}
              </button>
            </span>
            {enabledIsBoolean ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 34,
                  padding: '0 10px',
                  borderRadius: 12,
                  border: '1px solid color-mix(in srgb, var(--border-color) 84%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-panel-muted) 80%, transparent)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={enabledBooleanValue}
                  onChange={(event) => onFieldChange('Enabled', event.target.checked)}
                  aria-label="Patch Enabled"
                />
                <span style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
                  {enabledBooleanValue ? 'true' : 'false'}
                </span>
              </label>
            ) : (
              <input
                value={enabledStringValue}
                onChange={(event) => onFieldChange('Enabled', event.target.value)}
                aria-label="Patch Enabled"
                placeholder="{{Token}} or true/false"
              />
            )}
          </label>

          <label className="cp-debugger-field">
            <span>Priority</span>
            <input
              value={priority}
              onChange={(event) => onFieldChange('Priority', event.target.value)}
              aria-label="Patch Priority"
              placeholder="Priority"
            />
          </label>

          <label className="cp-debugger-field">
            <span>TargetLocale</span>
            <input
              value={targetLocale}
              onChange={(event) => onFieldChange('TargetLocale', event.target.value)}
              aria-label="Patch TargetLocale"
              placeholder="TargetLocale"
            />
          </label>

          <label className="cp-debugger-field">
            <span>Update</span>
            <input
              value={update}
              onChange={(event) => onFieldChange('Update', event.target.value)}
              aria-label="Patch Update"
              placeholder="OnDayStart, ..."
            />
          </label>

          <div className="cp-debugger-field" style={{ gridColumn: '1 / -1' }}>
            <span>When</span>
            <textarea
              value={whenDraft}
              onChange={(event) => {
                setWhenDraft(event.target.value)
                onWhenChange(event.target.value)
              }}
              aria-label="Patch When"
              placeholder={`{\n  "HasMod": "Example.Mod"\n}`}
              rows={3}
              style={{
                border: `1px solid ${patchWhenError ? 'var(--danger)' : 'color-mix(in srgb, var(--border-color) 84%, transparent)'}`,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--bg-panel-muted) 80%, transparent)',
                color: 'var(--text-primary)',
                padding: '8px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                resize: 'vertical',
              }}
            />
            {patchWhenError ? (
              <span style={{ color: 'var(--danger)', fontSize: 11 }}>{patchWhenError}</span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
