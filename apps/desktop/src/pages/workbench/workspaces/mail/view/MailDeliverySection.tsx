import { useState } from 'react'
import { Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import { useEditorCopy, useMailEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import {
  MAIL_DELIVERY_TYPES,
  MAIL_TRIGGER_EVENTS,
  MAIL_TRIGGER_TARGETS,
  type MailDeliveryType,
  type MailTriggerDraft,
  type MailTriggerTarget,
} from '../entities/mail'
import type { MailTriggerRow } from '../state/useMailWorkspace'
import { fillTemplate } from './mailCopyHelpers'

/** Select value standing for a trigger name outside `MAIL_TRIGGER_EVENTS`. */
const CUSTOM_EVENT_VALUE = '__custom__'

/** Raw `Data/TriggerActions` entry id, editable in expert mode only. */
function DeliveryIdField({ row }: { row: MailTriggerRow }) {
  const editorCopy = useMailEditorCopy()
  const copy = editorCopy.delivery
  const workspace = useMailWorkspaceContext()
  const [pendingId, setPendingId] = useState(row.draft.id)
  const [conflict, setConflict] = useState(false)

  function commit() {
    const nextId = pendingId.trim()
    if (!nextId || nextId === row.draft.id) {
      setPendingId(row.draft.id)
      setConflict(false)
      return
    }
    setConflict(workspace.updateTrigger(row.entryKey, { ...row.draft, id: nextId }) === 'duplicate')
  }

  return (
    <label className="mail-editor-delivery-field mail-editor-delivery-field-wide">
      <span className="mail-editor-field-label">{copy.idLabel}</span>
      <input
        className="control-input"
        value={pendingId}
        onChange={(event) => {
          setPendingId(event.target.value)
          setConflict(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        placeholder={copy.idPlaceholder}
        spellCheck={false}
        aria-invalid={conflict || undefined}
      />
      {conflict ? (
        <span className="mail-editor-field-error">
          {fillTemplate(editorCopy.validation.duplicateTriggerIdTemplate, { detail: pendingId.trim() })}
        </span>
      ) : null}
    </label>
  )
}

/** Game state query row: builder in both modes, raw query text in expert mode. */
function DeliveryConditionField({ row }: { row: MailTriggerRow }) {
  const copy = useMailEditorCopy().delivery
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const workspace = useMailWorkspaceContext()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const [builderOpen, setBuilderOpen] = useState(false)
  const condition = row.draft.condition

  function update(nextCondition: string) {
    workspace.updateTrigger(row.entryKey, { ...row.draft, condition: nextCondition })
  }

  return (
    <div className="mail-editor-delivery-field mail-editor-delivery-field-wide">
      <span className="mail-editor-field-label">{copy.conditionLabel}</span>
      <div className="mail-editor-delivery-condition-row">
        {expertMode ? (
          <input
            className="control-input"
            value={condition}
            onChange={(event) => update(event.target.value)}
            placeholder={copy.conditionPlaceholder}
            spellCheck={false}
            aria-label={copy.conditionLabel}
          />
        ) : (
          <span className="mail-editor-delivery-condition-text" data-empty={condition.trim() ? undefined : 'true'}>
            {condition.trim() || copy.conditionNone}
          </span>
        )}
        <button type="button" className="control-button mail-editor-delivery-builder-button" onClick={() => setBuilderOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.openBuilderAction}
        </button>
        {condition.trim() ? (
          <button
            type="button"
            className="control-button mail-editor-delivery-clear-button"
            onClick={() => update('')}
            aria-label={copy.clearConditionAction}
            title={copy.clearConditionAction}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {builderOpen ? (
        <EventGameStateQueryBuilderModal
          copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
          hubCopy={hubCopy}
          initialQuery={condition}
          onApply={(result) => {
            update(result.query)
            setBuilderOpen(false)
          }}
          onCancel={() => setBuilderOpen(false)}
        />
      ) : null}
    </div>
  )
}

/** One delivery rule of the active letter, backed by a single TriggerActions entry. */
function DeliveryRuleCard({ row, index }: { row: MailTriggerRow; index: number }) {
  const copy = useMailEditorCopy().delivery
  const workspace = useMailWorkspaceContext()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const draft = row.draft
  const isKnownEvent = MAIL_TRIGGER_EVENTS.some((event) => event === draft.trigger)

  function update(patch: Partial<MailTriggerDraft>) {
    workspace.updateTrigger(row.entryKey, { ...draft, ...patch })
  }

  const eventLabels: Record<string, string> = {
    DayStarted: copy.eventDayStarted,
    DayEnding: copy.eventDayEnding,
    LocationChanged: copy.eventLocationChanged,
  }
  const targetLabels: Record<MailTriggerTarget, string> = {
    Current: copy.targetCurrent,
    Host: copy.targetHost,
    All: copy.targetAll,
  }
  const deliveryLabels: Record<MailDeliveryType, string> = {
    tomorrow: copy.deliveryTomorrow,
    now: copy.deliveryNow,
    received: copy.deliveryReceived,
    all: copy.deliveryAll,
  }

  return (
    <div className="mail-editor-delivery-card">
      <div className="mail-editor-delivery-card-head">
        <span className="mail-editor-delivery-card-title">{fillTemplate(copy.ruleTitleTemplate, { index: index + 1 })}</span>
        <button type="button" className="control-button mail-editor-delivery-remove" onClick={() => workspace.removeTrigger(row.entryKey)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.removeAction}
        </button>
      </div>
      <div className="mail-editor-delivery-grid">
        <label className="mail-editor-delivery-field">
          <span className="mail-editor-field-label">{copy.whenLabel}</span>
          <select
            className="control-input"
            value={isKnownEvent ? draft.trigger : CUSTOM_EVENT_VALUE}
            onChange={(event) => {
              const value = event.target.value
              update({ trigger: value === CUSTOM_EVENT_VALUE ? '' : value })
            }}
          >
            {MAIL_TRIGGER_EVENTS.map((event) => (
              <option key={event} value={event}>
                {eventLabels[event]}
              </option>
            ))}
            {expertMode || !isKnownEvent ? <option value={CUSTOM_EVENT_VALUE}>{copy.eventCustom}</option> : null}
          </select>
          {isKnownEvent ? null : (
            <input
              className="control-input"
              value={draft.trigger}
              onChange={(event) => update({ trigger: event.target.value })}
              placeholder={copy.customEventPlaceholder}
              spellCheck={false}
              aria-label={copy.eventCustom}
            />
          )}
        </label>
        <label className="mail-editor-delivery-field">
          <span className="mail-editor-field-label">{copy.recipientLabel}</span>
          <select
            className="control-input"
            value={draft.target}
            onChange={(event) => update({ target: event.target.value as MailTriggerTarget })}
          >
            {MAIL_TRIGGER_TARGETS.map((target) => (
              <option key={target} value={target}>
                {targetLabels[target]}
              </option>
            ))}
          </select>
        </label>
        <label className="mail-editor-delivery-field">
          <span className="mail-editor-field-label">{copy.timingLabel}</span>
          <select
            className="control-input"
            value={draft.deliveryType}
            onChange={(event) => update({ deliveryType: event.target.value as MailDeliveryType })}
          >
            {MAIL_DELIVERY_TYPES.map((type) => (
              <option key={type} value={type}>
                {deliveryLabels[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DeliveryConditionField row={row} />
      <div className="mail-editor-delivery-footer">
        <label className="mail-editor-dialog-check">
          <input
            type="checkbox"
            checked={draft.markActionApplied}
            onChange={(event) => update({ markActionApplied: event.target.checked })}
          />
          <span>{copy.onceLabel}</span>
        </label>
        {/* Stays reachable outside expert mode once set, so the host-only
            mismatch warning can always be cleared where it is raised. */}
        {expertMode || draft.hostOnly ? (
          <label className="mail-editor-dialog-check">
            <input type="checkbox" checked={draft.hostOnly} onChange={(event) => update({ hostOnly: event.target.checked })} />
            <span>{copy.hostOnlyLabel}</span>
          </label>
        ) : null}
      </div>
      <p className="mail-editor-delivery-hint-text">{copy.onceHint}</p>
      {expertMode || draft.hostOnly ? <p className="mail-editor-delivery-hint-text">{copy.hostOnlyHint}</p> : null}
      {expertMode ? (
        <div className="mail-editor-delivery-expert">
          <span className="mail-editor-delivery-expert-heading">{copy.expertHeading}</span>
          <DeliveryIdField key={draft.id} row={row} />
        </div>
      ) : null}
      {draft.extraActions.length > 0 ? (
        <p className="mail-editor-muted">{fillTemplate(copy.extraActionsTemplate, { count: draft.extraActions.length })}</p>
      ) : null}
    </div>
  )
}

/**
 * Delivery of the active letter, presented as a property of the letter: each rule
 * is one `Data/TriggerActions` entry whose `AddMail` action names this letter.
 */
export function MailDeliverySection() {
  const copy = useMailEditorCopy().delivery
  const workspace = useMailWorkspaceContext()

  return (
    <div className="mail-editor-section">
      <div className="mail-editor-section-head">
        <div>
          <span className="mail-editor-field-label">{copy.heading}</span>
          <p className="mail-editor-muted">{copy.subtitle}</p>
        </div>
        <button type="button" className="control-button" onClick={workspace.addTriggerForActiveLetter}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.addAction}
        </button>
      </div>
      {workspace.activeTriggers.length === 0 ? (
        <p className="mail-editor-delivery-empty">{copy.empty}</p>
      ) : (
        <div className="mail-editor-delivery-rules">
          {workspace.activeTriggers.map((row, index) => (
            <DeliveryRuleCard key={row.entryKey} row={row} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
