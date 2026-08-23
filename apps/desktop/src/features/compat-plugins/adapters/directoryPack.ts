/**
 * @file `directory-pack` source adapter: reads and writes pack entries that
 * live as subdirectories under a mod's root subdirectory (e.g. AT's
 * `Textures/<entry>/texture.json`). When the source opts in via
 * `params.includeContentPacks`, entries are aggregated across the target mod
 * and every installed content pack whose `ContentPackFor` targets it; each
 * entry is tagged with its source mod root so reads/writes route back to the
 * pack they came from.
 * @module features/compat-plugins
 */
import type { CompatPluginPageSource } from '../api/types'
import { readCompatPluginEntry, writeCompatPluginEntry } from '../api/directoryPackApi'
import { listAggregatedDirectoryPackEntries, listTaggedDirectoryPackEntries } from '../lib/directoryPackSources'
import type { CompatEntrySummary, CompatPageContext, CompatSourceAdapter } from './types'

/**
 * Resolves the mod root an entry read/write must hit: the entry's own source
 * root (host-resolved during listing) when present, else the target mod root.
 */
function resolveEntryModRoot(context: CompatPageContext, entry: CompatEntrySummary): string | null {
  return entry.sourceModRoot || context.targetModRoot
}

/** `directory-pack` source adapter. Reads/writes entries under `<mod_root>/<root_subdir>/<entry_id>/<entry_file>`. */
export const directoryPackAdapter: CompatSourceAdapter = {
  async listEntries(source: CompatPluginPageSource, context: CompatPageContext): Promise<CompatEntrySummary[]> {
    if (!context.targetModRoot) return []
    const params = source.params
    if (!params.entryFile) return []
    if (params.includeContentPacks === true && context.targetUniqueIds && context.targetUniqueIds.length > 0) {
      return listAggregatedDirectoryPackEntries(context.targetUniqueIds, {
        rootSubdir: params.rootSubdir,
        entryFile: params.entryFile,
        entryImage: params.entryImage,
      })
    }
    return listTaggedDirectoryPackEntries(
      { modRoot: context.targetModRoot, modName: context.targetModName ?? context.targetModUniqueId },
      { rootSubdir: params.rootSubdir, entryFile: params.entryFile, entryImage: params.entryImage },
    )
  },

  async loadEntry(source: CompatPluginPageSource, context: CompatPageContext, entry: CompatEntrySummary): Promise<Record<string, unknown>> {
    const params = source.params
    if (!params.entryFile) throw new Error('directory-pack source missing entryFile')
    const modRoot = resolveEntryModRoot(context, entry)
    if (!modRoot) throw new Error('Target mod is not installed')
    const result = await readCompatPluginEntry({
      modRoot,
      rootSubdir: params.rootSubdir ?? '',
      entryId: entry.id,
      entryFile: params.entryFile,
    })
    return result.content
  },

  async saveEntry(
    source: CompatPluginPageSource,
    context: CompatPageContext,
    entry: CompatEntrySummary,
    value: Record<string, unknown>,
  ): Promise<void> {
    const params = source.params
    if (!params.entryFile) throw new Error('directory-pack source missing entryFile')
    const modRoot = resolveEntryModRoot(context, entry)
    if (!modRoot) throw new Error('Target mod is not installed')
    await writeCompatPluginEntry({
      modRoot,
      rootSubdir: params.rootSubdir ?? '',
      entryId: entry.id,
      entryFile: params.entryFile,
      content: value,
    })
  },
}
