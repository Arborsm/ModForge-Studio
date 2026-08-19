/**
 * @file Wire types for the compat plugin host command API.
 * @module features/compat-plugins
 */
import type { LocaleCode } from '@locales/model'

/** Inline i18n bundle: locale → (key → value). */
export type PluginI18nBundle = Partial<Record<LocaleCode, Record<string, string>>>

/** Source declaration for a page's pack entry I/O. */
export type CompatPluginPageSource = {
  kind: string
  params: {
    entryFile?: string
    entryImage?: string
    rootSubdir?: string
  }
}

/** Conditional visibility declaration for a field. */
export type CompatPluginFieldVisibleWhen = {
  kind: 'field-eq' | 'field-in'
  field: string
  value?: unknown
  values?: unknown[]
}

/** Validation rule declaration for a field. */
export type CompatPluginFieldValidate = {
  kind: string
  value?: unknown
}

/** A single field descriptor in a page section. */
export type CompatPluginField = {
  id: string
  path: string
  type: 'bool' | 'number' | 'text' | 'choice' | 'keybind' | 'keybind-list' | 'string-list' | 'record-list' | 'object'
  labelKey?: string
  required?: boolean
  min?: number
  max?: number
  interval?: number
  allowValues?: string[]
  validate?: CompatPluginFieldValidate[]
  visibleWhen?: CompatPluginFieldVisibleWhen
  /** For `record-list` fields: sub-schema for each record's fields. */
  fields?: CompatPluginField[]
  /** For `object` fields: sub-fields of the nested object. */
  subFields?: CompatPluginField[]
}

/** A grouped set of field descriptors in a page. */
export type CompatPluginSection = {
  titleKey: string
  fields: CompatPluginField[]
}

/** Page descriptor carried in `CompatPluginSummary`. */
export type CompatPluginPageSummary = {
  id: string
  section: string
  order: number
  icon: string
  titleKey: string
  presentation: string
  projectAccess: string
  /** Stage 2: source declaration for pack entry I/O (null for code-package pages). */
  source: CompatPluginPageSource | null
  /** Stage 2: layout hint ("two-column" | "single"). */
  layout: string | null
  /** Stage 2: grouped field descriptors. */
  sections: CompatPluginSection[]
}

/** Asset schema field declaration from a plugin's assetSchema contribution. */
export type AssetSchemaField = {
  id: string
  path: string
  type: string
  labelKey?: string
  descriptionKey?: string
}

/** Asset schema contribution: declares asset field metadata for CP editor merging. */
export type AssetSchemaContribution = {
  assetPath: string
  fields: AssetSchemaField[]
}

/** Condition syntax key declaration from a plugin's conditionSyntax contribution. */
export type ConditionSyntaxKey = {
  key: string
  labelKey?: string
  descriptionKey?: string
}

/** Condition syntax contribution: declares condition keys for When/GSQ editor autocomplete. */
export type ConditionSyntaxContribution = {
  namespace: string
  keys: ConditionSyntaxKey[]
}

/** Wire type returned by `list_compat_plugins`. */
export type CompatPluginSummary = {
  id: string
  name: string
  format: number
  hasCodeEntry: boolean
  /** Code-package entry file path relative to plugin root (e.g. "index.js"); null for data-pack plugins. */
  entry: string | null
  /** SDK version declared in manifest (e.g. "1.0.0"); null for data-pack plugins. */
  sdkVersion: string | null
  targets: string[]
  pageIds: string[]
  pages: CompatPluginPageSummary[]
  i18n: PluginI18nBundle
  loadError: string | null
  /** Stage 4: asset schema contributions for CP editor merging. */
  assetSchemas: AssetSchemaContribution[]
  /** Stage 4: condition syntax contributions for When/GSQ editor autocomplete. */
  conditionSyntax: ConditionSyntaxContribution[]
}
