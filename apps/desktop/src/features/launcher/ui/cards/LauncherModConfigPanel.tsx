import { Info, RotateCcw, Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorCopy, useLocale } from '@locales/provider'
import type { LauncherConfigItemOption, LauncherModConfigField, LauncherModConfigResult } from '../../model/launcherContracts'
import type { LauncherPort } from '../../model/launcherPort'
import {
  isValidLauncherConfigColor,
  isLauncherConfigKeybindMap,
  isLauncherConfigObjectGroup,
  LauncherModConfigChoiceControl,
  LauncherModConfigColorControl,
  LauncherModConfigItemControl,
  LauncherModConfigKeybindControl,
  LauncherModConfigKeybindMapControl,
  LauncherModConfigObjectGroupControl,
  LauncherModConfigListControl,
} from './LauncherModConfigControls'

type LauncherModConfigPanelProps = {
  modPath: string
  launcherPort: LauncherPort
  toolbarTarget?: HTMLElement | null
  onLeaveGuardChange?: (guard: LauncherModConfigLeaveGuard | null) => void
}

/** Current unsaved-config state and the operation required to persist it before leaving. */
export type LauncherModConfigLeaveGuard = {
  dirty: boolean
  canSave: boolean
  saving: boolean
  save: () => Promise<boolean>
}

function valueToInput(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value == null) {
    return ''
  }
  return JSON.stringify(value, null, 2)
}

function parseFieldValue(field: LauncherModConfigField, value: string, checked: boolean) {
  switch (field.fieldType) {
    case 'boolean':
      return checked
    case 'integer': {
      const parsed = Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : field.value
    }
    case 'number': {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : field.value
    }
    case 'string':
    default:
      return value
  }
}

function displaySource(
  source: LauncherModConfigField['source'],
  sources: ReturnType<typeof useEditorCopy>['launcher']['library']['modDetail']['config']['sources'],
) {
  switch (source) {
    case 'content-patcher':
      return sources.contentPatcher
    case 'generic-mod-config-menu':
      return sources.genericModConfigMenu
    case 'dll-static':
      return sources.dllStatic
    case 'config-json':
    default:
      return sources.configJson
  }
}

function fieldValue(field: LauncherModConfigField, edits: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(edits, field.key) ? edits[field.key] : field.value
}

function booleanOptionValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }
  if (normalized === 'false') {
    return false
  }
  return null
}

function resolveToggleChoice(field: LauncherModConfigField, currentValue: unknown) {
  if (field.fieldType === 'boolean') {
    return { checked: Boolean(currentValue), trueValue: true, falseValue: false }
  }
  if (field.allowMultiple || field.allowValues.length !== 2) {
    return null
  }

  const trueValue = field.allowValues.find((value) => booleanOptionValue(value) === true)
  const falseValue = field.allowValues.find((value) => booleanOptionValue(value) === false)
  if (trueValue === undefined || falseValue === undefined) {
    return null
  }

  return {
    checked: booleanOptionValue(currentValue) === true,
    trueValue,
    falseValue,
  }
}

function configControlKind(field: LauncherModConfigField, value: unknown, hasToggleChoice: boolean) {
  if (isLauncherConfigKeybindMap(field, value)) {
    return 'keybind-map'
  }
  if (isLauncherConfigObjectGroup(field, value)) {
    return 'object-group'
  }
  if (field.uiHint === 'color') {
    return 'color'
  }
  if (field.uiHint === 'keybind' || field.uiHint === 'keybind-list') {
    return 'keybind'
  }
  if (field.uiHint === 'item') {
    return 'item'
  }
  if (field.uiHint === 'item-list' || (field.fieldType === 'string-array' && !field.allowValues.length)) {
    return 'list'
  }
  if (hasToggleChoice) {
    return 'toggle'
  }
  if (field.allowValues.length) {
    return field.allowMultiple ? 'multi-select' : 'select'
  }
  if (field.fieldType === 'object' || field.fieldType === 'unknown') {
    return 'textarea'
  }
  if (field.fieldType === 'integer' || field.fieldType === 'number') {
    return 'number'
  }
  return 'text'
}

function groupConfigFields(fields: LauncherModConfigField[]) {
  const groups = new Map<string | null, LauncherModConfigField[]>()

  for (const field of fields) {
    const section = field.section?.trim() || null
    const group = groups.get(section)
    if (group) {
      group.push(field)
    } else {
      groups.set(section, [field])
    }
  }

  return Array.from(groups, ([section, groupedFields]) => ({ section, fields: groupedFields }))
}

export function LauncherModConfigPanel({ modPath, launcherPort, toolbarTarget, onLeaveGuardChange }: LauncherModConfigPanelProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const configCopy = copy.launcher.library.modDetail.config
  const [result, setResult] = useState<LauncherModConfigResult | null>(null)
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({})
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({})
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [configItems, setConfigItems] = useState<LauncherConfigItemOption[]>([])
  const [configItemState, setConfigItemState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const dirty = Object.keys(edits).length > 0
  const hasJsonErrors = Object.values(jsonErrors).some(Boolean)
  const hasColorErrors = Boolean(
    result?.fields.some((field) => field.uiHint === 'color' && !isValidLauncherConfigColor(fieldValue(field, edits))),
  )

  useEffect(() => {
    let alive = true
    setState('loading')
    setError(null)
    setEdits({})
    setJsonDrafts({})
    setJsonErrors({})
    launcherPort
      .loadModConfig({ modPath, locale })
      .then((next) => {
        if (!alive) {
          return
        }
        setResult(next)
        setState('ready')
      })
      .catch((loadError: unknown) => {
        if (!alive) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setState('error')
      })

    return () => {
      alive = false
    }
  }, [launcherPort, locale, modPath])

  useEffect(() => {
    if (!result?.fields.some((field) => field.uiHint === 'item' || field.uiHint === 'item-list')) {
      setConfigItems([])
      setConfigItemState('idle')
      return
    }

    let alive = true
    setConfigItemState('loading')
    launcherPort
      .loadSettings()
      .then((settings) => {
        if (!settings.gamePath) {
          throw new Error('game-path-unavailable')
        }
        return launcherPort.loadConfigItems(settings.gamePath, locale)
      })
      .then((items) => {
        if (!alive) {
          return
        }
        setConfigItems(items)
        setConfigItemState('ready')
      })
      .catch(() => {
        if (!alive) {
          return
        }
        setConfigItems([])
        setConfigItemState('error')
      })

    return () => {
      alive = false
    }
  }, [launcherPort, locale, result])

  const updateField = (field: LauncherModConfigField, value: unknown) => {
    setEdits((current) => ({ ...current, [field.key]: value }))
  }

  const updateJsonField = (field: LauncherModConfigField, value: string) => {
    setJsonDrafts((current) => ({ ...current, [field.key]: value }))
    try {
      updateField(field, JSON.parse(value))
      setJsonErrors((current) => {
        const next = { ...current }
        delete next[field.key]
        return next
      })
    } catch {
      setJsonErrors((current) => ({ ...current, [field.key]: true }))
    }
  }

  const resetEdits = () => {
    setEdits({})
    setJsonDrafts({})
    setJsonErrors({})
  }

  const restoreDefaults = () => {
    if (!result) {
      return
    }
    const nextEdits: Record<string, unknown> = {}
    const nextDrafts: Record<string, string> = {}
    for (const field of result.fields) {
      if (field.editable && field.defaultValue !== null) {
        nextEdits[field.key] = field.defaultValue
        if (field.fieldType === 'object' || field.fieldType === 'unknown') {
          nextDrafts[field.key] = valueToInput(field.defaultValue)
        }
      }
    }
    setEdits(nextEdits)
    setJsonDrafts(nextDrafts)
    setJsonErrors({})
  }

  const save = useCallback(async () => {
    if (!dirty || hasJsonErrors || hasColorErrors || state === 'saving') {
      return !dirty
    }
    setState('saving')
    setError(null)
    try {
      const next = await launcherPort.saveModConfig({ modPath, locale, values: edits })
      setResult(next)
      setEdits({})
      setJsonDrafts({})
      setJsonErrors({})
      setState('ready')
      return true
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
      setState('error')
      return false
    }
  }, [dirty, edits, hasColorErrors, hasJsonErrors, launcherPort, locale, modPath, state])

  useEffect(() => {
    onLeaveGuardChange?.({
      dirty,
      canSave: dirty && !hasJsonErrors && !hasColorErrors && state !== 'saving',
      saving: state === 'saving',
      save,
    })
    return () => onLeaveGuardChange?.(null)
  }, [dirty, hasColorErrors, hasJsonErrors, onLeaveGuardChange, save, state])

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  if (state === 'loading') {
    return <div className="launcher-mod-detail-config-state">{configCopy.loading}</div>
  }

  if (state === 'error' && !result) {
    return (
      <div className="launcher-mod-detail-config-state">
        <strong>{configCopy.error}</strong>
        {error ? <span>{error}</span> : null}
      </div>
    )
  }

  const fields = result?.fields ?? []
  const fieldGroups = groupConfigFields(fields)
  const diagnostics = result?.warnings ?? []
  const toolbar = (
    <div className="launcher-mod-detail-rich-head">
      <div className="launcher-mod-detail-rich-head-title">
        <span>{configCopy.title}</span>
        <strong>{fields.length}</strong>
      </div>
      <div className="launcher-mod-detail-config-actions">
        <button
          type="button"
          className="control-button"
          title={configCopy.revert}
          onClick={resetEdits}
          disabled={!dirty || state === 'saving'}
        >
          <RotateCcw className="h-3 w-3" />
          <span>{configCopy.revert}</span>
        </button>
        <button
          type="button"
          className="control-button"
          title={configCopy.restoreDefaults}
          onClick={restoreDefaults}
          disabled={!fields.some((field) => field.editable && field.defaultValue !== null) || state === 'saving'}
        >
          <Undo2 className="h-3 w-3" />
          <span>{configCopy.restoreDefaults}</span>
        </button>
        <button
          type="button"
          className="control-button launcher-mod-detail-config-save"
          aria-label={state === 'saving' ? configCopy.saving : configCopy.save}
          title={state === 'saving' ? configCopy.saving : configCopy.save}
          onClick={() => void save()}
          disabled={!dirty || hasJsonErrors || hasColorErrors || state === 'saving'}
        >
          <Save className="h-3 w-3" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="launcher-mod-detail-config">
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}

      {error ? <div className="launcher-mod-detail-config-warning">{error}</div> : null}
      {diagnostics.length ? (
        <details className="launcher-mod-detail-config-diagnostics" open={!fields.length}>
          <summary>
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>{diagnostics.length === 1 ? configCopy.diagnostic : configCopy.diagnostics(diagnostics.length)}</span>
          </summary>
          <ul>
            {diagnostics.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {!fields.length ? (
        <div className="launcher-mod-detail-config-state">{configCopy.empty}</div>
      ) : (
        <div className="launcher-mod-detail-config-groups">
          {fieldGroups.map((group, groupIndex) => (
            <section key={group.section ?? `unsectioned-${groupIndex}`} className="launcher-mod-detail-config-group">
              {group.section ? (
                <div className="launcher-mod-detail-config-group-heading">
                  <h3>{group.section}</h3>
                  <span>{group.fields.length}</span>
                </div>
              ) : null}

              <div className="launcher-mod-detail-config-fields">
                {group.fields.map((field) => {
                  const currentValue = fieldValue(field, edits)
                  const toggleChoice = resolveToggleChoice(field, currentValue)
                  const keybindMap = isLauncherConfigKeybindMap(field, currentValue)
                  const objectGroup = isLauncherConfigObjectGroup(field, currentValue)
                  const controlKind = configControlKind(field, currentValue, toggleChoice !== null)
                  return (
                    <div
                      key={field.key}
                      className="launcher-mod-detail-config-field"
                      data-control-kind={controlKind}
                      data-field-type={field.fieldType}
                    >
                      <span className="launcher-mod-detail-config-field-copy">
                        <span className="launcher-mod-detail-config-field-heading">
                          <span className="launcher-mod-detail-config-field-title">
                            <strong>{field.label}</strong>
                            {field.description ? (
                              <span
                                className="launcher-mod-detail-config-field-help"
                                aria-label={field.description}
                                title={field.description}
                              >
                                <Info className="h-3 w-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </span>
                          <em>{displaySource(field.source, configCopy.sources)}</em>
                        </span>
                        {field.description ? <p>{field.description}</p> : null}
                      </span>

                      <span className="launcher-mod-detail-config-control">
                        {keybindMap ? (
                          <LauncherModConfigKeybindMapControl
                            field={field}
                            value={currentValue}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : objectGroup ? (
                          <LauncherModConfigObjectGroupControl
                            field={field}
                            value={currentValue}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : field.uiHint === 'color' ? (
                          <LauncherModConfigColorControl
                            field={field}
                            value={currentValue}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : field.uiHint === 'keybind' || field.uiHint === 'keybind-list' ? (
                          <LauncherModConfigKeybindControl
                            field={field}
                            value={currentValue}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : field.uiHint === 'item' ? (
                          <LauncherModConfigItemControl
                            field={field}
                            value={currentValue}
                            items={configItems}
                            itemState={configItemState}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : field.uiHint === 'item-list' || (field.fieldType === 'string-array' && !field.allowValues.length) ? (
                          <LauncherModConfigListControl
                            field={field}
                            value={currentValue}
                            items={configItems}
                            itemState={configItemState}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : toggleChoice ? (
                          <span className="launcher-mod-detail-config-toggle">
                            <input
                              type="checkbox"
                              checked={toggleChoice.checked}
                              disabled={!field.editable}
                              aria-label={field.label}
                              onChange={(event) =>
                                updateField(field, event.currentTarget.checked ? toggleChoice.trueValue : toggleChoice.falseValue)
                              }
                            />
                            <span aria-hidden="true" />
                          </span>
                        ) : field.allowValues.length ? (
                          <LauncherModConfigChoiceControl
                            field={field}
                            value={currentValue}
                            onChange={(value) => updateField(field, value)}
                          />
                        ) : field.fieldType === 'object' || field.fieldType === 'unknown' ? (
                          <>
                            <textarea
                              value={jsonDrafts[field.key] ?? valueToInput(currentValue)}
                              disabled={!field.editable}
                              aria-label={field.label}
                              onChange={(event) => updateJsonField(field, event.currentTarget.value)}
                              aria-invalid={jsonErrors[field.key] ? true : undefined}
                            />
                            {jsonErrors[field.key] ? <p className="launcher-mod-detail-config-error">{configCopy.invalidJson}</p> : null}
                          </>
                        ) : (
                          <input
                            type={field.fieldType === 'integer' || field.fieldType === 'number' ? 'number' : 'text'}
                            value={valueToInput(currentValue)}
                            disabled={!field.editable}
                            aria-label={field.label}
                            onChange={(event) => updateField(field, parseFieldValue(field, event.currentTarget.value, false))}
                          />
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
