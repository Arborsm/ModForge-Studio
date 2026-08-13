import { useState, type ReactNode } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { useAssetAuthoringCopy } from '@locales/provider'
import { matchEnumValue } from '../model/fieldSchema'

/**
 * Presentational form primitives shared by every schema-driven asset editor.
 *
 * Each control commits through a single callback; committing `undefined` means
 * "remove the key so the game default applies". Chrome copy is self-consumed
 * from the typed locale bundle, so a control is fully described by its value
 * and its commit callback.
 */

type FieldChromeProps = {
  label: string
  hint?: string
  wide?: boolean
  children: ReactNode
}

/** Single-control field: the label element wraps the control for click-to-focus. */
export function Field({ label, hint, wide, children }: FieldChromeProps) {
  return (
    <label className={wide ? 'asset-field is-wide' : 'asset-field'}>
      <span className="asset-field-label">{label}</span>
      {children}
      {hint ? <span className="asset-field-hint">{hint}</span> : null}
    </label>
  )
}

/** Multi-control field chrome (lists, grids) where a wrapping label would misfire. */
export function FieldGroup({ label, hint, wide, children }: FieldChromeProps) {
  return (
    <div className={wide ? 'asset-field is-wide' : 'asset-field'}>
      <span className="asset-field-label">{label}</span>
      {children}
      {hint ? <span className="asset-field-hint">{hint}</span> : null}
    </div>
  )
}

/** Read-only rendering of an already formatted value, used by browser pages. */
export function ReadOnlyField({ label, hint, wide, text }: Omit<FieldChromeProps, 'children'> & { text: string | null }) {
  const copy = useAssetAuthoringCopy()
  return (
    <div className={wide ? 'asset-field is-wide' : 'asset-field'}>
      <span className="asset-field-label">{label}</span>
      <span className={text === null ? 'asset-field-readonly is-unset' : 'asset-field-readonly'}>
        {text ?? copy.chrome.readOnlyEmptyValue}
      </span>
      {hint ? <span className="asset-field-hint">{hint}</span> : null}
    </div>
  )
}

type TextFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  multiline?: boolean
  listId?: string
  value: unknown
  onCommit: (next: string | undefined) => void
}

/** Free text field; clearing removes the underlying key. */
export function TextField({ label, hint, wide, multiline, listId, value, onCommit }: TextFieldProps) {
  const text = typeof value === 'string' ? value : ''
  return (
    <Field label={label} hint={hint} wide={wide}>
      {multiline ? (
        <textarea
          className="control-input asset-field-textarea"
          value={text}
          onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
        />
      ) : (
        <input
          type="text"
          className="control-input"
          value={text}
          list={listId}
          onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
        />
      )}
    </Field>
  )
}

/**
 * Request to open the shared GameStateQuery builder for one field. The `apply`
 * closure routes the built query back through that field's normal commit path;
 * the hosting page owns a single modal instance.
 */
export type GsqBuilderRequest = {
  initialQuery: string
  apply: (query: string) => void
}

/** Callback used by GSQ fields to request the page-level builder modal. */
export type OpenGsqBuilder = (request: GsqBuilderRequest) => void

type GsqFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  value: unknown
  onCommit: (next: string | undefined) => void
  onOpenBuilder: OpenGsqBuilder | undefined
}

/**
 * GameStateQuery field: raw text input plus a button opening the shared GSQ
 * builder. Clearing the text (or applying an empty query) removes the key so
 * the game default applies. The button is hidden when the host page did not
 * provide a builder.
 */
export function GsqField({ label, hint, wide, value, onCommit, onOpenBuilder }: GsqFieldProps) {
  const copy = useAssetAuthoringCopy()
  const text = typeof value === 'string' ? value : ''
  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-gsq-row">
        <input
          type="text"
          className="control-input"
          value={text}
          onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
        />
        {onOpenBuilder ? (
          <button
            type="button"
            className="control-button"
            aria-label={copy.chrome.openConditionBuilder}
            title={copy.chrome.openConditionBuilder}
            onClick={() => onOpenBuilder({ initialQuery: text, apply: (query) => onCommit(query === '' ? undefined : query) })}
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </FieldGroup>
  )
}

type NumberFieldProps = {
  label: string
  hint?: string
  min?: number
  max?: number
  step?: number
  value: unknown
  onCommit: (next: number | undefined) => void
}

/** Numeric field; clearing removes the key, invalid input is not committed. */
export function NumberField({ label, hint, min, max, step, value, onCommit }: NumberFieldProps) {
  const current = typeof value === 'number' && Number.isFinite(value) ? value : ''
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className="control-input"
        value={current}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') {
            onCommit(undefined)
            return
          }
          const num = Number(raw)
          if (Number.isFinite(num)) {
            onCommit(num)
          }
        }}
      />
    </Field>
  )
}

export type EnumOption = { value: string; label: string }

type EnumSelectFieldProps = {
  label: string
  hint?: string
  value: unknown
  options: readonly EnumOption[]
  onCommit: (next: string | undefined) => void
}

/**
 * Enum select with unknown-value passthrough: a value outside the catalog is
 * rendered as an extra option and never destroyed until the user actively picks
 * another one. Matching is case-insensitive like the game.
 */
export function EnumSelectField({ label, hint, value, options, onCommit }: EnumSelectFieldProps) {
  const copy = useAssetAuthoringCopy()
  const raw =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : (JSON.stringify(value) ?? '')
  const canonical = matchEnumValue(
    options.map((option) => option.value),
    raw,
  )
  const selected = raw === '' ? '' : (canonical ?? raw)
  const isUnknown = raw !== '' && canonical === null
  return (
    <Field label={label} hint={hint}>
      <select
        className="control-input"
        value={selected}
        onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
      >
        <option value="">{copy.chrome.defaultOption}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {isUnknown ? <option value={raw}>{copy.chrome.unknownValue(raw)}</option> : null}
      </select>
    </Field>
  )
}

/** Tri-state boolean select: game default (key omitted) / yes / no. */
export function TriBoolField({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  value: unknown
  onCommit: (next: boolean | undefined) => void
}) {
  const copy = useAssetAuthoringCopy()
  const current = value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : ''
  return (
    <Field label={label} hint={hint}>
      <select
        className="control-input"
        value={current}
        onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value === 'true')}
      >
        <option value="">{copy.chrome.defaultOption}</option>
        <option value="true">{copy.chrome.yes}</option>
        <option value="false">{copy.chrome.no}</option>
      </select>
    </Field>
  )
}

/** Plain boolean checkbox for keys the game always reads as present. */
export function ToggleField({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  value: unknown
  onCommit: (next: boolean) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="checkbox"
        className="asset-field-checkbox"
        checked={value === true}
        onChange={(event) => onCommit(event.target.checked)}
      />
    </Field>
  )
}

/** Editable list of strings; removing the last row omits the key. */
export function StringListField({
  label,
  hint,
  wide,
  values,
  onCommit,
}: {
  label: string
  hint?: string
  wide?: boolean
  values: readonly string[] | undefined
  onCommit: (next: string[] | undefined) => void
}) {
  const copy = useAssetAuthoringCopy()
  const rows = values ?? []
  function commitRows(next: string[]) {
    onCommit(next.length === 0 ? undefined : next)
  }
  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-list">
        {rows.map((row, index) => (
          <div key={index} className="asset-field-list-row">
            <input
              type="text"
              className="control-input"
              value={row}
              onChange={(event) => commitRows(rows.map((entry, i) => (i === index ? event.target.value : entry)))}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={copy.chrome.removeAction}
              title={copy.chrome.removeAction}
              onClick={() => commitRows(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" className="control-button asset-field-add-row" onClick={() => commitRows([...rows, ''])}>
          <Plus className="h-3.5 w-3.5" />
          <span>{copy.chrome.addAction}</span>
        </button>
      </div>
    </FieldGroup>
  )
}

/**
 * Key/value row editor for `Record<string, string>` keys. Rows live in local
 * state so renaming a key keeps focus; only rows with a non-empty key are
 * committed. Mount with a `key` tied to the active entry to resync.
 */
export function KeyValueListField({
  label,
  hint,
  wide,
  record,
  onCommit,
}: {
  label: string
  hint?: string
  wide?: boolean
  record: Readonly<Record<string, string>> | undefined
  onCommit: (next: Record<string, string> | undefined) => void
}) {
  const copy = useAssetAuthoringCopy()
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>(() =>
    Object.entries(record ?? {}).map(([key, value]) => ({ key, value })),
  )
  function commit(nextRows: Array<{ key: string; value: string }>) {
    setRows(nextRows)
    const result: Record<string, string> = {}
    for (const row of nextRows) {
      if (row.key.trim() !== '') {
        result[row.key] = row.value
      }
    }
    onCommit(Object.keys(result).length === 0 ? undefined : result)
  }
  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-list">
        {rows.map((row, index) => (
          <div key={index} className="asset-field-kv-row">
            <input
              type="text"
              className="control-input"
              value={row.key}
              placeholder={copy.chrome.keyHeader}
              aria-label={copy.chrome.keyHeader}
              onChange={(event) => commit(rows.map((entry, i) => (i === index ? { ...entry, key: event.target.value } : entry)))}
            />
            <input
              type="text"
              className="control-input"
              value={row.value}
              placeholder={copy.chrome.valueHeader}
              aria-label={copy.chrome.valueHeader}
              onChange={(event) => commit(rows.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)))}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={copy.chrome.removeAction}
              title={copy.chrome.removeAction}
              onClick={() => commit(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" className="control-button asset-field-add-row" onClick={() => commit([...rows, { key: '', value: '' }])}>
          <Plus className="h-3.5 w-3.5" />
          <span>{copy.chrome.addAction}</span>
        </button>
      </div>
    </FieldGroup>
  )
}

/** Comma-separated number list committed on blur/Enter; invalid text is flagged, not written. */
export function NumberListField({
  label,
  hint,
  values,
  onCommit,
}: {
  label: string
  hint?: string
  values: readonly number[] | undefined
  onCommit: (next: number[] | undefined) => void
}) {
  const copy = useAssetAuthoringCopy()
  const [text, setText] = useState(() => (values ?? []).join(', '))
  const [invalid, setInvalid] = useState(false)
  function commit() {
    const trimmed = text.trim()
    if (trimmed === '') {
      setInvalid(false)
      onCommit(undefined)
      return
    }
    const numbers = trimmed
      .split(/[\s,]+/u)
      .filter(Boolean)
      .map(Number)
    if (numbers.length === 0 || numbers.some((num) => !Number.isFinite(num))) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onCommit(numbers)
  }
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        className="control-input"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
        }}
      />
      {invalid ? <span className="asset-field-error">{copy.chrome.invalidNumberList}</span> : null}
    </Field>
  )
}

function readAxis(value: Readonly<Record<string, unknown>> | null | undefined, axis: string): number | '' {
  const raw = value ? value[axis] : undefined
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : ''
}

function writeAxis(
  value: Readonly<Record<string, unknown>> | null | undefined,
  axis: string,
  raw: string,
): Record<string, unknown> | undefined | null {
  const base: Record<string, unknown> = { ...value }
  if (raw === '') {
    delete base[axis]
  } else {
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      return null
    }
    base[axis] = num
  }
  return Object.keys(base).length === 0 ? undefined : base
}

/** Numeric axis grid used by point (X/Y) and rect (X/Y/Width/Height) controls. */
export function AxisGridField({
  label,
  hint,
  axes,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  axes: readonly string[]
  value: Readonly<Record<string, unknown>> | null | undefined
  onCommit: (next: Record<string, unknown> | undefined) => void
}) {
  return (
    <FieldGroup label={label} hint={hint}>
      <div className={axes.length > 2 ? 'asset-field-axis-grid is-rect' : 'asset-field-axis-grid is-point'}>
        {axes.map((axis) => (
          <input
            key={axis}
            type="number"
            className="control-input"
            value={readAxis(value, axis)}
            placeholder={axis}
            aria-label={axis}
            onChange={(event) => {
              const next = writeAxis(value, axis, event.target.value)
              if (next !== null) {
                onCommit(next)
              }
            }}
          />
        ))}
      </div>
    </FieldGroup>
  )
}

/**
 * Raw JSON escape hatch for structures without a dedicated control. Validates
 * on blur; invalid text is flagged and never written. Mount with a `key` tied
 * to the active entry to resync.
 */
export function JsonField({
  label,
  hint,
  wide,
  expect,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  wide?: boolean
  expect: 'array' | 'object' | 'any'
  value: unknown
  onCommit: (next: unknown) => void
}) {
  const copy = useAssetAuthoringCopy()
  const [text, setText] = useState(() => (value === undefined || value === null ? '' : JSON.stringify(value, null, 2)))
  const [invalid, setInvalid] = useState(false)
  function commit() {
    const trimmed = text.trim()
    if (trimmed === '') {
      setInvalid(false)
      onCommit(undefined)
      return
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const shapeOk =
        expect === 'any'
          ? true
          : expect === 'array'
            ? Array.isArray(parsed)
            : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      if (!shapeOk) {
        setInvalid(true)
        return
      }
      setInvalid(false)
      onCommit(parsed)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <textarea
        className="control-input asset-field-json"
        value={text}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {invalid ? <span className="asset-field-error">{copy.chrome.invalidJson}</span> : null}
    </FieldGroup>
  )
}
