/**
 * @file Source adapter interface and types for compat plugin page content I/O.
 * @module features/compat-plugins
 */
import type { CompatPluginPageSource } from '../api/types'

/** Context provided to a source adapter when listing/loading/saving entries. */
export type CompatPageContext = {
  /** Target mod UniqueID (manifest targets[0] or page-level override). */
  targetModUniqueId: string
  /** Installed root directory of the target mod, resolved by UniqueID from the Mods directory; null when the mod is not installed. */
  targetModRoot: string | null
  /** Display name of the resolved target mod; used to tag entries when content-pack aggregation is off. */
  targetModName?: string | null
  /** All candidate UniqueIDs declared by the plugin (manifest targets); used to aggregate content packs when the source opts in. */
  targetUniqueIds?: readonly string[]
  /** Active project root; null when projectAccess is "none". */
  projectRoot: string | null
}

/** Summary of one pack entry returned by `listEntries`. */
export type CompatEntrySummary = {
  id: string
  entryDir: string
  entryFilePath: string
  entryImagePath: string | null
  /**
   * Absolute path of the mod root containing this entry — the target mod or a
   * content pack for it. Together with `id` (pack-local) it forms the entry
   * identity; load/save route through this root.
   */
  sourceModRoot: string
  /** Display name of the mod containing this entry. */
  sourceModName: string
}

/** Reads and writes pack entries for a declared source kind. Implementations are core code. */
export interface CompatSourceAdapter {
  listEntries(source: CompatPluginPageSource, context: CompatPageContext): Promise<CompatEntrySummary[]>
  loadEntry(source: CompatPluginPageSource, context: CompatPageContext, entry: CompatEntrySummary): Promise<Record<string, unknown>>
  saveEntry(
    source: CompatPluginPageSource,
    context: CompatPageContext,
    entry: CompatEntrySummary,
    value: Record<string, unknown>,
  ): Promise<void>
}

/** Adapter registry: kind → adapter instance. Populated lazily by `resolveSourceAdapter`. */
const adapterRegistry = new Map<string, CompatSourceAdapter>()

/** Resolves the adapter for a given source kind. Returns null for unsupported kinds. */
export async function resolveSourceAdapter(kind: string): Promise<CompatSourceAdapter | null> {
  const cached = adapterRegistry.get(kind)
  if (cached) return cached
  if (kind === 'directory-pack') {
    const module = await import('./directoryPack')
    adapterRegistry.set(kind, module.directoryPackAdapter)
    return module.directoryPackAdapter
  }
  return null
}
