import { getModKey, normalizeLookupKey, normalizeModKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherPackPreset, LauncherVirtualFolder } from '@features/launcher/model/types'

export type LibrarySortMode = 'name' | 'enabled-first' | 'custom'

export type LauncherLibraryDisplayItem =
  | { kind: 'mod'; mod: LauncherLibraryItem; childMods: LauncherLibraryItem[]; isChild: false }
  | { kind: 'folder'; folder: LauncherVirtualFolder; mods: LauncherLibraryItem[]; childFolders: LauncherVirtualFolder[] }

export type LauncherFolderPreviewItem =
  | { kind: 'mod'; id: string; title: string; imageUrl: string | null }
  | { kind: 'folder'; id: string; title: string }

const MAX_LIBRARY_REVEAL_BATCH_SIZE = 4
const TARGET_LIBRARY_REVEAL_WAVES = 4
export const FALLBACK_LIBRARY_REVEAL_BATCH_SIZE = 2
export const LAUNCHER_LIBRARY_CUSTOM_ORDER_START_KEY = '__start__'

export function shortenLibraryPath(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.replaceAll('/', '\\')
  const parts = normalized.split('\\').filter(Boolean)
  if (parts.length <= 3) {
    return normalized
  }

  return `...\\${parts.slice(-3).join('\\')}`
}

export function buildPackLookup(packPresets: LauncherPackPreset[]) {
  const lookup = new Map<string, LauncherPackPreset[]>()
  for (const pack of packPresets) {
    for (const modKey of pack.modKeys) {
      const normalized = normalizeLookupKey(modKey)
      if (!normalized) continue
      const existing = lookup.get(normalized)
      if (existing) existing.push(pack)
      else lookup.set(normalized, [pack])
    }
  }
  return lookup
}

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').localeCompare(right ?? '', undefined, { sensitivity: 'base' })
}

export function deriveLibraryViewKey({
  hiddenViewOpen,
  scopeMode,
  currentPackId,
}: {
  hiddenViewOpen: boolean
  scopeMode: 'all' | 'current-pack'
  currentPackId: string | null
}) {
  if (hiddenViewOpen) {
    return 'hidden'
  }
  if (scopeMode === 'current-pack' && currentPackId?.trim()) {
    return `pack:${currentPackId.trim()}`
  }
  return 'all'
}

export function getLibraryViewOrderContainerKey(viewKey: string) {
  return `view:${viewKey.trim() || 'all'}`
}

export function getLibraryFolderOrderContainerKey(folderId: string) {
  return `folder:${folderId.trim()}`
}

export function encodeCustomItemKey(kind: 'folder' | 'mod', id: string) {
  const value = kind === 'mod' ? normalizeModKey(id) : id.trim()
  if (!value) {
    return null
  }
  return `${kind === 'folder' ? 'f' : 'm'}:${value}`
}

export function decodeCustomItemKey(value: string) {
  const trimmed = value.trim()
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }
  const prefix = trimmed.slice(0, separatorIndex)
  const id = trimmed.slice(separatorIndex + 1).trim()
  if (!id) {
    return null
  }
  if (prefix === 'f') {
    return { kind: 'folder' as const, id }
  }
  if (prefix === 'm') {
    const modKey = normalizeModKey(id)
    return modKey ? { kind: 'mod' as const, id: modKey } : null
  }
  return null
}

export function getDisplayItemCustomOrderKey(item: LauncherLibraryDisplayItem) {
  return item.kind === 'folder' ? encodeCustomItemKey('folder', item.folder.id) : encodeCustomItemKey('mod', getModKey(item.mod))
}

export function applyCustomOrder<T>(items: T[], order: readonly string[] | null | undefined, getItemKey: (item: T) => string | null) {
  if (!order?.length || items.length <= 1) {
    return [...items]
  }

  const itemByKey = new Map<string, T>()
  const itemKeyLookup = new Map<T, string>()
  for (const item of items) {
    const key = getItemKey(item)
    if (!key) {
      continue
    }
    const lookup = normalizeLookupKey(key)
    itemByKey.set(lookup, item)
    itemKeyLookup.set(item, lookup)
  }

  const used = new Set<string>()
  const sorted: T[] = []
  for (const key of order) {
    const item = itemByKey.get(normalizeLookupKey(key))
    if (!item) {
      continue
    }
    const lookup = itemKeyLookup.get(item)
    if (!lookup || used.has(lookup)) {
      continue
    }
    used.add(lookup)
    sorted.push(item)
  }

  for (const item of items) {
    const lookup = itemKeyLookup.get(item)
    if (!lookup) {
      sorted.push(item)
      continue
    }
    if (used.has(lookup)) {
      continue
    }
    used.add(lookup)
    sorted.push(item)
  }

  return sorted
}

export function sortLibraryMods(items: LauncherLibraryItem[], sortMode: LibrarySortMode) {
  return [...items].sort((left, right) => {
    if (sortMode === 'enabled-first') {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
      return compareText(left.name, right.name)
    }
    return compareText(left.name, right.name)
  })
}

export function buildLibraryCardMeta(mod: LauncherLibraryItem, noneLabel: string) {
  const author = mod.author?.trim()
  const version = mod.version?.trim()
  if (author && version) {
    return `${author} · v${version}`
  }
  if (author) {
    return author
  }
  if (version) {
    return `v${version}`
  }
  return noneLabel
}

export function getPackModIds(pack: LauncherPackPreset | null, mods: LauncherLibraryItem[]) {
  if (!pack) {
    return []
  }

  const wantedKeys = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
  return mods.filter((item) => wantedKeys.has(normalizeLookupKey(getModKey(item)))).map((item) => item.id)
}

export function buildLauncherFolderPreviewItems(
  mods: LauncherLibraryItem[],
  childFolders: LauncherVirtualFolder[],
): LauncherFolderPreviewItem[] {
  const previewMods = mods.slice(0, 4).map<LauncherFolderPreviewItem>((mod) => ({
    kind: 'mod',
    id: mod.id,
    title: mod.name,
    imageUrl: mod.imageUrl,
  }))
  const remainingPreviewSlots = Math.max(0, 4 - previewMods.length)
  const previewFolders = childFolders.slice(0, remainingPreviewSlots).map<LauncherFolderPreviewItem>((childFolder) => ({
    kind: 'folder',
    id: childFolder.id,
    title: childFolder.name,
  }))
  return [...previewMods, ...previewFolders]
}

/**
 * Golden-angle hue distribution — guarantees adjacent indices get visually distinct hues
 * with no repeats. 137.508° is the golden angle, which produces the most uniform
 * distribution on the color wheel for any number of items.
 */
const FOLDER_TONE_GOLDEN_ANGLE = 137.508

function folderToneHue(index: number) {
  return Math.round((index * FOLDER_TONE_GOLDEN_ANGLE) % 360)
}

/** CSS custom properties for a folder card / panel, using light-dark() for theme support. */
export function getLauncherFolderToneStyle(index: number): Record<string, string> {
  const h = folderToneHue(index)
  return {
    '--launcher-folder-bg': `light-dark(hsl(${h}, 40%, 96%), hsl(${h}, 32%, 10%))`,
    '--launcher-folder-bg-strong': `light-dark(hsl(${h}, 55%, 88%), hsl(${h}, 32%, 16%))`,
    '--launcher-folder-border': `light-dark(hsla(${h}, 55%, 62%, 0.42), hsla(${h}, 42%, 45%, 0.32))`,
    '--launcher-folder-accent': `light-dark(hsl(${h}, 60%, 40%), hsl(${h}, 52%, 62%))`,
    '--launcher-folder-front': `light-dark(hsl(${h}, 55%, 82%), hsl(${h}, 36%, 20%))`,
    '--launcher-folder-back': `light-dark(hsl(${h}, 45%, 92%), hsl(${h}, 30%, 13%))`,
  }
}

/** Hash-based hue index as fallback when grid index isn't available. */
export function getLauncherFolderToneIndex(folderId: string): number {
  let hash = 0
  for (const character of folderId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

export function clampLibraryRevealBatchSize(value: number, itemCount: number) {
  if (itemCount <= 0) return 1
  return Math.max(1, Math.min(MAX_LIBRARY_REVEAL_BATCH_SIZE, itemCount, value))
}

export function computeLibraryRevealBatchSize({
  itemCount,
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
}: {
  itemCount: number
  viewportWidth: number
  viewportHeight: number
  cardWidth: number
  cardHeight: number
}) {
  if (itemCount <= 0) return 1
  if (viewportWidth <= 0 || viewportHeight <= 0 || cardWidth <= 0 || cardHeight <= 0) {
    return clampLibraryRevealBatchSize(FALLBACK_LIBRARY_REVEAL_BATCH_SIZE, itemCount)
  }

  const visibleColumns = Math.max(1, Math.floor(viewportWidth / cardWidth))
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / cardHeight))
  const visibleItemCount = Math.min(itemCount, visibleColumns * visibleRows)
  return clampLibraryRevealBatchSize(Math.ceil(visibleItemCount / TARGET_LIBRARY_REVEAL_WAVES), itemCount)
}
