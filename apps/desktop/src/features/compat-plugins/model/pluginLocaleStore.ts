/**
 * @file Plugin locale store: runtime-lookup escape hatch for plugin-provided
 * labels. Confined to `features/compat-plugins` and `widgets/workbench-shell`
 * (the only consumers allowed by the architecture test).
 * @module features/compat-plugins
 */
import { create } from 'zustand'
import type { LocaleCode } from '@locales/model'
import type { PluginI18nBundle } from '../api/types'

type PluginLocaleState = {
  bundles: Record<string, PluginI18nBundle>
  registerBundle: (pluginId: string, i18n: PluginI18nBundle) => void
}

export const usePluginLocaleStore = create<PluginLocaleState>((set) => ({
  bundles: {},
  registerBundle: (pluginId, i18n) =>
    set((state) => {
      if (state.bundles[pluginId] === i18n) return state
      return { bundles: { ...state.bundles, [pluginId]: i18n } }
    }),
}))

/** Resolves a plugin-provided label key for the current locale. */
export function resolvePluginText(bundles: Record<string, PluginI18nBundle>, locale: LocaleCode, pluginId: string, key: string): string {
  const bundle = bundles[pluginId]
  if (!bundle) return key
  const entries = bundle[locale]
  if (!entries) return key
  return entries[key] ?? key
}
