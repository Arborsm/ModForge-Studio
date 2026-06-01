import { cx } from '@shared/lib/cx'
import type { ConditionBuilderCopy } from './eventConditionBuilderTypes'

type EventConditionBuilderPreviewDockProps = {
  copy: ConditionBuilderCopy
  eventIdValidation: string
  naturalPreview: string
  codePreview: string
  onCancel: () => void
  onApply: () => void
}

/** Renders validation, natural/code preview, and apply/cancel actions for the condition builder. */
export function EventConditionBuilderPreviewDock({
  copy,
  eventIdValidation,
  naturalPreview,
  codePreview,
  onCancel,
  onApply,
}: EventConditionBuilderPreviewDockProps) {
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
