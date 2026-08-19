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

/** Wire type returned by `list_compat_plugins`. */
export type CompatPluginSummary = {
  id: string
  name: string
  format: number
  hasCodeEntry: boolean
  targets: string[]
  pageIds: string[]
  pages: CompatPluginPageSummary[]
  i18n: PluginI18nBundle
  loadError: string | null
}
