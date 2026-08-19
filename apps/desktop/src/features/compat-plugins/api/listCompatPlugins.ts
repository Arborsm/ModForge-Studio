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
const compatPluginReloadPolicy = { kind: 'exclusiveMutation', resource: 'compat-plugins-reload' } satisfies HostCommandPolicy

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
 */
export async function reloadCompatPlugins(): Promise<CompatPluginSummary[]> {
  const summaries = await invokeDesktop<CompatPluginSummary[]>(HOST_COMMANDS.reloadCompatPlugins, undefined, compatPluginReloadPolicy)
  compatPluginCache.delete('default')
  return summaries
}
