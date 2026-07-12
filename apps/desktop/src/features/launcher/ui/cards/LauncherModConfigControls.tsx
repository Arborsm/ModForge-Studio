import { ArrowDown, ArrowUp, Check, Keyboard, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useEditorCopy } from '@locales/provider'
import { CompactSelect } from '@shared/ui/CompactSelect'
import type { LauncherConfigItemOption, LauncherModConfigField } from '../../model/launcherContracts'
import { LauncherModConfigItemPicker } from './LauncherModConfigItemPicker'

type ConfigControlProps = {
  field: LauncherModConfigField
  value: unknown
  onChange: (value: unknown) => void
}

function valueToText(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return value == null ? '' : JSON.stringify(value)
}

function selectedValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(valueToText)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value == null ? [] : [valueToText(value)]
}

function isUnassignedKeybind(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'none' || normalized === 'sbutton.none'
}

function keybindValues(value: unknown) {
  return selectedValues(value).filter((entry) => !isUnassignedKeybind(entry))
}

function compactConfigKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function humanizeConfigKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bPrev\b/g, 'Previous')
    .trim()
}

function objectEntries(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : []
}

/** Returns whether an object config can be represented as nested typed controls without losing data. */
export function isLauncherConfigObjectGroup(field: LauncherModConfigField, value: unknown) {
  if (field.fieldType !== 'object' || isLauncherConfigKeybindMap(field, value)) {
    return false
  }
  const entries = objectEntries(value)
  return entries.length > 0 && entries.every(([, entry]) => entry !== null && !Array.isArray(entry))
}

export function isLauncherConfigKeybindMap(field: LauncherModConfigField, value: unknown) {
  if (field.fieldType !== 'object') {
    return false
  }
  const containerKey = compactConfigKey(field.key)
  const hasControlSemantics = ['controls', 'keybinds', 'hotkeys', 'shortcuts', 'keys'].some((marker) => containerKey.includes(marker))
  const entries = objectEntries(value)
  return hasControlSemantics && entries.length > 0 && entries.every(([, entry]) => typeof entry === 'string')
}

export function LauncherModConfigChoiceControl({ field, value, onChange }: ConfigControlProps) {
  if (field.allowMultiple) {
    const selected = new Set(selectedValues(value))
    return (
      <span className="launcher-mod-detail-config-choice-grid" role="group" aria-label={field.label}>
        {field.allowValues.map((option) => {
          const text = valueToText(option)
          const active = selected.has(text)
          return (
            <button
              key={text}
              type="button"
              className="launcher-mod-detail-config-choice"
              aria-pressed={active}
              disabled={!field.editable}
              onClick={() => {
                const nextSelected = new Set(selected)
                if (active) {
                  nextSelected.delete(text)
                } else {
                  nextSelected.add(text)
                }
                const nextValues = field.allowValues.filter((candidate) => nextSelected.has(valueToText(candidate)))
                onChange(Array.isArray(value) ? nextValues : nextValues.map(valueToText).join(', '))
              }}
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>{text}</span>
            </button>
          )
        })}
      </span>
    )
  }

  const options = field.allowValues.map((option) => ({ value: valueToText(option), label: valueToText(option) }))
  return (
    <CompactSelect
      value={valueToText(value)}
      options={options}
      onChange={(nextValue) => {
        const originalValue = field.allowValues.find((option) => valueToText(option) === nextValue)
        onChange(originalValue ?? nextValue)
      }}
      ariaLabel={field.label}
      disabled={!field.editable}
      placement="bottom-end"
      className="launcher-mod-detail-config-select"
      triggerClassName="launcher-mod-detail-config-select-trigger"
      menuClassName="launcher-mod-detail-config-select-menu"
    />
  )
}

type ParsedColor = {
  hex: string
  red: number
  green: number
  blue: number
}

function colorChannel(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(255, Math.round(parsed))) : null
}

function colorFromChannels(red: number, green: number, blue: number): ParsedColor {
  const hex = [red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')
  return { hex: `#${hex}`, red, green, blue }
}

function parseColor(value: unknown): ParsedColor | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    const channel = (name: string) => entries.find(([key]) => key.toLowerCase() === name)?.[1]
    const red = colorChannel(channel('r'))
    const green = colorChannel(channel('g'))
    const blue = colorChannel(channel('b'))
    return red === null || green === null || blue === null ? null : colorFromChannels(red, green, blue)
  }
  if (typeof value !== 'string') {
    return null
  }

  const text = value.trim()
  const shortHex = /^#([0-9a-f]{3})$/i.exec(text)
  if (shortHex) {
    const [red, green, blue] = shortHex[1].split('').map((digit) => Number.parseInt(`${digit}${digit}`, 16))
    return colorFromChannels(red, green, blue)
  }
  const longHex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text)
  if (longHex) {
    return colorFromChannels(
      Number.parseInt(longHex[1].slice(0, 2), 16),
      Number.parseInt(longHex[1].slice(2, 4), 16),
      Number.parseInt(longHex[1].slice(4, 6), 16),
    )
  }

  const labeledChannels = /R[:=]\s*(\d+).*G[:=]\s*(\d+).*B[:=]\s*(\d+)/i.exec(text)
  if (labeledChannels) {
    const red = colorChannel(labeledChannels[1])
    const green = colorChannel(labeledChannels[2])
    const blue = colorChannel(labeledChannels[3])
    if (red !== null && green !== null && blue !== null) {
      return colorFromChannels(red, green, blue)
    }
  }

  const channels = text
    .replace(/^rgba?\(/i, '')
    .replace(/\)$/, '')
    .split(/[ ,]+/)
    .slice(0, 3)
    .map(colorChannel)
  return channels.length === 3 && channels.every((channel) => channel !== null)
    ? colorFromChannels(channels[0], channels[1], channels[2])
    : null
}

function isCssColor(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }
  const color = value.trim()
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', color)) {
    return true
  }
  if (typeof document === 'undefined') {
    return false
  }
  const probe = document.createElement('span')
  probe.style.color = color
  return probe.style.color !== ''
}

export function isValidLauncherConfigColor(value: unknown) {
  return parseColor(value) !== null || isCssColor(value)
}

function colorPickerValue(originalValue: unknown, parsed: ParsedColor) {
  if (originalValue && typeof originalValue === 'object' && !Array.isArray(originalValue)) {
    const next = { ...(originalValue as Record<string, unknown>) }
    const assign = (name: string, value: number) => {
      const key = Object.keys(next).find((candidate) => candidate.toLowerCase() === name) ?? name.toUpperCase()
      next[key] = value
    }
    assign('r', parsed.red)
    assign('g', parsed.green)
    assign('b', parsed.blue)
    return next
  }
  if (typeof originalValue === 'string' && /^(?:rgba?\()?\s*\d+\s*[, ]/i.test(originalValue.trim())) {
    return `${parsed.red}, ${parsed.green}, ${parsed.blue}`
  }
  return parsed.hex
}

export function LauncherModConfigColorControl({ field, value, onChange }: ConfigControlProps) {
  const copy = useEditorCopy().launcher.library.modDetail.config
  const text = valueToText(value)
  const parsed = parseColor(value)
  const previewColor = parsed?.hex ?? (isCssColor(value) ? text.trim() : null)
  const previewStyle = previewColor ? ({ '--launcher-config-color': previewColor } as CSSProperties) : undefined

  return (
    <span className="launcher-mod-detail-config-color-control">
      <span className="launcher-mod-detail-config-color-preview" data-invalid={!previewColor || undefined} style={previewStyle}>
        <input
          type="color"
          value={parsed?.hex ?? '#000000'}
          disabled={!field.editable}
          aria-label={copy.colorPicker(field.label)}
          onChange={(event) => {
            const next = parseColor(event.currentTarget.value)
            if (next) {
              onChange(colorPickerValue(value, next))
            }
          }}
        />
      </span>
      <input
        type="text"
        value={text}
        disabled={!field.editable}
        aria-label={field.label}
        aria-invalid={!previewColor || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {!previewColor ? <span className="launcher-mod-detail-config-inline-error">{copy.invalidColor}</span> : null}
    </span>
  )
}

const MODIFIER_CODES = new Set([
  'LeftControl',
  'RightControl',
  'LeftShift',
  'RightShift',
  'LeftAlt',
  'RightAlt',
  'LeftWindows',
  'RightWindows',
])
const KEY_ORDER = ['LeftControl', 'RightControl', 'LeftShift', 'RightShift', 'LeftAlt', 'RightAlt', 'LeftWindows', 'RightWindows']

function normalizeKey(event: KeyboardEvent<HTMLButtonElement>) {
  const codeMap: Record<string, string> = {
    ControlLeft: 'LeftControl',
    ControlRight: 'RightControl',
    ShiftLeft: 'LeftShift',
    ShiftRight: 'RightShift',
    AltLeft: 'LeftAlt',
    AltRight: 'RightAlt',
    MetaLeft: 'LeftWindows',
    MetaRight: 'RightWindows',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
  }
  if (codeMap[event.code]) {
    return codeMap[event.code]
  }
  if (event.code.startsWith('Key')) {
    return event.code.slice(3)
  }
  if (event.code.startsWith('Digit')) {
    return `D${event.code.slice(5)}`
  }
  if (event.code.startsWith('Numpad')) {
    return `NumPad${event.code.slice(6)}`
  }
  return event.key.length === 1 ? event.key.toUpperCase() : event.key
}

function orderedKeys(keys: Iterable<string>) {
  return Array.from(keys).sort((left, right) => {
    const leftIndex = KEY_ORDER.indexOf(left)
    const rightIndex = KEY_ORDER.indexOf(right)
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (leftIndex < 0 ? KEY_ORDER.length : leftIndex) - (rightIndex < 0 ? KEY_ORDER.length : rightIndex)
    }
    return left.localeCompare(right)
  })
}

function serializeKeybind(field: LauncherModConfigField, originalValue: unknown, keys: string[]) {
  if (field.uiHint === 'keybind') {
    return keys.find((key) => !MODIFIER_CODES.has(key)) ?? keys[0] ?? ''
  }
  return Array.isArray(originalValue) ? keys : keys.join(', ')
}

export function LauncherModConfigKeybindControl({ field, value, onChange }: ConfigControlProps) {
  const copy = useEditorCopy().launcher.library.modDetail.config
  const [capturing, setCapturing] = useState(false)
  const [previewKeys, setPreviewKeys] = useState<string[]>([])
  const pressedKeys = useRef(new Set<string>())
  const chordKeys = useRef(new Set<string>())

  const finishCapture = () => {
    const keys = orderedKeys(chordKeys.current)
    if (keys.length) {
      onChange(serializeKeybind(field, value, keys))
    }
    pressedKeys.current.clear()
    chordKeys.current.clear()
    setPreviewKeys([])
    setCapturing(false)
  }

  const assignedKeys = keybindValues(value)
  const displayKeys = capturing ? previewKeys : orderedKeys(assignedKeys)
  const clearValue = Array.isArray(value) ? [] : 'None'

  return (
    <span className="launcher-mod-detail-config-keybind-control">
      <button
        type="button"
        className="launcher-mod-detail-config-keybind-capture"
        data-capturing={capturing || undefined}
        disabled={!field.editable}
        aria-label={field.label}
        onClick={() => {
          if (!capturing) {
            pressedKeys.current.clear()
            chordKeys.current.clear()
            setPreviewKeys([])
            setCapturing(true)
          }
        }}
        onKeyDown={(event) => {
          if (!capturing) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') {
            pressedKeys.current.clear()
            chordKeys.current.clear()
            setPreviewKeys([])
            setCapturing(false)
            return
          }
          if ((event.key === 'Backspace' || event.key === 'Delete') && chordKeys.current.size === 0) {
            onChange(clearValue)
            setCapturing(false)
            return
          }
          if (event.repeat) {
            return
          }
          const key = normalizeKey(event)
          pressedKeys.current.add(key)
          chordKeys.current.add(key)
          setPreviewKeys(orderedKeys(chordKeys.current))
        }}
        onKeyUp={(event) => {
          if (!capturing) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          pressedKeys.current.delete(normalizeKey(event))
          if (pressedKeys.current.size === 0) {
            finishCapture()
          }
        }}
        onBlur={() => {
          if (capturing) {
            finishCapture()
          }
        }}
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        {displayKeys.length ? (
          <span className="launcher-mod-detail-config-keycaps">
            {displayKeys.map((key, index) => (
              <span key={key}>
                {index ? <i aria-hidden="true">+</i> : null}
                <kbd>{key}</kbd>
              </span>
            ))}
          </span>
        ) : (
          <span>{capturing ? copy.keybindListening : copy.keybindUnassigned}</span>
        )}
      </button>
      <button
        type="button"
        className="launcher-mod-detail-config-keybind-clear"
        disabled={!field.editable || assignedKeys.length === 0}
        aria-label={copy.clearKeybind}
        title={copy.clearKeybind}
        onClick={() => onChange(clearValue)}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}

export function LauncherModConfigKeybindMapControl({ field, value, onChange }: ConfigControlProps) {
  const entries = objectEntries(value)
  const values = Object.fromEntries(entries)
  const defaults = Object.fromEntries(objectEntries(field.defaultValue))

  return (
    <span className="launcher-mod-detail-config-keybind-map" role="group" aria-label={field.label}>
      {entries.map(([key, entry]) => {
        const label = humanizeConfigKey(key)
        const nestedField: LauncherModConfigField = {
          ...field,
          key: `${field.key}.${key}`,
          label,
          fieldType: 'string',
          uiHint: 'keybind',
          value: entry,
          defaultValue: defaults[key] ?? null,
          allowValues: [],
          allowBlank: true,
          allowMultiple: false,
        }
        return (
          <span key={key} className="launcher-mod-detail-config-keybind-map-entry">
            <span className="launcher-mod-detail-config-keybind-map-label" title={label}>
              {label}
            </span>
            <LauncherModConfigKeybindControl
              field={nestedField}
              value={entry}
              onChange={(nextValue) => onChange({ ...values, [key]: nextValue })}
            />
          </span>
        )
      })}
    </span>
  )
}

function nestedFieldType(value: unknown): LauncherModConfigField['fieldType'] {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'string') return 'string'
  if (value && typeof value === 'object' && !Array.isArray(value)) return 'object'
  return 'unknown'
}

/** Edits a JSON object recursively while preserving its top-level config key for persistence. */
export function LauncherModConfigObjectGroupControl({ field, value, onChange }: ConfigControlProps) {
  const values = Object.fromEntries(objectEntries(value))
  const defaults = Object.fromEntries(objectEntries(field.defaultValue))

  return (
    <span className="launcher-mod-detail-config-object-group" role="group" aria-label={field.label}>
      {Object.entries(values).map(([key, entry]) => {
        const fieldType = nestedFieldType(entry)
        const nestedField: LauncherModConfigField = {
          ...field,
          key: `${field.key}.${key}`,
          label: humanizeConfigKey(key),
          description: null,
          fieldType,
          uiHint: null,
          value: entry,
          defaultValue: defaults[key] ?? null,
          allowValues: [],
          allowBlank: false,
          allowMultiple: false,
        }
        const updateEntry = (nextValue: unknown) => onChange({ ...values, [key]: nextValue })

        return (
          <span key={key} className="launcher-mod-detail-config-object-entry" data-field-type={fieldType}>
            <span className="launcher-mod-detail-config-object-label" title={nestedField.label}>
              {nestedField.label}
            </span>
            {fieldType === 'object' && objectEntries(entry).length ? (
              <LauncherModConfigObjectGroupControl field={nestedField} value={entry} onChange={updateEntry} />
            ) : fieldType === 'boolean' ? (
              <span className="launcher-mod-detail-config-toggle">
                <input
                  type="checkbox"
                  checked={entry === true}
                  disabled={!field.editable}
                  aria-label={nestedField.label}
                  onChange={(event) => updateEntry(event.currentTarget.checked)}
                />
                <span aria-hidden="true" />
              </span>
            ) : (
              <input
                type={fieldType === 'integer' || fieldType === 'number' ? 'number' : 'text'}
                value={valueToText(entry)}
                disabled={!field.editable}
                aria-label={nestedField.label}
                onChange={(event) => {
                  const text = event.currentTarget.value
                  const parsed = fieldType === 'integer' ? Number.parseInt(text, 10) : Number.parseFloat(text)
                  updateEntry(fieldType === 'integer' || fieldType === 'number' ? (Number.isFinite(parsed) ? parsed : entry) : text)
                }}
              />
            )}
          </span>
        )
      })}
    </span>
  )
}

type ConfigItemControlProps = ConfigControlProps & {
  items: LauncherConfigItemOption[]
  itemState: 'idle' | 'loading' | 'ready' | 'error'
}

export function LauncherModConfigItemControl({ field, value, onChange, items, itemState }: ConfigItemControlProps) {
  const text = valueToText(value)
  return (
    <span className="launcher-mod-detail-config-item-control">
      <input
        type="text"
        value={text}
        disabled={!field.editable}
        aria-label={field.label}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <LauncherModConfigItemPicker
        value={text}
        label={field.label}
        options={items}
        state={itemState}
        disabled={!field.editable}
        onSelect={onChange}
      />
    </span>
  )
}

type ConfigListControlProps = ConfigControlProps & {
  items: LauncherConfigItemOption[]
  itemState: 'idle' | 'loading' | 'ready' | 'error'
}

export function LauncherModConfigListControl({ field, value, onChange, items, itemState }: ConfigListControlProps) {
  const copy = useEditorCopy().launcher.library.modDetail.config
  const [draft, setDraft] = useState('')
  const entries = selectedValues(value)
  const isItemList = field.uiHint === 'item-list'
  const serialize = (nextEntries: string[]) => (Array.isArray(value) ? nextEntries : nextEntries.join(', '))
  const updateEntry = (index: number, nextValue: string) => {
    const next = [...entries]
    next[index] = nextValue
    onChange(serialize(next))
  }
  const addEntry = (nextValue = draft) => {
    const normalized = nextValue.trim()
    if (!normalized || (isItemList && entries.includes(normalized))) {
      return
    }
    onChange(serialize([...entries, normalized]))
    setDraft('')
  }
  const moveEntry = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= entries.length) {
      return
    }
    const next = [...entries]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(serialize(next))
  }

  return (
    <span className="launcher-mod-detail-config-list-control">
      {entries.map((entry, index) => (
        <span key={index} className="launcher-mod-detail-config-list-entry">
          <span className="launcher-mod-detail-config-list-index">{index + 1}</span>
          <input
            type="text"
            value={entry}
            disabled={!field.editable}
            aria-label={copy.listEntry(field.label, index + 1)}
            onChange={(event) => updateEntry(index, event.currentTarget.value)}
          />
          {isItemList ? (
            <LauncherModConfigItemPicker
              value={entry}
              label={field.label}
              options={items}
              state={itemState}
              disabled={!field.editable}
              onSelect={(nextValue) => updateEntry(index, nextValue)}
            />
          ) : null}
          <span className="launcher-mod-detail-config-list-actions">
            <button
              type="button"
              disabled={!field.editable || index === 0}
              title={copy.moveListEntryUp}
              aria-label={copy.moveListEntryUp}
              onClick={() => moveEntry(index, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={!field.editable || index === entries.length - 1}
              title={copy.moveListEntryDown}
              aria-label={copy.moveListEntryDown}
              onClick={() => moveEntry(index, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={!field.editable}
              title={copy.removeListEntry}
              aria-label={copy.removeListEntry}
              onClick={() => onChange(serialize(entries.filter((_, entryIndex) => entryIndex !== index)))}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        </span>
      ))}
      <span className="launcher-mod-detail-config-list-add">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <input
          type="text"
          value={draft}
          disabled={!field.editable}
          aria-label={copy.newListEntry(field.label)}
          placeholder={isItemList ? copy.itemValuePlaceholder : copy.listValuePlaceholder}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addEntry()
            }
          }}
        />
        {isItemList ? (
          <LauncherModConfigItemPicker
            value={draft}
            label={field.label}
            options={items}
            state={itemState}
            disabled={!field.editable}
            onSelect={addEntry}
          />
        ) : null}
        <button type="button" disabled={!field.editable || !draft.trim()} onClick={() => addEntry()}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.addListEntry}</span>
        </button>
      </span>
    </span>
  )
}
