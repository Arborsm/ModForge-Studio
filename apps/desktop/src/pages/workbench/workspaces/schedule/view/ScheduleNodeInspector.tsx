import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useScheduleEditorCopy } from '@locales/provider'
import {
  buildScheduleTime,
  getScheduleFacingId,
  getScheduleTimeParts,
  SCHEDULE_BED_LOCATION,
  SCHEDULE_FACING_IDS,
  SCHEDULE_HOUR_OPTIONS,
  SCHEDULE_MINUTE_OPTIONS,
  type ScheduleFacing,
  type SchedulePointSegment,
  type ScheduleSegment,
} from '../entities/schedule'
import type { ScheduleLocationOption } from '../state/useScheduleWorkspace'

type ScheduleNodeInspectorProps = {
  segment: ScheduleSegment | null
  segmentIndex: number | null
  segmentCount: number
  locationOptions: ScheduleLocationOption[]
  locationCatalogReady: boolean
  locationListId: string
  gotoListId: string
  animationListId: string
  readOnly: boolean
  onChange: (segment: ScheduleSegment) => void
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}

function PointFields({
  point,
  locationOptions,
  locationCatalogReady,
  locationListId,
  animationListId,
  readOnly,
  onChange,
}: {
  point: SchedulePointSegment
  locationOptions: ScheduleLocationOption[]
  locationCatalogReady: boolean
  locationListId: string
  animationListId: string
  readOnly: boolean
  onChange: (point: SchedulePointSegment) => void
}) {
  const copy = useScheduleEditorCopy()
  const { hour, minute } = getScheduleTimeParts(point.time)
  const hourOptions = SCHEDULE_HOUR_OPTIONS.includes(hour) ? SCHEDULE_HOUR_OPTIONS : [hour, ...SCHEDULE_HOUR_OPTIONS]
  const minuteOptions = SCHEDULE_MINUTE_OPTIONS.includes(minute) ? SCHEDULE_MINUTE_OPTIONS : [minute, ...SCHEDULE_MINUTE_OPTIONS]
  const locationHint =
    point.location === SCHEDULE_BED_LOCATION
      ? copy.bedLocationHint
      : point.location && locationCatalogReady
        ? (locationOptions.find((option) => option.value === point.location)?.label ?? copy.locationHintUnknown)
        : null

  function updateCoordinate(axis: 'x' | 'y', raw: string) {
    if (raw.trim() === '') {
      onChange({ ...point, x: null, y: null })
      return
    }
    const value = Number.parseInt(raw, 10)
    if (!Number.isFinite(value)) return
    onChange(axis === 'x' ? { ...point, x: value, y: point.y ?? 0 } : { ...point, x: point.x ?? 0, y: value })
  }

  return (
    <div className="schedule-node-inspector-fields">
      <label className="schedule-editor-checkbox">
        <input
          type="checkbox"
          checked={point.arrival}
          disabled={readOnly}
          onChange={(event) => onChange({ ...point, arrival: event.target.checked })}
        />
        <span>{copy.arrivalToggleLabel}</span>
      </label>
      <fieldset className="schedule-node-time-field">
        <legend>{copy.timeColumn}</legend>
        <select
          className="control-input"
          value={hour}
          disabled={readOnly}
          onChange={(event) => onChange({ ...point, time: buildScheduleTime(Number.parseInt(event.target.value, 10), minute) })}
        >
          {hourOptions.map((option) => (
            <option key={option} value={option}>
              {copy.hourOptionTemplate.replace('{hour}', String(option))}
            </option>
          ))}
        </select>
        <select
          className="control-input"
          value={minute}
          disabled={readOnly}
          onChange={(event) => onChange({ ...point, time: buildScheduleTime(hour, Number.parseInt(event.target.value, 10)) })}
        >
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {String(option).padStart(2, '0')}
            </option>
          ))}
        </select>
      </fieldset>
      <label>
        <span>{copy.locationColumn}</span>
        <input
          className="control-input"
          list={locationListId}
          value={point.location ?? ''}
          disabled={readOnly}
          placeholder={copy.locationPlaceholder}
          spellCheck={false}
          onChange={(event) => onChange({ ...point, location: event.target.value || null })}
        />
        {locationHint ? <small>{locationHint}</small> : null}
      </label>
      <fieldset className="schedule-node-coordinate-field">
        <legend>{copy.coordinateColumn}</legend>
        <label>
          <span>{copy.coordinateXLabel}</span>
          <input
            className="control-input"
            type="number"
            value={point.x ?? ''}
            disabled={readOnly}
            onChange={(event) => updateCoordinate('x', event.target.value)}
          />
        </label>
        <label>
          <span>{copy.coordinateYLabel}</span>
          <input
            className="control-input"
            type="number"
            value={point.y ?? ''}
            disabled={readOnly}
            onChange={(event) => updateCoordinate('y', event.target.value)}
          />
        </label>
      </fieldset>
      <label>
        <span>{copy.facingColumn}</span>
        <select
          className="control-input"
          value={point.facing ?? ''}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...point, facing: event.target.value === '' ? null : (Number.parseInt(event.target.value, 10) as ScheduleFacing) })
          }
        >
          <option value="">{copy.facingUnsetOption}</option>
          {SCHEDULE_FACING_IDS.map((facingId, facingValue) => (
            <option key={facingId} value={facingValue}>
              {copy.facingLabels[getScheduleFacingId(facingValue as ScheduleFacing)]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{copy.animationColumn}</span>
        <input
          className="control-input"
          list={animationListId}
          value={point.animation ?? ''}
          disabled={readOnly}
          placeholder={copy.animationPlaceholder}
          onChange={(event) => onChange({ ...point, animation: event.target.value || null })}
        />
      </label>
      <label>
        <span>{copy.dialogueColumn}</span>
        <input
          className="control-input"
          value={point.dialogue ?? ''}
          disabled={readOnly}
          placeholder={copy.dialoguePlaceholder}
          onChange={(event) => onChange({ ...point, dialogue: event.target.value || null })}
        />
      </label>
    </div>
  )
}

/** Form dock for the node selected in the route graph. */
export function ScheduleNodeInspector({
  segment,
  segmentIndex,
  segmentCount,
  locationOptions,
  locationCatalogReady,
  locationListId,
  gotoListId,
  animationListId,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: ScheduleNodeInspectorProps) {
  const copy = useScheduleEditorCopy()
  if (segment === null || segmentIndex === null) {
    return (
      <aside className="schedule-node-inspector is-empty">
        <p>{copy.map.selectSegmentHint}</p>
      </aside>
    )
  }

  const title =
    segment.kind === 'point'
      ? copy.timeColumn
      : segment.kind === 'goto'
        ? copy.segmentGotoLabel
        : segment.kind === 'notFriendship'
          ? copy.segmentFriendshipLabel
          : segment.kind === 'mail'
            ? copy.segmentMailLabel
            : copy.segmentRawLabel

  return (
    <aside className="schedule-node-inspector custom-scrollbar">
      <header>
        <div>
          <strong>{title}</strong>
          <span>
            {segmentIndex + 1} / {segmentCount}
          </span>
        </div>
        <span className="schedule-node-inspector-actions">
          <button
            type="button"
            className="icon-button"
            title={copy.moveUpLabel}
            disabled={readOnly || segmentIndex === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button"
            title={copy.moveDownLabel}
            disabled={readOnly || segmentIndex === segmentCount - 1}
            onClick={() => onMove(1)}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="icon-button is-danger" title={copy.deleteRowLabel} disabled={readOnly} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </header>

      {segment.kind === 'point' ? (
        <PointFields
          point={segment}
          locationOptions={locationOptions}
          locationCatalogReady={locationCatalogReady}
          locationListId={locationListId}
          animationListId={animationListId}
          readOnly={readOnly}
          onChange={onChange}
        />
      ) : null}
      {segment.kind === 'goto' ? (
        <label className="schedule-node-command-field">
          <span>{copy.segmentGotoLabel}</span>
          <input
            className="control-input"
            list={gotoListId}
            value={segment.target}
            disabled={readOnly}
            placeholder={copy.gotoTargetPlaceholder}
            onChange={(event) => onChange({ ...segment, target: event.target.value })}
          />
        </label>
      ) : null}
      {segment.kind === 'mail' ? (
        <label className="schedule-node-command-field">
          <span>{copy.segmentMailLabel}</span>
          <input
            className="control-input"
            value={segment.mailId}
            disabled={readOnly}
            placeholder={copy.mailIdPlaceholder}
            onChange={(event) => onChange({ ...segment, mailId: event.target.value })}
          />
        </label>
      ) : null}
      {segment.kind === 'raw' ? (
        <label className="schedule-node-command-field">
          <span>{copy.segmentRawLabel}</span>
          <textarea
            className="control-input font-mono"
            value={segment.text}
            disabled={readOnly}
            placeholder={copy.rawSegmentPlaceholder}
            onChange={(event) => onChange({ ...segment, text: event.target.value })}
          />
        </label>
      ) : null}
      {segment.kind === 'notFriendship' ? (
        <div className="schedule-node-inspector-fields">
          {segment.requirements.map((requirement, index) => (
            <div key={index} className="schedule-node-friendship-field">
              <label>
                <span>{copy.friendshipNpcPlaceholder}</span>
                <input
                  className="control-input"
                  value={requirement.npc}
                  disabled={readOnly}
                  onChange={(event) =>
                    onChange({
                      ...segment,
                      requirements: segment.requirements.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, npc: event.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                <span>{copy.friendshipHeartsLabel}</span>
                <input
                  className="control-input"
                  type="number"
                  min={0}
                  max={14}
                  value={requirement.hearts}
                  disabled={readOnly}
                  onChange={(event) =>
                    onChange({
                      ...segment,
                      requirements: segment.requirements.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, hearts: Math.max(0, Number.parseInt(event.target.value, 10) || 0) } : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button is-danger"
                title={copy.removeFriendshipPairLabel}
                disabled={readOnly || segment.requirements.length <= 1}
                onClick={() => onChange({ ...segment, requirements: segment.requirements.filter((_, itemIndex) => itemIndex !== index) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="control-button"
            disabled={readOnly}
            onClick={() => onChange({ ...segment, requirements: [...segment.requirements, { npc: '', hearts: 6 }] })}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{copy.addFriendshipPairAction}</span>
          </button>
        </div>
      ) : null}
    </aside>
  )
}
