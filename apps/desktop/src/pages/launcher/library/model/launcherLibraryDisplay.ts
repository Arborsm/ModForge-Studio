import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherPackPreset, LauncherVirtualFolder } from '@features/launcher/model/types'

export type LibrarySortMode = 'name' | 'enabled-first' | 'pack'

export type LauncherLibraryDisplayItem =
  | { kind: 'mod'; mod: LauncherLibraryItem; childMods: LauncherLibraryItem[]; isChild: false }
  | { kind: 'folder'; folder: LauncherVirtualFolder; mods: LauncherLibraryItem[]; childFolders: LauncherVirtualFolder[] }

export type LauncherFolderPreviewItem =
  | { kind: 'mod'; id: string; title: string; imageUrl: string | null }
  | { kind: 'folder'; id: string; title: string }

const MAX_LIBRARY_REVEAL_BATCH_SIZE = 4
const TARGET_LIBRARY_REVEAL_WAVES = 4
export const FALLBACK_LIBRARY_REVEAL_BATCH_SIZE = 2

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

export function sortLibraryMods(
  items: LauncherLibraryItem[],
  sortMode: LibrarySortMode,
  packLookup: Map<string, LauncherPackPreset[]>,
  currentPackId: string | null,
) {
  return [...items].sort((left, right) => {
    const leftKey = normalizeLookupKey(getModKey(left))
    const rightKey = normalizeLookupKey(getModKey(right))
    const leftPacks = packLookup.get(leftKey) ?? []
    const rightPacks = packLookup.get(rightKey) ?? []
    const leftPack =
      leftPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ?? leftPacks[0]?.name ?? ''
    const rightPack =
      rightPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ?? rightPacks[0]?.name ?? ''

    if (sortMode === 'enabled-first') {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
      return compareText(left.name, right.name)
    }
    if (sortMode === 'pack') return compareText(leftPack, rightPack) || compareText(left.name, right.name)
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

export function getLauncherFolderTone(folderId: string) {
  const tones = ['blue', 'teal', 'amber', 'rose', 'violet', 'slate'] as const
  let hash = 0
  for (const character of folderId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return tones[hash % tones.length]
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
