/**
 * @file Page descriptor store: holds resolved page descriptors indexed by
 * `pluginId:pageId`, so the CompatModuleRuntime can look up the descriptor
 * from the module id without prop drilling.
 * @module features/compat-plugins
 */
import { create } from 'zustand'
import type { CompatPluginPageSummary } from '../api/types'

type PageDescriptorEntry = {
  pluginId: string
  page: CompatPluginPageSummary
  /** The plugin's targets (mod UniqueIDs), used to resolve the target mod root. */
  targets: readonly string[]
}

type PageDescriptorState = {
  descriptors: Record<string, PageDescriptorEntry>
  registerPages: (pluginId: string, pages: readonly CompatPluginPageSummary[], targets: readonly string[]) => void
  getPage: (pluginId: string, pageId: string) => CompatPluginPageSummary | null
  getEntry: (pluginId: string, pageId: string) => PageDescriptorEntry | null
}

function descriptorKey(pluginId: string, pageId: string): string {
  return `${pluginId}:${pageId}`
}

export const usePageDescriptorStore = create<PageDescriptorState>((set, get) => ({
  descriptors: {},
  registerPages: (pluginId, pages, targets) =>
    set((state) => {
      const next = { ...state.descriptors }
      for (const page of pages) {
        next[descriptorKey(pluginId, page.id)] = { pluginId, page, targets }
      }
      return { descriptors: next }
    }),
  getPage: (pluginId, pageId) => {
    const entry = get().descriptors[descriptorKey(pluginId, pageId)]
    return entry?.page ?? null
  },
  getEntry: (pluginId, pageId) => {
    return get().descriptors[descriptorKey(pluginId, pageId)] ?? null
  },
}))

/** Resolves a page descriptor from a compat module id (`compat-<pluginId>:<pageId>`). */
export function getPageDescriptorByModuleId(moduleId: string): CompatPluginPageSummary | null {
  // Module id format: `compat-<pluginId>:<pageId>`
  const prefix = 'compat-'
  if (!moduleId.startsWith(prefix)) return null
  const rest = moduleId.slice(prefix.length)
  const colonIndex = rest.lastIndexOf(':')
  if (colonIndex < 0) return null
  const pluginId = rest.slice(0, colonIndex)
  const pageId = rest.slice(colonIndex + 1)
  return usePageDescriptorStore.getState().getPage(pluginId, pageId)
}

/** Resolves the full descriptor entry (including targets) from a compat module id. */
export function getPageDescriptorEntryByModuleId(moduleId: string): PageDescriptorEntry | null {
  const prefix = 'compat-'
  if (!moduleId.startsWith(prefix)) return null
  const rest = moduleId.slice(prefix.length)
  const colonIndex = rest.lastIndexOf(':')
  if (colonIndex < 0) return null
  const pluginId = rest.slice(0, colonIndex)
  const pageId = rest.slice(colonIndex + 1)
  return usePageDescriptorStore.getState().getEntry(pluginId, pageId)
}
