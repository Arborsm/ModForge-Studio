/**
 * @file Renders a single compat plugin form field based on its schema type.
 * Maps each field type to the appropriate shared/ui control.
 * @module features/compat-plugins
 */
import type { ComponentType } from 'react'
import { CompactSelect } from '@shared/ui/CompactSelect'
import type { CompatModuleCopy } from '@locales'
import type { CompatPluginField } from '../api/types'
import type { FieldValidationError } from '../lib/schemaEvaluator'

type CompatFieldRendererProps = {
  field: CompatPluginField
  value: unknown
  onChange: (value: unknown) => void
  label: string
  error: FieldValidationError | undefined
  t: (key: string) => string
  copy: CompatModuleCopy
}

/** Renders a single compat plugin form field based on its schema type. */
export const CompatFieldRenderer: ComponentType<CompatFieldRendererProps> = function CompatFieldRenderer({
  field,
  value,
  onChange,
  label,
  error,
  t,
  copy,
}: CompatFieldRendererProps) {
  const fieldId = `compat-field-${field.id}`
  const errorId = `${fieldId}-error`
  const isRequired = field.required ?? false
  const labelText = `${label}${isRequired ? ' *' : ''}`

  const renderControl = () => {
    switch (field.type) {
      case 'bool':
        return (
          <label className="compat-field-bool" htmlFor={fieldId}>
            <input
              id={fieldId}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => onChange(event.target.checked)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <span>{labelText}</span>
          </label>
        )

      case 'number':
        return (
          <div className="compat-field-number">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <input
              id={fieldId}
              type="number"
              className="control-input"
              value={typeof value === 'number' ? value : ''}
              min={field.min}
              max={field.max}
              step={field.interval}
              onChange={(event) => {
                const num = Number(event.target.value)
                onChange(Number.isNaN(num) ? '' : num)
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        )

      case 'text':
        return (
          <div className="compat-field-text">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <input
              id={fieldId}
              type="text"
              className="control-input"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        )

      case 'choice': {
        const options = (field.allowValues ?? []).map((v) => ({ value: v, label: v }))
        return (
          <div className="compat-field-choice">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <CompactSelect
              value={typeof value === 'string' ? value : ''}
              options={options}
              onChange={(v) => onChange(v)}
              ariaLabel={labelText}
            />
          </div>
        )
      }

      case 'string-list':
        return (
          <div className="compat-field-string-list">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <textarea
              id={fieldId}
              className="control-input compat-field-string-list-input"
              value={Array.isArray(value) ? value.join(', ') : ''}
              onChange={(event) => {
                const parts = event.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                onChange(parts)
              }}
              rows={2}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        )

      case 'record-list':
        return (
          <div className="compat-field-record-list">
            <label className="compat-field-label">{labelText}</label>
            <div className="compat-field-record-list-summary">
              {Array.isArray(value) ? `${value.length} ${copy.recordListEntries}` : copy.invalidValue}
            </div>
            {/* Record-list editing is a future enhancement; for now show a summary */}
          </div>
        )

      case 'object':
        return (
          <div className="compat-field-object">
            <label className="compat-field-label">{labelText}</label>
            <div className="compat-field-object-summary">
              {typeof value === 'object' && value !== null && !Array.isArray(value)
                ? `${Object.keys(value).length} ${copy.objectFields}`
                : copy.invalidValue}
            </div>
            {/* Object editing is a future enhancement; for now show a summary */}
          </div>
        )

      case 'keybind':
        return (
          <div className="compat-field-keybind">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <input
              id={fieldId}
              type="text"
              className="control-input"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        )

      case 'keybind-list':
        return (
          <div className="compat-field-keybind-list">
            <label className="compat-field-label" htmlFor={fieldId}>
              {labelText}
            </label>
            <textarea
              id={fieldId}
              className="control-input"
              value={Array.isArray(value) ? value.join(', ') : ''}
              onChange={(event) => {
                const parts = event.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                onChange(parts)
              }}
              rows={2}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="compat-field">
      {renderControl()}
      {error && (
        <p className="compat-field-error" id={errorId} role="alert">
          {t(error.message)}
        </p>
      )}
    </div>
  )
}
