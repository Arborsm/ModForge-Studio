/**
 * Expert mode drawer: patch-level CP properties (LogName, Enabled, When,
 * Priority, Update, TargetLocale, TargetField, LocalTokens) plus EditData
 * advanced ops (Fields, MoveEntries, TextOperations).
 *
 * Replaces PatchSettingsDialog and folds EditDataAdvancedOps into the same
 * drawer so expert content is one place instead of scattered across modals.
 * Hidden when expert mode is off.
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { useEditorCopy } from '@locales/provider'
import { Disclosure } from '@shared/ui/Disclosure'
import { parseWhenConditions, serializeWhenConditions, type WhenConditionRow } from '@entities/content-patcher'
import { TokenValueInput } from './TokenValueInput'
import { WhenConditionEditor } from './WhenConditionEditor'
import { EditDataAdvancedOps } from './EditDataAdvancedOps'
import type { DraftPatch } from '../model/types'

type ExpertPanelProps = {
  patch: DraftPatch | null
  /** Project token names: config keys, dynamic tokens, aliases. */
  extraTokenNames?: readonly string[]
  /** Stages a change to patch metadata. */
  onPatchChange: (patchId: string, changes: Partial<DraftPatch>) => void
}

function toKeyValueRows(record: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = []
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      entries.push({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })
    }
  }
  return entries.length > 0 ? entries : [{ key: '', value: '' }]
}

/**
 * Expert panel for the unified authoring shell. Shows patch-level CP settings
 * and EditData advanced operations when expert mode is on.
 *
 * Outer component renders inner keyed by patch.id so local buffered state
 * resets on patch change (same pattern as EditDataAdvancedOps).
 */
export function ExpertPanel({ patch, extraTokenNames = [], onPatchChange }: ExpertPanelProps) {
  const expertMode = useEditorModeStore((state) => state.expertMode)

  if (!expertMode || !patch) {
    return null
  }

  return <ExpertPanelInner key={patch.id} patch={patch} extraTokenNames={extraTokenNames} onPatchChange={onPatchChange} />
}

type ExpertPanelInnerProps = ExpertPanelProps & { patch: DraftPatch }

function ExpertPanelInner({ patch, extraTokenNames, onPatchChange }: ExpertPanelInnerProps) {
  const copy = useEditorCopy().studioDesk.configSchemaDialog

  const [logName, setLogName] = useState(() => patch.logName ?? '')
  const [whenRows, setWhenRows] = useState<WhenConditionRow[]>(() => parseWhenConditions(patch.when))
  const [priority, setPriority] = useState(() => (patch.priority !== undefined ? String(patch.priority) : ''))
  const initialEnabledMode = typeof patch.enabled === 'string' ? 'token' : 'bool'
  const [enabledMode, setEnabledMode] = useState<'bool' | 'token'>(initialEnabledMode)
  const [enabledBool, setEnabledBool] = useState(() => (typeof patch.enabled === 'boolean' ? patch.enabled : true))
  const [enabledToken, setEnabledToken] = useState(() => (typeof patch.enabled === 'string' ? patch.enabled : ''))
  const [targetLocale, setTargetLocale] = useState(() => patch.targetLocale ?? '')
  const [update, setUpdate] = useState(() => patch.update ?? '')
  const [targetFieldText, setTargetFieldText] = useState(() => (patch.targetField ?? []).join('/'))
  const [localTokens, setLocalTokens] = useState<Array<{ key: string; value: string }>>(() => toKeyValueRows(patch.localTokens))

  function handleApply() {
    const tokens: Record<string, string> = {}
    for (const entry of localTokens) {
      if (entry.key.trim()) {
        tokens[entry.key.trim()] = entry.value
      }
    }
    const targetField = targetFieldText
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment !== '')
    const props: Partial<DraftPatch> = {}
    props.logName = logName.trim() || patch.target
    props.when = serializeWhenConditions(whenRows)
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
    props.targetField = targetField.length > 0 ? targetField : undefined
    props.localTokens = Object.keys(tokens).length > 0 ? tokens : undefined
    onPatchChange(patch.id, props)
  }

  const inputClass =
    'w-full rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)'
  const labelClass = 'mb-0.5 block text-[9px] text-(--text-secondary) uppercase'

  return (
    <aside className="expert-panel custom-scrollbar">
      <div className="expert-panel-head">
        <span className="expert-panel-title">{copy.patchPropertiesTitle(patch.logName || patch.target)}</span>
        <button type="button" className="control-button control-button-primary" onClick={handleApply}>
          {copy.save}
        </button>
      </div>

      <div className="expert-panel-body">
        {/* LogName */}
        <div>
          <label className={labelClass}>{copy.logName}</label>
          <input type="text" className={inputClass} value={logName} onChange={(e) => setLogName(e.target.value)} />
        </div>

        {/* Enabled */}
        <div>
          <label className={labelClass}>{copy.enabled}</label>
          <select
            className={inputClass}
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
            <label className="mt-1.5 flex items-center gap-2 text-xs text-(--text-primary)">
              <input
                type="checkbox"
                className="h-4 w-4 accent-(--accent)"
                checked={enabledBool}
                onChange={(e) => setEnabledBool(e.target.checked)}
              />
              {enabledBool ? copy.enabledState : copy.disabledState}
            </label>
          ) : (
            <input
              type="text"
              className={`mt-1.5 ${inputClass}`}
              value={enabledToken}
              onChange={(e) => setEnabledToken(e.target.value)}
              placeholder={copy.enabledTokenPlaceholder}
            />
          )}
        </div>

        {/* When conditions */}
        <div className="mt-3 border-t border-(--border-color) pt-2">
          <span className="text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">{copy.when}</span>
          <div className="mt-1.5">
            <WhenConditionEditor rows={whenRows} onChange={setWhenRows} extraTokenNames={extraTokenNames} />
          </div>
        </div>

        {/* Advanced options */}
        <Disclosure title={copy.advancedTitle} subtitle={copy.advancedSubtitle}>
          <div className="space-y-4">
            {/* Priority */}
            <div>
              <label className={labelClass}>{copy.priority}</label>
              <input
                type="text"
                list="priority-options"
                placeholder={patch.action === 'Load' ? copy.priorityLoadPlaceholder : copy.priorityPatchPlaceholder}
                className={inputClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <datalist id="priority-options">
                {patch.action === 'Load' ? (
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

            {/* Update */}
            <div>
              <label className={labelClass}>{copy.update}</label>
              <select className={inputClass} value={update} onChange={(e) => setUpdate(e.target.value)}>
                <option value="">{copy.updateDefault}</option>
                <option value="OnDayStart">OnDayStart</option>
                <option value="OnLocationChange">OnLocationChange</option>
                <option value="OnTimeChange">OnTimeChange</option>
              </select>
            </div>

            {/* TargetLocale */}
            <div>
              <label className={labelClass}>{copy.targetLocale}</label>
              <input
                type="text"
                placeholder={copy.targetLocalePlaceholder}
                className={inputClass}
                value={targetLocale}
                onChange={(e) => setTargetLocale(e.target.value)}
              />
            </div>

            {/* TargetField */}
            <div>
              <label className={labelClass}>{copy.targetField}</label>
              <input
                type="text"
                placeholder={copy.targetFieldPlaceholder}
                className={inputClass}
                value={targetFieldText}
                onChange={(e) => setTargetFieldText(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-(--text-secondary)">{copy.targetFieldHint}</p>
            </div>

            {/* LocalTokens */}
            <div className="border-t border-(--border-color) pt-2">
              <span className="text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">{copy.localTokens}</span>
              <div className="mt-1.5 space-y-2">
                {localTokens.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={copy.tokenNamePlaceholder}
                      className={`flex-1 ${inputClass}`}
                      value={entry.key}
                      onChange={(e) => {
                        const next = [...localTokens]
                        next[index] = { ...entry, key: e.target.value }
                        setLocalTokens(next)
                      }}
                    />
                    <div className="flex-1">
                      <TokenValueInput
                        placeholder={copy.valuePlaceholder}
                        className={inputClass}
                        value={entry.value}
                        extraTokenNames={extraTokenNames}
                        onChange={(value) => {
                          const next = [...localTokens]
                          next[index] = { ...entry, value }
                          setLocalTokens(next)
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-button h-7 w-7 shrink-0 text-(--danger)"
                      onClick={() => setLocalTokens(localTokens.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
                  onClick={() => setLocalTokens([...localTokens, { key: '', value: '' }])}
                >
                  <Plus className="h-3 w-3" /> {copy.addToken}
                </button>
              </div>
            </div>
          </div>
        </Disclosure>

        {/* EditData advanced ops: lifted from EditorPage */}
        {patch.action === 'EditData' ? (
          <div className="mt-3 border-t border-(--border-color) pt-3">
            <EditDataAdvancedOps patch={patch} onEditorStateChange={(editorState) => onPatchChange(patch.id, { editorState })} />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
