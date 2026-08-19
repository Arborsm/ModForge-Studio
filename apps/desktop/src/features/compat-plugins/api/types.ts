/**
 * @file Wire types for the compat plugin host command API.
 * @module features/compat-plugins
 */
import type { LocaleCode } from '@locales/model'

/** Inline i18n bundle: locale → (key → value). */
export type PluginI18nBundle = Partial<Record<LocaleCode, Record<string, string>>>

/** Page descriptor carried in `CompatPluginSummary`, carrying navigation-relevant fields. */
export type CompatPluginPageSummary = {
  id: string
  section: string
  order: number
  icon: string
  titleKey: string
  presentation: string
  projectAccess: string
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
