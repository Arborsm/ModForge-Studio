/**
 * @file `directory-pack` source adapter: reads and writes pack entries that
 * live as subdirectories under a mod's root subdirectory (e.g. AT's
 * `Textures/<entry>/texture.json`).
 * @module features/compat-plugins
 */
import type { CompatPluginPageSource } from '../api/types'
import { listCompatPluginEntries, readCompatPluginEntry, writeCompatPluginEntry } from '../api/directoryPackApi'
import type { CompatEntrySummary, CompatPageContext, CompatSourceAdapter } from './types'

/** `directory-pack` source adapter. Reads/writes entries under `<mod_root>/<root_subdir>/<entry_id>/<entry_file>`. */
export const directoryPackAdapter: CompatSourceAdapter = {
  async listEntries(source: CompatPluginPageSource, context: CompatPageContext): Promise<CompatEntrySummary[]> {
    if (!context.targetModRoot) return []
    const params = source.params
    if (!params.entryFile) return []
    return listCompatPluginEntries({
      modRoot: context.targetModRoot,
      rootSubdir: params.rootSubdir ?? '',
      entryFile: params.entryFile,
      entryImage: params.entryImage,
    })
  },

  async loadEntry(source: CompatPluginPageSource, context: CompatPageContext, entryId: string): Promise<Record<string, unknown>> {
    if (!context.targetModRoot) throw new Error('Target mod is not installed')
    const params = source.params
    if (!params.entryFile) throw new Error('directory-pack source missing entryFile')
    const result = await readCompatPluginEntry({
      modRoot: context.targetModRoot,
      rootSubdir: params.rootSubdir ?? '',
      entryId,
      entryFile: params.entryFile,
    })
    return result.content
  },

  async saveEntry(
    source: CompatPluginPageSource,
    context: CompatPageContext,
    entryId: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    if (!context.targetModRoot) throw new Error('Target mod is not installed')
    const params = source.params
    if (!params.entryFile) throw new Error('directory-pack source missing entryFile')
    await writeCompatPluginEntry({
      modRoot: context.targetModRoot,
      rootSubdir: params.rootSubdir ?? '',
      entryId,
      entryFile: params.entryFile,
      content: value,
    })
  },
}
