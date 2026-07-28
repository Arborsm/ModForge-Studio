import { useEffect, useId, useState } from 'react'
import { AlertTriangle, Copy, Plus } from 'lucide-react'
import { useScheduleEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import {
  resolveScheduleTilePick,
  SCHEDULE_GOTO_EXTRA_TARGETS,
  SCHEDULE_KEY_SUGGESTIONS,
  type ScheduleModelIssue,
  type ScheduleSegment,
} from '../entities/schedule'
import type { ScheduleActiveEntry, ScheduleEditorMode, ScheduleLocationOption } from '../state/useScheduleWorkspace'
import {
  ScheduleFriendshipRow,
  ScheduleGotoRow,
  ScheduleMailRow,
  SchedulePointColumnsHeader,
  SchedulePointRow,
  ScheduleRawRow,
} from './ScheduleSegmentRows'
import { ScheduleMapPanel } from './ScheduleMapPanel'

type ScheduleEntryEditorProps = {
  active: ScheduleActiveEntry
  mode: ScheduleEditorMode
  canDelete: boolean
  deleteArmed: boolean
  entryKeys: string[]
  locationOptions: ScheduleLocationOption[]
  locationCatalogReady: boolean
  /** Vanilla animation keys, already ranked for the selected NPC. */
  animationOptions: string[]
  /** Selected NPC, used to mark the current point with their sprite. */
  npcId: string | null
  vanillaReferenceScript: string | null
  onSetMode: (mode: ScheduleEditorMode) => void
  onRenameEntry: (key: string) => 'empty' | 'conflict' | null
  onSetLabel: (label: string) => void
  onSetEnabled: (enabled: boolean) => void
  onSetRawScript: (script: string) => void
  onUpdateSegment: (index: number, segment: ScheduleSegment) => void
  onRemoveSegment: (index: number) => void
  onMoveSegment: (index: number, offset: -1 | 1) => void
  onAppendSegment: (segment: ScheduleSegment) => void
  onAddTimePoint: () => void
  onOverrideVanilla: () => void
  onDelete: () => void
}

function ModeSwitch({ mode, onSetMode }: { mode: ScheduleEditorMode; onSetMode: (mode: ScheduleEditorMode) => void }) {
  const copy = useScheduleEditorCopy()
  return (
    <div className="flex gap-px rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-px">
      {(
        [
          ['structured', copy.modeStructured],
          ['raw', copy.modeRaw],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={cx(
            'rounded-[0.4375rem] px-3 py-1.5 text-xs font-semibold transition-colors',
            mode === value
              ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_-1.5px_0_0_var(--accent)]'
              : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
          )}
          onClick={() => onSetMode(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Entry key field. The key is the entry's identity in the patch, so a change is
 * applied as an explicit rename on blur or Enter and rejected — with the field
 * reverting — when the new key is taken.
 */
function EntryKeyField({
  entryKey,
  readOnly,
  onRename,
}: {
  entryKey: string
  readOnly: boolean
  onRename: (key: string) => 'empty' | 'conflict' | null
}) {
  const copy = useScheduleEditorCopy()
  const keyListId = useId()
  const [value, setValue] = useState(entryKey)
  const [error, setError] = useState<'empty' | 'conflict' | null>(null)

  useEffect(() => {
    setValue(entryKey)
    setError(null)
  }, [entryKey])

  function apply() {
    if (value.trim() === entryKey) {
      setValue(entryKey)
      setError(null)
      return
    }
    setError(onRename(value))
  }

  return (
    <label className="schedule-editor-form-field">
      <span className="schedule-editor-field-label">{copy.entryKeyLabel}</span>
      <datalist id={keyListId}>
        {SCHEDULE_KEY_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <input
        className="control-input font-mono"
        list={keyListId}
        value={value}
        disabled={readOnly}
        placeholder={copy.entryKeyPlaceholder}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            apply()
          }
          if (event.key === 'Escape') {
            setValue(entryKey)
            setError(null)
          }
        }}
      />
      {error ? (
        <span className="schedule-editor-inline-error">{error === 'empty' ? copy.keyRequiredError : copy.keyConflictError}</span>
      ) : null}
    </label>
  )
}

function ScheduleIssueList({ issues }: { issues: ScheduleModelIssue[] }) {
  const copy = useScheduleEditorCopy()
  const rawCount = issues.filter((issue) => issue.kind === 'raw-segment').length
  const otherIssues = issues.filter((issue) => issue.kind !== 'raw-segment')

  if (rawCount === 0 && otherIssues.length === 0) {
    return null
  }

  function describeIssue(issue: ScheduleModelIssue): string {
    switch (issue.kind) {
      case 'time-out-of-range':
        return copy.timeRangeWarningTemplate.replace('{time}', String(issue.time))
      case 'dialogue-quote':
        return copy.dialogueQuoteWarning
      case 'goto-target-missing':
        return copy.gotoTargetMissingError
      case 'mail-id-missing':
        return copy.mailIdMissingError
      case 'friendship-npc-missing':
        return copy.friendshipNpcMissingError
      case 'raw-segment':
        return copy.rawParseWarningTemplate.replace('{count}', '1')
    }
  }

  return (
    <div className="schedule-editor-issues" role="status">
      {rawCount > 0 ? (
        <span className="schedule-editor-issue">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {copy.rawParseWarningTemplate.replace('{count}', String(rawCount))}
        </span>
      ) : null}
      {otherIssues.map((issue, index) => (
        <span
          key={`${issue.kind}:${issue.index}:${index}`}
          className={cx('schedule-editor-issue', issue.severity === 'error' && 'is-error')}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {describeIssue(issue)}
        </span>
      ))}
    </div>
  )
}

/**
 * Main editing surface for one schedule entry: identity form (key, title, mode,
 * enabled), the structured segment table or raw textarea, warnings and the
 * synced raw-script preview. Every control writes straight into the staged
 * draft — the page header owns saving and discarding.
 */
export function ScheduleEntryEditor({
  active,
  mode,
  canDelete,
  deleteArmed,
  entryKeys,
  locationOptions,
  locationCatalogReady,
  animationOptions,
  npcId,
  vanillaReferenceScript,
  onSetMode,
  onRenameEntry,
  onSetLabel,
  onSetEnabled,
  onSetRawScript,
  onUpdateSegment,
  onRemoveSegment,
  onMoveSegment,
  onAppendSegment,
  onAddTimePoint,
  onOverrideVanilla,
  onDelete,
}: ScheduleEntryEditorProps) {
  const copy = useScheduleEditorCopy()
  const locationListId = useId()
  const gotoListId = useId()
  const animationListId = useId()
  const { summary, model, issues, readOnly } = active
  const segments = model.segments
  const hasPointSegments = segments.some((segment) => segment.kind === 'point')
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null)

  // Removing or reordering rows can leave the stored index pointing at a gone or
  // non-point segment, so the selection is re-validated against the live array
  // instead of being trusted.
  const selectedPointIndex = selectedSegmentIndex !== null && segments[selectedSegmentIndex]?.kind === 'point' ? selectedSegmentIndex : null

  return (
    <div className="schedule-editor-content">
      <div className="schedule-editor-form-column">
        <datalist id={locationListId}>
          {locationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
        <datalist id={gotoListId}>
          {[...new Set([...entryKeys, ...SCHEDULE_GOTO_EXTRA_TARGETS])].map((target) => (
            <option key={target} value={target} />
          ))}
        </datalist>
        <datalist id={animationListId}>
          {animationOptions.map((animation) => (
            <option key={animation} value={animation} />
          ))}
        </datalist>

        {readOnly ? (
          <div className="schedule-editor-readonly-banner">
            <span className="schedule-editor-badge">{copy.readOnlyBadge}</span>
            <span className="schedule-editor-hint">{copy.readOnlyHint}</span>
            <button type="button" className="control-button control-button-primary" onClick={onOverrideVanilla}>
              <Copy className="h-3.5 w-3.5" />
              <span>{copy.overrideVanillaAction}</span>
            </button>
          </div>
        ) : null}

        <div className="schedule-editor-form">
          <EntryKeyField entryKey={summary.key} readOnly={readOnly} onRename={onRenameEntry} />
          <label className="schedule-editor-form-field">
            <span className="schedule-editor-field-label">{copy.labelLabel}</span>
            <input
              className="control-input"
              value={summary.label ?? ''}
              disabled={readOnly}
              placeholder={copy.labelPlaceholder}
              onChange={(event) => onSetLabel(event.target.value)}
            />
          </label>
          <div className="schedule-editor-form-field">
            <span className="schedule-editor-field-label">{copy.modeLabel}</span>
            <ModeSwitch mode={mode} onSetMode={onSetMode} />
          </div>
          <label className="schedule-editor-checkbox">
            <input type="checkbox" checked={summary.enabled} disabled={readOnly} onChange={(event) => onSetEnabled(event.target.checked)} />
            <span>{copy.enabledLabel}</span>
          </label>
        </div>

        {mode === 'structured' ? (
          <section className="schedule-editor-section">
            <div className="schedule-editor-segment-table">
              {hasPointSegments ? <SchedulePointColumnsHeader /> : null}
              {segments.length === 0 ? <span className="schedule-editor-hint">{copy.noSegmentsHint}</span> : null}
              {segments.map((segment, index) => {
                const chrome = {
                  canMoveUp: index > 0,
                  canMoveDown: index < segments.length - 1,
                  onMove: (offset: -1 | 1) => onMoveSegment(index, offset),
                  onRemove: () => onRemoveSegment(index),
                }
                const isSelected = selectedSegmentIndex === index
                switch (segment.kind) {
                  case 'point':
                    return (
                      <div
                        key={index}
                        className={cx('schedule-editor-segment-row', isSelected && 'is-selected')}
                        onClick={() => setSelectedSegmentIndex(index)}
                      >
                        <SchedulePointRow
                          point={segment}
                          locationOptions={locationOptions}
                          locationCatalogReady={locationCatalogReady}
                          locationListId={locationListId}
                          animationListId={animationListId}
                          onChange={(next) => onUpdateSegment(index, next)}
                          {...chrome}
                        />
                      </div>
                    )
                  case 'goto':
                    return (
                      <ScheduleGotoRow
                        key={index}
                        segment={segment}
                        gotoListId={gotoListId}
                        onChange={(next) => onUpdateSegment(index, next)}
                        {...chrome}
                      />
                    )
                  case 'notFriendship':
                    return (
                      <ScheduleFriendshipRow key={index} segment={segment} onChange={(next) => onUpdateSegment(index, next)} {...chrome} />
                    )
                  case 'mail':
                    return <ScheduleMailRow key={index} segment={segment} onChange={(next) => onUpdateSegment(index, next)} {...chrome} />
                  case 'raw':
                    return <ScheduleRawRow key={index} segment={segment} onChange={(next) => onUpdateSegment(index, next)} {...chrome} />
                }
              })}
            </div>
            <div className="schedule-editor-segment-toolbar">
              <button type="button" className="control-button control-button-primary" disabled={readOnly} onClick={onAddTimePoint}>
                <Plus className="h-3.5 w-3.5" />
                <span>{copy.addTimePointAction}</span>
              </button>
              <button
                type="button"
                className="control-button"
                disabled={readOnly}
                onClick={() => onAppendSegment({ kind: 'goto', target: '' })}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{copy.addGotoAction}</span>
              </button>
              <button
                type="button"
                className="control-button"
                disabled={readOnly}
                onClick={() => onAppendSegment({ kind: 'notFriendship', requirements: [{ npc: '', hearts: 6 }] })}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{copy.addFriendshipAction}</span>
              </button>
              <button
                type="button"
                className="control-button"
                disabled={readOnly}
                onClick={() => onAppendSegment({ kind: 'mail', mailId: '' })}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{copy.addMailAction}</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="schedule-editor-section">
            <textarea
              className="control-input schedule-editor-raw-textarea"
              value={summary.script}
              disabled={readOnly}
              placeholder={copy.rawTextareaPlaceholder}
              spellCheck={false}
              onChange={(event) => onSetRawScript(event.target.value)}
            />
          </section>
        )}

        <ScheduleIssueList issues={issues} />

        <section className="schedule-editor-script-panel">
          <div className="schedule-editor-section-title">
            <span>{copy.rawScriptTitle}</span>
            <span className="schedule-editor-section-hint">{copy.rawScriptHint}</span>
          </div>
          <pre className="schedule-editor-script-pre">{summary.script}</pre>
        </section>

        {vanillaReferenceScript != null ? (
          <section className="schedule-editor-script-panel">
            <div className="schedule-editor-section-title">
              <span>{copy.vanillaReferenceTitle}</span>
            </div>
            <pre className="schedule-editor-script-pre">{vanillaReferenceScript}</pre>
          </section>
        ) : null}

        {canDelete ? (
          <div className="schedule-editor-actions">
            <span className="schedule-editor-actions-spacer" />
            <button type="button" className={cx('control-button', deleteArmed && 'text-(--danger)')} onClick={onDelete}>
              <span>{deleteArmed ? copy.deleteConfirmAction : copy.deleteAction}</span>
            </button>
          </div>
        ) : null}
      </div>

      {mode === 'structured' ? (
        <div className="schedule-editor-map-container">
          <ScheduleMapPanel
            segments={segments}
            locationOptions={locationOptions}
            selectedIndex={selectedPointIndex}
            npcId={npcId}
            readOnly={readOnly}
            onPickTile={(location, tileX, tileY) => {
              if (readOnly) {
                return
              }
              const resolved = resolveScheduleTilePick(segments, selectedPointIndex, location, tileX, tileY)
              if (resolved) {
                onUpdateSegment(resolved.segmentIndex, resolved.segment)
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
