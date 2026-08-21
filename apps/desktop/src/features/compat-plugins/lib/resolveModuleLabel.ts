/**
 * @file Label resolution chain for workbench module navigation labels.
 * @module features/compat-plugins
 */
import type { WorkbenchModuleLocaleKey } from '@shared/contracts'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import type { LocaleCode } from '@locales/model'
import type { PluginI18nBundle } from '../api/types'

/** Built-in module label record type, keyed by `WorkbenchModuleLocaleKey`. */
type ModuleLabelRecord = Partial<Record<WorkbenchModuleLocaleKey, string>>

/**
 * Resolves a workbench module's sidebar label through the three-step chain:
 *
 * 1. If the registration has a `labelKey` (built-in module), look it up in the
 *    typed locale `moduleLabels` record. This path is byte-for-byte identical
 *    to the previous `navCopy.moduleLabels[labelKey]` lookup.
 * 2. If the registration has a `pluginLabel` (plugin module), look it up in the
 *    plugin locale store for the current locale.
 * 3. Fall back to the key string itself.
 */
export function resolveModuleLabel(
  registration: WorkbenchModuleRegistration,
  moduleLabels: ModuleLabelRecord,
  pluginBundles: Record<string, PluginI18nBundle>,
  locale: LocaleCode,
): string {
  const { labelKey, pluginLabel } = registration.navigation

  if (labelKey) {
    return moduleLabels[labelKey] ?? labelKey
  }

  if (pluginLabel) {
    const bundle = pluginBundles[pluginLabel.pluginId]
    if (bundle) {
      const entries = bundle[locale]
      if (entries) {
        return entries[pluginLabel.key] ?? pluginLabel.key
      }
    }
    return pluginLabel.key
  }

  // Should never happen — validateWorkbenchModules enforces exactly one.
  return registration.id
}
