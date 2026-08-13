import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { DialogueScriptField } from '@entities/dialogue'
import type { AssetEnumLabelKey } from '@locales/api'
import { useAssetAuthoringCopy } from '@locales/provider'
import { setNestedValue } from '../model/entryDraft'
import { enumLabelKey, type AssetFieldSchema, type FieldControl } from '../model/fieldSchema'
import { getEnumCatalog } from '../model/registry'
import type { AssetResources, ResourceRefKind } from '../model/resources'
import {
  AxisGridField,
  EnumSelectField,
  FieldGroup,
  GsqField,
  JsonField,
  KeyValueListField,
  NumberField,
  NumberListField,
  ReadOnlyField,
  StringListField,
  TextField,
  ToggleField,
  TriBoolField,
  type EnumOption,
  type OpenGsqBuilder,
} from './controls'
import { ColorField, LocalizedTextField, ResourcePickerField, SeasonField, type RenderResourcePickerControl } from './visualControls'

export type AssetFieldRendererProps = {
  field: AssetFieldSchema
  value: unknown
  /** Commits the field value; `undefined` removes the key so the game default applies. */
  onChange: (next: unknown) => void
  /** Reference lists backing `*_ref` suggestion controls. */
  resources: AssetResources
  /** Renders a non-editable view of the same schema, used by browser pages. */
  readOnly?: boolean
  /** Opens the shared GameStateQuery builder for `gsq` controls. */
  onOpenGsqBuilder?: OpenGsqBuilder
  /** Resource browser supplied by a higher FSD layer. */
  renderResourcePicker?: RenderResourcePickerControl
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.map((item) => (typeof item === 'string' ? item : String(item)))
}

function numberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  return numbers.length === value.length ? numbers : undefined
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = typeof item === 'string' ? item : String(item)
  }
  return result
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Reference kind each `*_ref` control browses; the picker reads its catalog from `resources`. */
const REF_KIND_BY_CONTROL = {
  npc_ref: 'npc',
  item_ref: 'item',
  location_ref: 'location',
  texture_ref: 'texture',
  map_ref: 'map',
  building_ref: 'building',
} as const satisfies Partial<Record<FieldControl, ResourceRefKind>>

/** Catalog the `season` control falls back to when a schema does not name one. */
const DEFAULT_SEASON_CATALOG = 'character.season'

/**
 * Resolves one field's enum catalog to labelled options.
 *
 * Shared by the `enum` select and the `season` chip row so both read their
 * labels from the same `enums` locale record; a catalog value without a locale
 * entry falls back to its raw spelling rather than rendering blank.
 */
function enumOptions(catalogId: string | undefined, enums: Record<AssetEnumLabelKey, string>): EnumOption[] {
  return getEnumCatalog(catalogId).map((option) => ({
    value: option,
    label: catalogId ? (enums[enumLabelKey(catalogId, option)] ?? option) : option,
  }))
}

/** Formats any value for the read-only view; null means "no value set". */
function formatReadOnly(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ')
  }
  return JSON.stringify(value)
}

/**
 * Renders one schema field as its control.
 *
 * The control kind alone decides the widget; a page never branches on field
 * names. `schedule_script` is the one kind still routed to the raw JSON control
 * instead of a guessed widget, so no field silently loses its value.
 */
export function AssetFieldRenderer({
  field,
  value,
  onChange,
  resources,
  readOnly,
  onOpenGsqBuilder,
  renderResourcePicker,
}: AssetFieldRendererProps) {
  const copy = useAssetAuthoringCopy()
  const listId = useId()
  const label = copy.fields[field.labelKey]
  const title = label?.label ?? field.key
  const hint = label?.hint

  if (field.control === 'nested_object') {
    const item = objectValue(value)
    return (
      <FieldGroup label={title} hint={hint} wide>
        <div className="asset-field-nested-object">
          {(field.itemSchema ?? []).map((child) => (
            <AssetFieldRenderer
              key={child.key}
              field={child}
              value={item?.[child.key]}
              onChange={(next) => onChange(setNestedValue(item, child.key, next))}
              resources={resources}
              readOnly={readOnly}
              onOpenGsqBuilder={onOpenGsqBuilder}
              renderResourcePicker={renderResourcePicker}
            />
          ))}
        </div>
      </FieldGroup>
    )
  }

  if (field.control === 'nested_list') {
    const items = listValue(value)
    const children = field.itemSchema ?? []
    function commitItems(next: unknown[]) {
      onChange(next.length === 0 ? undefined : next)
    }
    return (
      <FieldGroup label={title} hint={hint} wide>
        <div className="asset-field-nested-list">
          {items.length === 0 ? <p className="asset-field-empty">{copy.chrome.listEmpty}</p> : null}
          {items.map((item, index) => {
            const record = objectValue(item)
            return (
              <div key={index} className="asset-field-nested-item">
                <div className="asset-field-nested-item-head">
                  <span className="asset-field-nested-item-title">{copy.chrome.listEntryTitle(index)}</span>
                  {readOnly ? null : (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={copy.chrome.removeAction}
                      title={copy.chrome.removeAction}
                      onClick={() => commitItems(items.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="asset-field-grid">
                  {children.map((child) => (
                    <AssetFieldRenderer
                      key={child.key}
                      field={child}
                      value={record?.[child.key]}
                      onChange={(next) =>
                        commitItems(
                          items.map((entry, i) => (i === index ? (setNestedValue(objectValue(entry), child.key, next) ?? {}) : entry)),
                        )
                      }
                      resources={resources}
                      readOnly={readOnly}
                      onOpenGsqBuilder={onOpenGsqBuilder}
                      renderResourcePicker={renderResourcePicker}
                    />
                  ))}
                </div>
              </div>
            )
          })}
          {readOnly ? null : (
            <button type="button" className="control-button asset-field-add-row" onClick={() => commitItems([...items, {}])}>
              <Plus className="h-3.5 w-3.5" />
              <span>{copy.chrome.addAction}</span>
            </button>
          )}
        </div>
      </FieldGroup>
    )
  }

  if (readOnly) {
    return <ReadOnlyField label={title} hint={hint} wide={field.wide} text={formatReadOnly(value)} />
  }

  switch (field.control) {
    case 'text': {
      const options = field.suggestions ?? []
      return (
        <>
          <TextField
            label={title}
            hint={hint}
            wide={field.wide}
            value={value}
            listId={options.length > 0 ? listId : undefined}
            onCommit={onChange}
          />
          {options.length > 0 ? (
            <datalist id={listId}>
              {options.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          ) : null}
        </>
      )
    }
    case 'npc_ref':
    case 'item_ref':
    case 'location_ref':
    case 'texture_ref':
    case 'map_ref':
    case 'building_ref':
      return (
        <ResourcePickerField
          label={title}
          hint={hint}
          wide={field.wide}
          kind={REF_KIND_BY_CONTROL[field.control]}
          value={value}
          resources={resources}
          renderResourcePicker={renderResourcePicker}
          onCommit={onChange}
        />
      )
    case 'color_rgb':
      return <ColorField label={title} hint={hint} wide={field.wide} value={value} onCommit={onChange} />
    case 'season':
      return (
        <SeasonField
          label={title}
          hint={hint}
          value={value}
          options={enumOptions(field.enumCatalog ?? DEFAULT_SEASON_CATALOG, copy.enums)}
          onCommit={onChange}
        />
      )
    case 'localized_text':
      return (
        <LocalizedTextField
          label={title}
          hint={hint}
          wide={field.wide}
          multiline={field.wide}
          textCategory={field.textCategory}
          value={value}
          resources={resources}
          onCommit={onChange}
        />
      )
    case 'textarea':
      return <TextField label={title} hint={hint} wide={field.wide} multiline value={value} onCommit={onChange} />
    case 'number':
      return <NumberField label={title} hint={hint} min={field.min} max={field.max} step={field.step} value={value} onCommit={onChange} />
    case 'toggle':
      return <ToggleField label={title} hint={hint} value={value} onCommit={onChange} />
    case 'tri_bool':
      return <TriBoolField label={title} hint={hint} value={value} onCommit={onChange} />
    case 'enum':
      return (
        <EnumSelectField label={title} hint={hint} value={value} options={enumOptions(field.enumCatalog, copy.enums)} onCommit={onChange} />
      )
    case 'gsq':
      return <GsqField label={title} hint={hint} wide={field.wide} value={value} onCommit={onChange} onOpenBuilder={onOpenGsqBuilder} />
    case 'string_list':
      return <StringListField label={title} hint={hint} wide={field.wide} values={stringList(value)} onCommit={onChange} />
    case 'number_list':
      return <NumberListField label={title} hint={hint} values={numberList(value)} onCommit={onChange} />
    case 'key_value_list':
      return <KeyValueListField label={title} hint={hint} wide={field.wide} record={stringRecord(value)} onCommit={onChange} />
    case 'point':
      return <AxisGridField label={title} hint={hint} axes={['X', 'Y']} value={objectValue(value)} onCommit={onChange} />
    case 'rect':
      return <AxisGridField label={title} hint={hint} axes={['X', 'Y', 'Width', 'Height']} value={objectValue(value)} onCommit={onChange} />
    case 'dialogue_script':
      return (
        <FieldGroup label={title} hint={hint} wide>
          <DialogueScriptField
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next === '' ? undefined : next)}
            density="compact"
          />
        </FieldGroup>
      )
    default:
      return <JsonField label={title} hint={hint} wide={field.wide} expect={field.rawShape ?? 'any'} value={value} onCommit={onChange} />
  }
}
