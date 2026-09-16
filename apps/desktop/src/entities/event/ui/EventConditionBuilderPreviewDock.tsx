/**
 * @file Preview dock for the event condition builder, showing validation,
 * natural/code preview, and apply/cancel actions.
 */

import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'

type EventConditionBuilderPreviewDockProps = {
  eventIdValidation: string
  naturalPreview: string
  codePreview: string
  onCancel: () => void
  onApply: () => void
}

/** Renders validation, natural/code preview, and apply/cancel actions for the condition builder. */
export function EventConditionBuilderPreviewDock({
  eventIdValidation,
  naturalPreview,
  codePreview,
  onCancel,
  onApply,
}: EventConditionBuilderPreviewDockProps) {
  const copy = useEditorCopy().studioDesk.eventPatchHub.conditionBuilder
  return (
    <aside className={cx('condition-builder-preview-dock', eventIdValidation && 'invalid')} aria-label={copy.previewDockLabel}>
      <div className="condition-builder-previews">
        {eventIdValidation ? (
          <p className="condition-builder-validation">
            <strong>{eventIdValidation}</strong>
          </p>
        ) : (
          <p>
            <strong>{copy.naturalPreviewLabel}</strong>
            {naturalPreview}
          </p>
        )}
        <p>
          <strong>{copy.codePreviewLabel}</strong>
          <code>{codePreview}</code>
        </p>
      </div>
      <div className="condition-builder-actions">
        <button type="button" className="control-button" onClick={onCancel}>
          {copy.cancelAction}
        </button>
        <button type="button" className="control-button control-button-primary" onClick={onApply} disabled={Boolean(eventIdValidation)}>
          {copy.confirmAction}
        </button>
      </div>
    </aside>
  )
}
