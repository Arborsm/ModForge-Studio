/**
 * @file Builds the workbench `AppRegistry` from static modules plus the current
 * compat-plugin runtime. The initial load and hot-reload both funnel through
 * {@link buildWorkbenchRegistry}; the difference is whether the compat-plugin
 * runtime is built from the cached backend scan (initial) or a fresh rescan
 * with an incremented epoch (reload).
 *
 * On success the workbench registry store is updated atomically so subscribed
 * workbench views re-render against the new module set. On failure the previous
 * registry is preserved and the error is rethrown for the caller to surface.
 * @module app
 */
import type { AppRegistry } from '@shared/contracts'
import type { CodePluginLoadDiagnostic } from '@features/compat-plugins'
import { loadCompatPlugins, reloadCompatPlugins } from '@features/compat-plugins'
import { staticWorkbenchModules } from './registry-setup'
import { createAppRegistry } from './registry'
import { useWorkbenchRegistryStore } from './workbenchRegistryStore'

export type BuildWorkbenchRegistryResult = {
  registry: AppRegistry
  diagnostics: CodePluginLoadDiagnostic[]
  epoch: number
}

/**
 * Builds and publishes the workbench registry. When `reload` is true the
 * compat-plugin runtime is hot-reloaded (backend rescan + dispose + re-import
 * with a versioned epoch); otherwise the initial cached load is used.
 */
export async function buildWorkbenchRegistry(reload: boolean): Promise<BuildWorkbenchRegistryResult> {
  const store = useWorkbenchRegistryStore.getState()
  store.setStatus('loading')
  try {
    const runtime = reload ? await reloadCompatPlugins() : await loadCompatPlugins()
    const registry = createAppRegistry({
      workbenchModules: [...staticWorkbenchModules, ...runtime.registrations, ...runtime.codeRegistrations],
    })
    store.setRegistry(registry, runtime.epoch)
    return { registry, diagnostics: runtime.diagnostics, epoch: runtime.epoch }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    store.setError(message)
    throw error
  }
}

/**
 * Builds and publishes a static-only workbench registry (built-in modules, no
 * compat plugins) as a last-resort fallback for the initial load. Used when
 * {@link buildWorkbenchRegistry} fails so the workbench — including the plugin
 * manager that surfaces the failure — stays reachable instead of being stuck on
 * the skeleton screen. The compat plugin error remains available via the compat
 * plugin store for the plugin manager to display.
 */
export function buildStaticFallbackRegistry(): AppRegistry {
  const registry = createAppRegistry({ workbenchModules: [...staticWorkbenchModules] })
  useWorkbenchRegistryStore.getState().setRegistry(registry, 0)
  return registry
}
