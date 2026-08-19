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
  CompatPluginValidation,
  CompatPluginRequireOneOf,
  PluginI18nBundle,
  AssetSchemaContribution,
  AssetSchemaField,
  ConditionSyntaxContribution,
  ConditionSyntaxKey,
} from './api/types'
export { listCompatPluginEntries, readCompatPluginEntry, writeCompatPluginEntry } from './api/directoryPackApi'
export type { CompatPluginEntrySummary, ReadCompatPluginEntryResult } from './api/directoryPackApi'
export { buildCompatRegistrations, createCompatRuntime } from './lib/buildCompatRegistrations'
export { resolveModuleLabel } from './lib/resolveModuleLabel'
export { loadCodePlugins } from './runtime/codePluginLoader'
export type { CodePluginLoadResult, CodePluginLoadDiagnostic } from './runtime/codePluginLoader'
export { useCompatPluginStore } from './model/compatPluginStore'
export { usePluginLocaleStore, resolvePluginText } from './model/pluginLocaleStore'
export { registerPluginI18nBundles } from './model/registerPluginI18nBundles'
