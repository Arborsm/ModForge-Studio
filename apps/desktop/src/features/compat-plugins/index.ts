/**
 * @file Compat plugins feature: public API for plugin listing, registration
 * building, and plugin locale resolution.
 * @module features/compat-plugins
 */
export { listCompatPlugins } from './api/listCompatPlugins'
export type { CompatPluginSummary, CompatPluginPageSummary, PluginI18nBundle } from './api/types'
export { buildCompatRegistrations } from './lib/buildCompatRegistrations'
export { resolveModuleLabel } from './lib/resolveModuleLabel'
export { useCompatPluginStore } from './model/compatPluginStore'
export { usePluginLocaleStore, resolvePluginText } from './model/pluginLocaleStore'
export { registerPluginI18nBundles } from './model/registerPluginI18nBundles'
