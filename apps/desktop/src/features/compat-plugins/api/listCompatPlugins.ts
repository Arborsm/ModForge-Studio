/**
 * @file Desktop host API for compat plugins: lists installed plugins with inline
 * i18n bundles and page descriptors, routed through HostCommandClient.
 * @module features/compat-plugins
 */
import { HOST_COMMANDS } from '@platform/host-commands'
import { createPromiseCache, readCached } from '@shared/lib/cache'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type { CompatPluginSummary } from './types'

const compatPluginCache = createPromiseCache<CompatPluginSummary[]>()
const compatPluginIoPolicy = { kind: 'latest', key: 'compat-plugins' } satisfies HostCommandPolicy
// Reload, toggle and delete all mutate the shared compat plugin state (clearing
// caches and re-scanning). They share one exclusiveMutation resource key so the
// frontend HostCommandClient serializes them against each other, mirroring the
// backend `CompatPluginState` resource lock.
const compatPluginStatePolicy = { kind: 'exclusiveMutation', resource: 'compat-plugin-state' } satisfies HostCommandPolicy

/** Lists installed compat plugins with load errors; result cached for app lifetime. */
export function listCompatPlugins() {
  return readCached(compatPluginCache, 'default', () =>
    invokeDesktop<CompatPluginSummary[]>(HOST_COMMANDS.listCompatPlugins, undefined, compatPluginIoPolicy),
  )
}

/**
 * Reloads compat plugins from disk, clearing all backend caches, and returns the
 * refreshed summaries. Invalidates the local promise cache so subsequent
 * `listCompatPlugins` calls see the fresh data.
 *
 * This is the backend rescan only; the full runtime rebuild (dispose + re-import
 * + re-register) is orchestrated by `reloadCompatPlugins` in `compatPluginRuntime`.
 */
export async function reloadCompatPluginsFromBackend(): Promise<CompatPluginSummary[]> {
  const summaries = await invokeDesktop<CompatPluginSummary[]>(HOST_COMMANDS.reloadCompatPlugins, undefined, compatPluginStatePolicy)
  compatPluginCache.delete('default')
  return summaries
}

/** Returns the resolved compat plugin root directory paths (user-facing data dir). */
export function getCompatPluginRoots() {
  return invokeDesktop<string[]>(HOST_COMMANDS.getCompatPluginRoots, undefined, { kind: 'latest', key: 'compat-plugin-roots' })
}

const compatPluginTogglePolicy = compatPluginStatePolicy

/**
 * Toggles a compat plugin's enabled state by creating or removing a `.disabled`
 * marker file. Returns the refreshed summaries. The caller is responsible for
 * triggering the runtime rebuild (dispose + re-import + re-register) via
 * `reloadCompatPlugins` in `compatPluginRuntime`.
 */
export async function toggleCompatPlugin(pluginId: string, disabled: boolean): Promise<CompatPluginSummary[]> {
  const summaries = await invokeDesktop<CompatPluginSummary[]>(
    HOST_COMMANDS.toggleCompatPlugin,
    { pluginId, disabled },
    compatPluginTogglePolicy,
  )
  compatPluginCache.delete('default')
  return summaries
}

/**
 * Deletes a compat plugin directory entirely. Returns the refreshed summaries.
 * The caller is responsible for triggering the runtime rebuild after deletion.
 */
export async function deleteCompatPlugin(pluginId: string): Promise<CompatPluginSummary[]> {
  const summaries = await invokeDesktop<CompatPluginSummary[]>(HOST_COMMANDS.deleteCompatPlugin, { pluginId }, compatPluginTogglePolicy)
  compatPluginCache.delete('default')
  return summaries
}
