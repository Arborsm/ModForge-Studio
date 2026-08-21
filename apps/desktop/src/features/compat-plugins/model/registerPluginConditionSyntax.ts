/**
 * @file Bootstrap helper: flattens plugin `conditionSyntax` contributions into
 * the entity-level plugin condition syntax store. Called once during app
 * startup from the app shell; the store itself lives in
 * `entities/content-patcher` so CP/GSQ editors can consume it without a
 * feature-to-feature import.
 * @module features/compat-plugins
 */
import type { CompatPluginSummary } from '../api/types'
import { usePluginConditionSyntaxStore, type PluginConditionSyntaxKey } from '@entities/content-patcher'

/**
 * Registers all plugin condition syntax contributions from the given summaries
 * into the entity-level store. Each contribution's `namespace` is preserved so
 * editors can group or filter keys by originating plugin.
 */
export function registerPluginConditionSyntax(plugins: readonly CompatPluginSummary[]) {
  const entries: PluginConditionSyntaxKey[] = []
  for (const plugin of plugins) {
    for (const contribution of plugin.conditionSyntax) {
      for (const key of contribution.keys) {
        entries.push({ key: key.key, namespace: contribution.namespace })
      }
    }
  }
  usePluginConditionSyntaxStore.getState().register(entries)
}
