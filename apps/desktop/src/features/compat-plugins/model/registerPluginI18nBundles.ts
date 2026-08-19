/**
 * @file Bootstrap helper: registers plugin i18n bundles into the plugin locale
 * store. Called once during app startup from the app shell; the store itself
 * stays confined to `features/compat-plugins` and `widgets/workbench-shell`.
 * @module features/compat-plugins
 */
import type { CompatPluginSummary } from '../api/types'
import { usePluginLocaleStore } from './pluginLocaleStore'

/** Registers all plugin i18n bundles from the given summaries into the locale store. */
export function registerPluginI18nBundles(plugins: readonly CompatPluginSummary[]) {
  const store = usePluginLocaleStore.getState()
  for (const plugin of plugins) {
    store.registerBundle(plugin.id, plugin.i18n)
  }
}
