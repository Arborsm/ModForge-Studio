/**
 * @file Bootstrap helper: registers plugin i18n bundles into the plugin locale
 * store. Called during app startup and on compat-plugin hot-reload from the app
 * shell; the store itself stays confined to `features/compat-plugins` and
 * `widgets/workbench-shell`.
 *
 * Registration is whole-tree replace: the store's bundle map is rebuilt from the
 * given plugin set so deleted plugins vanish and updated bundles take effect
 * immediately. This also keeps plugin sidebar labels in sync after a locale
 * switch since the store snapshot is always derived from the current plugin set.
 * @module features/compat-plugins
 */
import type { CompatPluginSummary, PluginI18nBundle } from '../api/types'
import { usePluginLocaleStore } from './pluginLocaleStore'

/** Replaces all plugin i18n bundles in the locale store with the given set. */
export function registerPluginI18nBundles(plugins: readonly CompatPluginSummary[]) {
  const bundles: Record<string, PluginI18nBundle> = {}
  for (const plugin of plugins) {
    bundles[plugin.id] = plugin.i18n
  }
  usePluginLocaleStore.getState().setBundles(bundles)
}
