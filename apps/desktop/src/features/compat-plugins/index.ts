/**
 * @file Compat plugins feature: public API for plugin listing, registration
 * building, and plugin locale resolution.
 * @module features/compat-plugins
 */
export { listCompatPlugins, reloadCompatPlugins } from './api/listCompatPlugins'
export type {
  CompatPluginSummary,
  CompatPluginPageSummary,
  CompatPluginSection,
  CompatPluginField,
  CompatPluginPageSource,
  PluginI18nBundle,
  AssetSchemaContribution,
  AssetSchemaField,
  ConditionSyntaxContribution,
  ConditionSyntaxKey,
} from './api/types'
export { listCompatPluginEntries, readCompatPluginEntry, writeCompatPluginEntry } from './api/directoryPackApi'
export type { CompatPluginEntrySummary, ReadCompatPluginEntryResult } from './api/directoryPackApi'
export { buildCompatRegistrations } from './lib/buildCompatRegistrations'
export { resolveModuleLabel } from './lib/resolveModuleLabel'
export { useCompatPluginStore } from './model/compatPluginStore'
export { usePluginLocaleStore, resolvePluginText } from './model/pluginLocaleStore'
export { registerPluginI18nBundles } from './model/registerPluginI18nBundles'
