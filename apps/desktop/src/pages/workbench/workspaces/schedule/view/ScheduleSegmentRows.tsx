import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useScheduleEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import {
  buildScheduleTime,
  getScheduleFacingId,
  getScheduleTimeParts,
  SCHEDULE_BED_LOCATION,
  SCHEDULE_FACING_IDS,
  SCHEDULE_HOUR_OPTIONS,
  SCHEDULE_MINUTE_OPTIONS,
  type ScheduleFacing,
  type ScheduleGotoSegment,
  type ScheduleMailSegment,
  type ScheduleNotFriendshipSegment,
  type SchedulePointSegment,
  type ScheduleRawSegment,
} from '../entities/schedule'
import type { ScheduleLocationOption } from '../state/useScheduleWorkspace'

type SegmentRowChrome = {
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}

function SegmentRowActions({ canMoveUp, canMoveDown, onMove, onRemove }: SegmentRowChrome) {
  const copy = useScheduleEditorCopy()
  return (
    <span className="schedule-editor-row-actions">
      <button
        type="button"
        className="schedule-editor-row-action"
        title={copy.moveUpLabel}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="schedule-editor-row-action"
        title={copy.moveDownLabel}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="schedule-editor-row-action is-danger" title={copy.deleteRowLabel} onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** Column header for the structured point table. */
export function SchedulePointColumnsHeader() {
  const copy = useScheduleEditorCopy()
  return (
    <div className="schedule-editor-segment-columns schedule-editor-segment-columns-header" aria-hidden="true">
      <span>{copy.timeColumn}</span>
      <span>{copy.locationColumn}</span>
      <span className="col-span-2">{copy.coordinateColumn}</span>
      <span>{copy.facingColumn}</span>
      <span>{copy.animationColumn}</span>
      <span>{copy.dialogueColumn}</span>
      <span />
    </div>
  )
}

type SchedulePointRowProps = SegmentRowChrome & {
  point: SchedulePointSegment
  locationOptions: ScheduleLocationOption[]
  locationCatalogReady: boolean
  locationListId: string
  animationListId: string
  onChange: (point: SchedulePointSegment) => void
}

/** Editable structured row for one schedule time point. */
export function SchedulePointRow({
  point,
  locationOptions,
  locationCatalogReady,
  locationListId,
  animationListId,
  onChange,
  ...chrome
}: SchedulePointRowProps) {
  const copy = useScheduleEditorCopy()
  const { hour, minute } = getScheduleTimeParts(point.time)
  const hourOptions = SCHEDULE_HOUR_OPTIONS.includes(hour) ? SCHEDULE_HOUR_OPTIONS : [hour, ...SCHEDULE_HOUR_OPTIONS]
  const minuteOptions = SCHEDULE_MINUTE_OPTIONS.includes(minute) ? SCHEDULE_MINUTE_OPTIONS : [minute, ...SCHEDULE_MINUTE_OPTIONS]

  const locationHint =
    point.location === SCHEDULE_BED_LOCATION
      ? copy.bedLocationHint
      : point.location && locationCatalogReady
        ? (locationOptions.find((option) => option.value === point.location)?.label ?? copy.locationHintUnknown)
        : ''

  function handleCoordinateChange(axis: 'x' | 'y', raw: string) {
    if (raw.trim() === '') {
      onChange({ ...point, x: null, y: null })
      return
    }
    const value = Number.parseInt(raw, 10)
    if (!Number.isFinite(value)) {
      return
    }
    onChange(axis === 'x' ? { ...point, x: value, y: point.y ?? 0 } : { ...point, x: point.x ?? 0, y: value })
  }

  return (
    <div className="schedule-editor-segment-columns">
      <span className="schedule-editor-time-cell">
        <button
          type="button"
          className={cx('schedule-editor-arrival-toggle', point.arrival && 'is-active')}
          title={copy.arrivalToggleLabel}
          aria-pressed={point.arrival}
          onClick={() => onChange({ ...point, arrival: !point.arrival })}
        >
          a
        </button>
        <select
          className="control-input schedule-editor-mini-select"
          value={hour}
          aria-label={copy.timeColumn}
          onChange={(event) => onChange({ ...point, time: buildScheduleTime(Number.parseInt(event.target.value, 10), minute) })}
        >
          {hourOptions.map((option) => (
            <option key={option} value={option}>
              {copy.hourOptionTemplate.replace('{hour}', String(option))}
            </option>
          ))}
        </select>
        <select
          className="control-input schedule-editor-mini-select"
          value={minute}
          aria-label={copy.timeColumn}
          onChange={(event) => onChange({ ...point, time: buildScheduleTime(hour, Number.parseInt(event.target.value, 10)) })}
        >
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {String(option).padStart(2, '0')}
            </option>
          ))}
        </select>
      </span>
      <span className="schedule-editor-cell">
        <input
          className="control-input schedule-editor-mini-input"
          list={locationListId}
          value={point.location ?? ''}
          placeholder={copy.locationPlaceholder}
          spellCheck={false}
          onChange={(event) => onChange({ ...point, location: event.target.value === '' ? null : event.target.value })}
        />
        {locationHint ? <span className="schedule-editor-cell-hint">{locationHint}</span> : null}
      </span>
      <input
        className="control-input schedule-editor-mini-input"
        type="number"
        value={point.x ?? ''}
        aria-label={copy.coordinateXLabel}
        title={copy.coordinateUnsetHint}
        onChange={(event) => handleCoordinateChange('x', event.target.value)}
      />
      <input
        className="control-input schedule-editor-mini-input"
        type="number"
        value={point.y ?? ''}
        aria-label={copy.coordinateYLabel}
        title={copy.coordinateUnsetHint}
        onChange={(event) => handleCoordinateChange('y', event.target.value)}
      />
      <select
        className="control-input schedule-editor-mini-select"
        value={point.facing ?? ''}
        aria-label={copy.facingColumn}
        onChange={(event) =>
          onChange({ ...point, facing: event.target.value === '' ? null : (Number.parseInt(event.target.value, 10) as ScheduleFacing) })
        }
      >
        <option value="">{copy.facingUnsetOption}</option>
        {SCHEDULE_FACING_IDS.map((facingId, facingValue) => (
          <option key={facingId} value={facingValue}>
            {copy.facingLabels[getScheduleFacingId(facingValue as ScheduleFacing)]} ({facingValue})
          </option>
        ))}
      </select>
      <input
        className="control-input schedule-editor-mini-input"
        list={animationListId}
        value={point.animation ?? ''}
        placeholder={copy.animationPlaceholder}
        aria-label={copy.animationColumn}
        title={copy.animationSuggestionHint}
        spellCheck={false}
        onChange={(event) => onChange({ ...point, animation: event.target.value === '' ? null : event.target.value })}
      />
      <input
        className="control-input schedule-editor-mini-input"
        value={point.dialogue ?? ''}
        placeholder={copy.dialoguePlaceholder}
        spellCheck={false}
        onChange={(event) => onChange({ ...point, dialogue: event.target.value === '' ? null : event.target.value })}
      />
      <SegmentRowActions {...chrome} />
    </div>
  )
}

type ScheduleGotoRowProps = SegmentRowChrome & {
  segment: ScheduleGotoSegment
  gotoListId: string
  onChange: (segment: ScheduleGotoSegment) => void
}

/** Editable row for a `GOTO <key>` redirect segment. */
export function ScheduleGotoRow({ segment, gotoListId, onChange, ...chrome }: ScheduleGotoRowProps) {
  const copy = useScheduleEditorCopy()
  return (
    <div className="schedule-editor-command-row">
      <span className="schedule-editor-command-chip">{copy.segmentGotoLabel}</span>
      <span className="schedule-editor-command-body">
        <input
          className="control-input schedule-editor-mini-input max-w-64"
          list={gotoListId}
          value={segment.target}
          placeholder={copy.gotoTargetPlaceholder}
          spellCheck={false}
          onChange={(event) => onChange({ ...segment, target: event.target.value })}
        />
      </span>
      <SegmentRowActions {...chrome} />
    </div>
  )
}

type ScheduleFriendshipRowProps = SegmentRowChrome & {
  segment: ScheduleNotFriendshipSegment
  onChange: (segment: ScheduleNotFriendshipSegment) => void
}

/** Editable row for a `NOT friendship <npc> <hearts> [...]` guard segment. */
export function ScheduleFriendshipRow({ segment, onChange, ...chrome }: ScheduleFriendshipRowProps) {
  const copy = useScheduleEditorCopy()

  function updateRequirement(index: number, patch: Partial<ScheduleNotFriendshipSegment['requirements'][number]>) {
    onChange({
      ...segment,
      requirements: segment.requirements.map((requirement, currentIndex) =>
        currentIndex === index ? { ...requirement, ...patch } : requirement,
      ),
    })
  }

  return (
    <div className="schedule-editor-command-row">
      <span className="schedule-editor-command-chip">{copy.segmentFriendshipLabel}</span>
      <span className="schedule-editor-command-body">
        {segment.requirements.map((requirement, index) => (
          <span key={index} className="schedule-editor-friendship-pair">
            <input
              className="control-input schedule-editor-mini-input w-32"
              value={requirement.npc}
              placeholder={copy.friendshipNpcPlaceholder}
              spellCheck={false}
              onChange={(event) => updateRequirement(index, { npc: event.target.value })}
            />
            <input
              className="control-input schedule-editor-mini-input w-14"
              type="number"
              min={0}
              max={14}
              value={requirement.hearts}
              aria-label={copy.friendshipHeartsLabel}
              onChange={(event) => {
                const hearts = Number.parseInt(event.target.value, 10)
                if (Number.isFinite(hearts)) {
                  updateRequirement(index, { hearts: Math.max(0, hearts) })
                }
              }}
            />
            <span className="schedule-editor-hint">{copy.friendshipHeartsLabel}</span>
            <button
              type="button"
              className="schedule-editor-row-action is-danger"
              title={copy.removeFriendshipPairLabel}
              disabled={segment.requirements.length <= 1}
              onClick={() =>
                onChange({ ...segment, requirements: segment.requirements.filter((_, currentIndex) => currentIndex !== index) })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="control-button h-8"
          onClick={() => onChange({ ...segment, requirements: [...segment.requirements, { npc: '', hearts: 6 }] })}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{copy.addFriendshipPairAction}</span>
        </button>
      </span>
      <SegmentRowActions {...chrome} />
    </div>
  )
}

type ScheduleMailRowProps = SegmentRowChrome & {
  segment: ScheduleMailSegment
  onChange: (segment: ScheduleMailSegment) => void
}

/** Editable row for a `MAIL <mailId>` branch segment. */
export function ScheduleMailRow({ segment, onChange, ...chrome }: ScheduleMailRowProps) {
  const copy = useScheduleEditorCopy()
  return (
    <div className="schedule-editor-command-row">
      <span className="schedule-editor-command-chip">{copy.segmentMailLabel}</span>
      <span className="schedule-editor-command-body">
        <input
          className="control-input schedule-editor-mini-input max-w-64"
          value={segment.mailId}
          placeholder={copy.mailIdPlaceholder}
          spellCheck={false}
          onChange={(event) => onChange({ ...segment, mailId: event.target.value })}
        />
      </span>
      <SegmentRowActions {...chrome} />
    </div>
  )
}

type ScheduleRawRowProps = SegmentRowChrome & {
  segment: ScheduleRawSegment
  onChange: (segment: ScheduleRawSegment) => void
}

/** Verbatim editor row for segments outside the structured grammar. */
export function ScheduleRawRow({ segment, onChange, ...chrome }: ScheduleRawRowProps) {
  const copy = useScheduleEditorCopy()
  return (
    <div className="schedule-editor-command-row">
      <span className="schedule-editor-command-chip">{copy.segmentRawLabel}</span>
      <span className="schedule-editor-command-body">
        <input
          className="control-input schedule-editor-mini-input font-mono"
          value={segment.text}
          placeholder={copy.rawSegmentPlaceholder}
          spellCheck={false}
          onChange={(event) => onChange({ ...segment, text: event.target.value })}
        />
      </span>
      <SegmentRowActions {...chrome} />
    </div>
  )
}
