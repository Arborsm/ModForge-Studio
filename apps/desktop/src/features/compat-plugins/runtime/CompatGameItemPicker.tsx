/**
 * @file Combobox picker for `game-item` compat plugin fields. Combines a free
 * text input (mod items are not in the vanilla registry, so manual entry must
 * always work) with a filtered dropdown of catalogued vanilla items. Selecting
 * a catalogued item writes both `field.path` (internal name) and `idPath`
 * (unqualified id) via `onChangePaths`; typing free text writes only
 * `field.path` via `onChange`.
 * @module features/compat-plugins
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useCompatModuleCopy } from '@locales/provider'
import type { CompatPluginField } from '../api/types'
import type { GameItemOption } from '../lib/gameItemCatalog'
import { gameItemSelectionPatches } from '../lib/gameItemCatalog'

type CompatGameItemPickerProps = {
  field: CompatPluginField
  /** Current value at `field.path` (the internal item name). */
  value: string
  /** Catalogued vanilla item options; empty when the registry is unavailable. */
  options: readonly GameItemOption[]
  /** Writes a single path value (free-text entry). */
  onChange: (value: string) => void
  /** Writes multiple path patches at once (catalogued selection). */
  onChangePaths: (patches: Record<string, unknown>) => void
  label: string
}

/** Normalizes a string for case-insensitive substring matching. */
function normalizeForFilter(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * Combobox for `game-item` fields: a text input backed by a filtered dropdown
 * of catalogued items. Free text is always accepted (mod items are not
 * catalogued); selecting a catalogued item writes the paired id path too.
 */
export const CompatGameItemPicker: ComponentType<CompatGameItemPickerProps> = function CompatGameItemPicker({
  field,
  value,
  options,
  onChange,
  onChangePaths,
  label,
}: CompatGameItemPickerProps) {
  const copy = useCompatModuleCopy()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldId = `compat-field-${field.id}`

  // Reset the filter query whenever the field loses focus or the value changes
  // externally (e.g. entry switch) so the dropdown does not show a stale filter.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open, value])

  const filtered = (() => {
    const q = normalizeForFilter(query || value)
    if (!q) return options.slice(0, 50)
    return options
      .filter(
        (option) =>
          normalizeForFilter(option.name).includes(q) ||
          normalizeForFilter(option.label).includes(q) ||
          normalizeForFilter(option.id).includes(q) ||
          normalizeForFilter(option.qualifiedId).includes(q),
      )
      .slice(0, 50)
  })()

  const selectOption = (option: GameItemOption) => {
    onChangePaths(gameItemSelectionPatches(field, option))
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    setQuery(text)
    onChange(text)
    if (!open) setOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filtered.length > 0) {
      event.preventDefault()
      selectOption(filtered[0])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="compat-field-game-item">
      <label className="compat-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        type="text"
        className="control-input"
        value={typeof value === 'string' ? value : ''}
        placeholder={copy.itemPickerPlaceholder}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Defer close so a dropdown click registers before the input blurs.
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${fieldId}-listbox`}
      />
      {open && filtered.length > 0 && (
        <ul id={`${fieldId}-listbox`} role="listbox" className="compat-game-item-list">
          {filtered.map((option) => (
            <li key={option.qualifiedId} role="option" aria-selected={option.name === value}>
              <button
                type="button"
                className="compat-game-item-option"
                onMouseDown={(event) => {
                  // Prevent the input blur before the click fires.
                  event.preventDefault()
                  selectOption(option)
                }}
              >
                <span className="compat-game-item-option-label">{option.label}</span>
                <span className="compat-game-item-option-name">{option.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && <p className="compat-game-item-empty">{copy.itemPickerNoResults}</p>}
    </div>
  )
}
