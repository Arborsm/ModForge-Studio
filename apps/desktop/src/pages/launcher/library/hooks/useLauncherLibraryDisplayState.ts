import { useCallback, useMemo } from 'react'
import type { LauncherCopy } from '@locales/schema'
import { LAUNCHER_ARCHIVE_FILE_SUFFIXES } from '@shared/lib/desktop'
import { buildChildModLookup, buildParentModLookup } from '@features/launcher/model/childModRelations'
import { getModKey, includesLibraryFilter, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherSettingsDraft, LauncherVirtualFolder } from '@features/launcher/model/types'
import type { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import {
  buildPackLookup,
  shortenLibraryPath,
  sortLibraryMods,
  type LauncherLibraryDisplayItem,
  type LibrarySortMode,
} from '../model/launcherLibraryDisplay'

type LauncherLibraryDisplayStateInput = {
  settings: LauncherSettingsDraft
  library: ReturnType<typeof useLauncherLibrary>
  copy: LauncherCopy
  sortMode: LibrarySortMode
  detailModId: string | null
  hiddenViewOpen: boolean
  editMode: boolean
  editingSelectionIds: string[]
  expandedParentIds: string[]
  openLibraryFolderIds: string[]
  readyLibraryFolderIds: string[]
}

/** Derives launcher-library UI lists, lookup maps, and display labels from the current library state. */
export function useLauncherLibraryDisplayState({
  settings,
  library,
  copy,
  sortMode,
  detailModId,
  hiddenViewOpen,
  editMode,
  editingSelectionIds,
  expandedParentIds,
  openLibraryFolderIds,
  readyLibraryFolderIds,
}: LauncherLibraryDisplayStateInput) {
  const packLookup = useMemo(() => buildPackLookup(library.packPresets), [library.packPresets])
  const childGroupLookup = useMemo(() => buildChildModLookup(library.childModGroups), [library.childModGroups])
  const childParentLookup = useMemo(() => buildParentModLookup(library.childModGroups), [library.childModGroups])
  const hiddenModKeyLookup = useMemo(
    () => new Set(library.hiddenModKeys.map((value) => normalizeLookupKey(value))),
    [library.hiddenModKeys],
  )
  const hiddenMods = useMemo(
    () => library.mods.filter((item) => hiddenModKeyLookup.has(normalizeLookupKey(getModKey(item)))),
    [hiddenModKeyLookup, library.mods],
  )
  const visibleLibraryModsCount = library.mods.length - hiddenMods.length
  const selectedDetailMod = useMemo(
    () => (detailModId ? (library.mods.find((item) => item.id === detailModId) ?? null) : null),
    [detailModId, library.mods],
  )
  const detailMod = detailModId ? selectedDetailMod : null

  const visibleMods = useMemo(() => {
    const browseScoped = hiddenViewOpen
      ? hiddenMods.filter((item) => includesLibraryFilter(item, library.filterText)).filter((item) => !library.enabledOnly || item.enabled)
      : editMode
        ? library.mods
            .filter((item) => includesLibraryFilter(item, library.filterText))
            .filter((item) => !library.enabledOnly || item.enabled)
        : library.filteredMods

    return sortLibraryMods(browseScoped, sortMode, packLookup, library.currentPackId)
  }, [
    editMode,
    hiddenMods,
    hiddenViewOpen,
    library.currentPackId,
    library.enabledOnly,
    library.filterText,
    library.filteredMods,
    library.mods,
    packLookup,
    sortMode,
  ])

  const modByKeyLookup = useMemo(() => {
    const lookup = new Map<string, LauncherLibraryItem>()
    for (const mod of library.mods) {
      lookup.set(normalizeLookupKey(getModKey(mod)), mod)
    }
    return lookup
  }, [library.mods])

  const libraryFolderModLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const folder of library.libraryFolders) {
      for (const modKey of folder.modKeys) {
        lookup.set(normalizeLookupKey(modKey), folder.id)
      }
    }
    return lookup
  }, [library.libraryFolders])

  const buildFolderDisplayItem = useCallback(
    (folder: LauncherVirtualFolder): LauncherLibraryDisplayItem => ({
      kind: 'folder',
      folder,
      mods: folder.modKeys
        .map((modKey) => modByKeyLookup.get(normalizeLookupKey(modKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item)),
      childFolders: library.libraryFolders.filter(
        (childFolder) => normalizeLookupKey(childFolder.parentFolderId ?? '') === normalizeLookupKey(folder.id),
      ),
    }),
    [library.libraryFolders, modByKeyLookup],
  )

  const getLibraryFolderItemCount = useCallback(
    (folderId: string) => {
      const folderById = new Map(library.libraryFolders.map((folder) => [normalizeLookupKey(folder.id), folder]))
      const visibleModKeyLookup = new Set(visibleMods.map((mod) => normalizeLookupKey(getModKey(mod))))
      const countFolder = (nextFolderId: string, seen = new Set<string>()): number => {
        const folderLookup = normalizeLookupKey(nextFolderId)
        if (seen.has(folderLookup)) {
          return 0
        }
        seen.add(folderLookup)
        const folder = folderById.get(folderLookup)
        if (!folder) {
          return 0
        }
        const childFolderCount = library.libraryFolders.filter((candidate) => {
          if (normalizeLookupKey(candidate.parentFolderId ?? '') !== folderLookup) {
            return false
          }
          return countFolder(candidate.id, new Set(seen)) > 0
        }).length
        const modCount = folder.modKeys.filter((modKey) => visibleModKeyLookup.has(normalizeLookupKey(modKey))).length
        return modCount + childFolderCount
      }
      const folderLookup = normalizeLookupKey(folderId)
      return countFolder(folderLookup)
    },
    [library.libraryFolders, visibleMods],
  )

  const openLibraryFolderIdLookup = useMemo(() => new Set(openLibraryFolderIds.map((id) => normalizeLookupKey(id))), [openLibraryFolderIds])
  const isLibraryFolderOpen = useCallback(
    (folderId: string) => openLibraryFolderIdLookup.has(normalizeLookupKey(folderId)),
    [openLibraryFolderIdLookup],
  )

  const visibleDisplayItems = useMemo<LauncherLibraryDisplayItem[]>(() => {
    const visibleKeyLookup = new Set(visibleMods.map((mod) => normalizeLookupKey(getModKey(mod))))
    const items: LauncherLibraryDisplayItem[] = []
    const rootFolders = library.libraryFolders
      .filter((folder) => !folder.parentFolderId)
      .sort((left, right) => {
        const leftOpen = isLibraryFolderOpen(left.id)
        const rightOpen = isLibraryFolderOpen(right.id)
        if (leftOpen !== rightOpen) return leftOpen ? 1 : -1
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })
    for (const folder of rootFolders) {
      items.push(buildFolderDisplayItem(folder))
    }
    for (const mod of visibleMods) {
      const modLookup = normalizeLookupKey(getModKey(mod))
      if (libraryFolderModLookup.has(modLookup)) {
        continue
      }
      const parentKey = childParentLookup.get(modLookup)
      if (parentKey && visibleKeyLookup.has(normalizeLookupKey(parentKey))) {
        continue
      }

      const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
        .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item))
      items.push({ kind: 'mod', mod, childMods, isChild: false })

      if (!expandedParentIds.includes(mod.id)) {
        continue
      }

      for (const childMod of childMods) {
        items.push({ kind: 'child', mod: childMod, parentMod: mod })
      }
    }
    return items
  }, [
    buildFolderDisplayItem,
    childGroupLookup,
    childParentLookup,
    expandedParentIds,
    isLibraryFolderOpen,
    library.libraryFolders,
    libraryFolderModLookup,
    modByKeyLookup,
    visibleMods,
  ])

  const getLibraryFolderModIds = useCallback(
    (folder: LauncherVirtualFolder) => {
      const folderModLookup = new Set(folder.modKeys.map((value) => normalizeLookupKey(value)))
      return library.mods.filter((mod) => folderModLookup.has(normalizeLookupKey(getModKey(mod)))).map((mod) => mod.id)
    },
    [library.mods],
  )

  const openLibraryFolderItemsById = useMemo(() => {
    const itemsById = new Map<string, LauncherLibraryDisplayItem[]>()
    if (!readyLibraryFolderIds.length) {
      return itemsById
    }
    const readyFolderLookup = new Set(readyLibraryFolderIds.map((id) => normalizeLookupKey(id)))
    for (const folder of library.libraryFolders) {
      const folderLookup = normalizeLookupKey(folder.id)
      if (!readyFolderLookup.has(folderLookup)) {
        continue
      }
      const folderModLookup = new Set(folder.modKeys.map((value) => normalizeLookupKey(value)))
      const childFolders = library.libraryFolders.filter(
        (candidate) => normalizeLookupKey(candidate.parentFolderId ?? '') === normalizeLookupKey(folder.id),
      )
      const items: LauncherLibraryDisplayItem[] = childFolders.map(buildFolderDisplayItem)
      for (const mod of visibleMods) {
        const modLookup = normalizeLookupKey(getModKey(mod))
        if (!folderModLookup.has(modLookup)) {
          continue
        }
        const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
          .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
          .filter((item): item is LauncherLibraryItem => Boolean(item))
        items.push({ kind: 'mod', mod, childMods, isChild: false })
      }
      itemsById.set(folderLookup, items)
    }
    return itemsById
  }, [buildFolderDisplayItem, childGroupLookup, library.libraryFolders, modByKeyLookup, readyLibraryFolderIds, visibleMods])

  const shortModsPath = useMemo(() => shortenLibraryPath(settings.modsPath), [settings.modsPath])
  const sortOptions = useMemo(
    () => [
      { value: 'name' as const, label: copy.library.sortByName },
      { value: 'enabled-first' as const, label: copy.library.sortByEnabled },
      { value: 'pack' as const, label: copy.library.sortByPack },
    ],
    [copy.library.sortByEnabled, copy.library.sortByName, copy.library.sortByPack],
  )
  const currentSortLabel = sortOptions.find((option) => option.value === sortMode)?.label ?? copy.library.sortByName
  const editCount = editingSelectionIds.length
  const currentPackLabel = hiddenViewOpen ? copy.library.hiddenMods : library.currentPack ? library.currentPack.name : copy.library.allPacks
  const supportedArchiveFormatsLabel = useMemo(() => LAUNCHER_ARCHIVE_FILE_SUFFIXES.join(', '), [])

  return {
    packLookup,
    childGroupLookup,
    childParentLookup,
    hiddenModKeyLookup,
    hiddenMods,
    visibleLibraryModsCount,
    detailMod,
    visibleMods,
    modByKeyLookup,
    libraryFolderModLookup,
    visibleDisplayItems,
    openLibraryFolderItemsById,
    shortModsPath,
    sortOptions,
    currentSortLabel,
    editCount,
    currentPackLabel,
    supportedArchiveFormatsLabel,
    isLibraryFolderOpen,
    getLibraryFolderItemCount,
    getLibraryFolderModIds,
  }
}
