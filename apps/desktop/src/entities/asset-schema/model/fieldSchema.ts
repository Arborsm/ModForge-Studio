/**
 * Declarative field schema for Content Patcher data assets.
 *
 * This is the data-asset counterpart of the event editor's `CommandSchema`: a
 * page contributes one `AssetSchema` plus its domain types, and the shared
 * renderer turns it into controls, grouping, validation and a read-only view.
 * Pure types and lookups — no React, no host access.
 */

import type { AssetEnumLabelKey, AssetFieldLabelKey, AssetGroupLabelKey, AssetIssueMessageKey, AssetIssueParams } from '@locales/api'

/**
 * Control kinds the shared renderer knows how to draw.
 *
 * `nested_object` is not in the original control list but is required by every
 * asset that nests a single object rather than a list (CharacterData `Shadow`,
 * building interior descriptors); it reuses `itemSchema` exactly like
 * `nested_list`, so no second nesting mechanism exists.
 *
 * `season` is an enum over the four seasons drawn as a chip row instead of a
 * select, and `localized_text` is free text that additionally resolves and
 * writes `[LocalizedText Strings\X:key]` references. Both stay separate control
 * kinds rather than flags on `enum`/`text` so a schema states its intent once.
 */
export type FieldControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'tri_bool'
  | 'enum'
  | 'season'
  | 'localized_text'
  | 'gsq'
  | 'string_list'
  | 'number_list'
  | 'key_value_list'
  | 'point'
  | 'rect'
  | 'color_rgb'
  | 'npc_ref'
  | 'item_ref'
  | 'location_ref'
  | 'texture_ref'
  | 'map_ref'
  | 'building_ref'
  | 'dialogue_script'
  | 'schedule_script'
  | 'nested_list'
  | 'nested_object'
  | 'raw'

export type AssetIssueSeverity = 'error' | 'warning' | 'info'

/**
 * One validation finding. `path` locates the value inside the asset
 * (`[entryKey, fieldKey, index, subFieldKey]`), `messageKey` resolves against
 * the `assetAuthoring.issues` locale contract and `params` carries its
 * interpolation values.
 */
export type AssetIssue = {
  severity: AssetIssueSeverity
  code: string
  messageKey: AssetIssueMessageKey
  path: readonly (string | number)[]
  relatedKeys?: readonly string[]
  params?: AssetIssueParams
}

/** Context handed to a field-level `validate` callback. */
export type AssetValidationContext = {
  assetId: string
  /** Entry the value belongs to. */
  entryKey: string
  /** Full path of the value being validated, usable as `AssetIssue.path`. */
  path: readonly (string | number)[]
  /** Sibling values of the same object, for cross-field rules. */
  siblings: Readonly<Record<string, unknown>>
}

export type AssetFieldSchema = {
  /** Game-shape JSON key this control reads and writes. */
  key: string
  /** Collapsible group id; must match one of `AssetSchema.groups[].id`. */
  group: string
  control: FieldControl
  labelKey: AssetFieldLabelKey
  required?: boolean
  /** Static enum catalog id registered through `registerEnumCatalog`. */
  enumCatalog?: string
  /** Static datalist suggestions for free-text controls. */
  suggestions?: readonly string[]
  /** Expected JSON shape of a `raw` control, checked before committing. */
  rawShape?: 'array' | 'object'
  /** Numeric bounds forwarded to `number` controls. */
  min?: number
  max?: number
  step?: number
  /** Item fields of a `nested_list` / `nested_object` control. */
  itemSchema?: readonly AssetFieldSchema[]
  /** Renders across the full canvas width instead of one grid cell. */
  wide?: boolean
  validate?: (value: unknown, context: AssetValidationContext) => AssetIssue[]
}

export type AssetGroupSchema = {
  id: string
  labelKey: AssetGroupLabelKey
  collapsedByDefault?: boolean
}

export type AssetSchema = {
  /** Content Patcher target this schema describes, e.g. `Data/Characters`. */
  assetId: string
  /** Known keys in game data schema order; drives serialization order. */
  keyOrder: readonly string[]
  groups: readonly AssetGroupSchema[]
  fields: readonly AssetFieldSchema[]
}

/** Indexes a schema's fields by JSON key for O(1) lookups. */
export function indexAssetFields(schema: AssetSchema): ReadonlyMap<string, AssetFieldSchema> {
  return new Map(schema.fields.map((field) => [field.key, field]))
}

/** Returns the fields of one group, in schema declaration order. */
export function fieldsInGroup(schema: AssetSchema, groupId: string): readonly AssetFieldSchema[] {
  return schema.fields.filter((field) => field.group === groupId)
}

/**
 * Resolves a raw enum value to its canonical catalog spelling. The game parses
 * enum strings case-insensitively, so `"fall"` matches `"Fall"`. Returns null
 * for values outside the catalog, which editors preserve rather than destroy.
 */
export function matchEnumValue(catalog: readonly string[], raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const lower = raw.toLowerCase()
  return catalog.find((value) => value.toLowerCase() === lower) ?? null
}

/** Builds the `assetAuthoring.enums` key of one catalog value. */
export function enumLabelKey(catalog: string, value: string): AssetEnumLabelKey {
  return `${catalog}.${value}` as AssetEnumLabelKey
}
