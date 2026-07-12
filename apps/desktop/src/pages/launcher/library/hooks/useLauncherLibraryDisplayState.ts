import { useCallback, useMemo } from 'react'
import type { LauncherCopy } from '@locales/model'
import { LAUNCHER_ARCHIVE_FILE_SUFFIXES } from '@platform/host'
import { buildChildModLookup, buildParentModLookup } from '@features/launcher/model/childModRelations'
import { getModKey, includesLibraryFilter, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherLibraryItem, LauncherSettingsDraft, LauncherVirtualFolder } from '@features/launcher/model/types'
import type { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import {
  applyCustomOrder,
  buildPackLookup,
  deriveLibraryViewKey,
  encodeCustomItemKey,
  getDisplayItemCustomOrderKey,
  getLibraryFolderOrderContainerKey,
  getLibraryViewOrderContainerKey,
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
  openLibraryFolderIds: string[]
  readyLibraryFolderIds: string[]
  closingLibraryFolderIds: string[]
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
  openLibraryFolderIds,
  readyLibraryFolderIds,
  closingLibraryFolderIds,
}: LauncherLibraryDisplayStateInput) {
  const packLookup = useMemo(() => buildPackLookup(library.packPresets), [library.packPresets])
  const childGroupLookup = useMemo(() => buildChildModLookup(library.childModGroups), [library.childModGroups])
  const childParentLookup = useMemo(() => buildParentModLookup(library.childModGroups), [library.childModGroups])
  const viewKey = useMemo(
    () =>
      deriveLibraryViewKey({
        hiddenViewOpen,
        scopeMode: library.scopeMode,
        currentPackId: library.currentPackId,
      }),
    [hiddenViewOpen, library.currentPackId, library.scopeMode],
  )
  const hiddenModKeyLookup = useMemo(
    () => new Set(library.hiddenModKeys.map((value) => normalizeLookupKey(value))),
    [library.hiddenModKeys],
  )
  const hiddenMods = useMemo(
    () => library.mods.filter((item) => hiddenModKeyLookup.has(normalizeLookupKey(getModKey(item)))),
    [hiddenModKeyLookup, library.mods],
  )
  const hiddenLibraryFolders = useMemo(
    () => library.libraryFolders.filter((folder) => !folder.packId && folder.hidden),
    [library.libraryFolders],
  )
  const hiddenLibraryItemCount = hiddenMods.length + hiddenLibraryFolders.length
  const selectedDetailMod = useMemo(
    () => (detailModId ? (library.mods.find((item) => item.id === detailModId) ?? null) : null),
    [detailModId, library.mods],
  )
  const detailMod = detailModId ? selectedDetailMod : null
  const effectivelyHiddenFolderLookup = useMemo(() => {
    const folderById = new Map(library.libraryFolders.map((folder) => [normalizeLookupKey(folder.id), folder]))
    const hiddenById = new Map<string, boolean>()
    const isEffectivelyHidden = (folder: LauncherVirtualFolder, seen = new Set<string>()): boolean => {
      if (folder.packId) {
        return false
      }
      const folderLookup = normalizeLookupKey(folder.id)
      const cached = hiddenById.get(folderLookup)
      if (cached !== undefined) {
        return cached
      }
      if (seen.has(folderLookup)) {
        return Boolean(folder.hidden)
      }
      seen.add(folderLookup)
      const parentLookup = normalizeLookupKey(folder.parentFolderId ?? '')
      const parentFolder = parentLookup ? folderById.get(parentLookup) : null
      const hidden = Boolean(folder.hidden) || Boolean(parentFolder && isEffectivelyHidden(parentFolder, new Set(seen)))
      hiddenById.set(folderLookup, hidden)
      return hidden
    }

    const lookup = new Set<string>()
    for (const folder of library.libraryFolders) {
      if (isEffectivelyHidden(folder)) {
        lookup.add(normalizeLookupKey(folder.id))
      }
    }
    return lookup
  }, [library.libraryFolders])
  const hiddenFolderModKeyLookup = useMemo(() => {
    const lookup = new Set<string>()
    for (const folder of library.libraryFolders) {
      if (!effectivelyHiddenFolderLookup.has(normalizeLookupKey(folder.id))) {
        continue
      }
      for (const modKey of folder.modKeys) {
        lookup.add(normalizeLookupKey(modKey))
      }
    }
    return lookup
  }, [effectivelyHiddenFolderLookup, library.libraryFolders])
  const visibleLibraryModsCount = useMemo(
    () =>
      library.mods.filter((mod) => {
        const modLookup = normalizeLookupKey(getModKey(mod))
        return !hiddenModKeyLookup.has(modLookup) && !hiddenFolderModKeyLookup.has(modLookup)
      }).length,
    [hiddenFolderModKeyLookup, hiddenModKeyLookup, library.mods],
  )
  const currentPackFolderModLookup = useMemo(() => {
    const lookup = new Set<string>()
    if (!library.currentPackId) {
      return lookup
    }
    const currentPackLookup = normalizeLookupKey(library.currentPackId)
    for (const folder of library.libraryFolders) {
      if (normalizeLookupKey(folder.packId ?? '') !== currentPackLookup) {
        continue
      }
      for (const modKey of folder.modKeys) {
        lookup.add(normalizeLookupKey(modKey))
      }
    }
    return lookup
  }, [library.currentPackId, library.libraryFolders])

  const visibleMods = useMemo(() => {
    const matchesActiveFilters = (item: LauncherLibraryItem) =>
      includesLibraryFilter(item, library.filterText) && (!library.enabledOnly || item.enabled) && (!library.configOnly || item.hasConfig)

    const browseScoped = hiddenViewOpen
      ? hiddenMods.filter(matchesActiveFilters)
      : editMode
        ? library.mods.filter(matchesActiveFilters)
        : library.filteredMods
    const shouldHideGlobalFolderMods =
      !hiddenViewOpen && !editMode && (!library.currentPackId || library.currentPack?.folderClassificationMode !== 'independent')
    const viewScoped = shouldHideGlobalFolderMods
      ? browseScoped.filter((item) => {
          const modLookup = normalizeLookupKey(getModKey(item))
          if (!hiddenFolderModKeyLookup.has(modLookup)) {
            return true
          }
          return Boolean(library.currentPackId && currentPackFolderModLookup.has(modLookup))
        })
      : browseScoped

    const sorted = sortLibraryMods(viewScoped, sortMode)
    if (sortMode !== 'custom') {
      return sorted
    }
    return applyCustomOrder(sorted, library.customOrders[getLibraryViewOrderContainerKey(viewKey)], (item) =>
      encodeCustomItemKey('mod', getModKey(item)),
    )
  }, [
    editMode,
    currentPackFolderModLookup,
    hiddenFolderModKeyLookup,
    hiddenMods,
    hiddenViewOpen,
    library.customOrders,
    library.configOnly,
    library.currentPack?.folderClassificationMode,
    library.currentPackId,
    library.enabledOnly,
    library.filterText,
    library.filteredMods,
    library.mods,
    sortMode,
    viewKey,
  ])

  const modByKeyLookup = useMemo(() => {
    const lookup = new Map<string, LauncherLibraryItem>()
    for (const mod of library.mods) {
      lookup.set(normalizeLookupKey(getModKey(mod)), mod)
    }
    return lookup
  }, [library.mods])

  const visibleModKeyLookup = useMemo(() => new Set(visibleMods.map((mod) => normalizeLookupKey(getModKey(mod)))), [visibleMods])
  const visibleFolderMods = useMemo(
    () =>
      hiddenViewOpen
        ? library.mods
            .filter((item) => includesLibraryFilter(item, library.filterText))
            .filter((item) => !library.enabledOnly || item.enabled)
            .filter((item) => !library.configOnly || item.hasConfig)
        : visibleMods,
    [hiddenViewOpen, library.configOnly, library.enabledOnly, library.filterText, library.mods, visibleMods],
  )
  const visibleFolderModKeyLookup = useMemo(
    () => new Set(visibleFolderMods.map((mod) => normalizeLookupKey(getModKey(mod)))),
    [visibleFolderMods],
  )
  const visibleFolders = useMemo(() => {
    if (hiddenViewOpen) {
      return library.libraryFolders.filter((folder) => effectivelyHiddenFolderLookup.has(normalizeLookupKey(folder.id)))
    }
    if (!library.currentPackId) {
      return library.libraryFolders.filter((folder) => !folder.packId && !effectivelyHiddenFolderLookup.has(normalizeLookupKey(folder.id)))
    }
    const currentPackLookup = normalizeLookupKey(library.currentPackId)
    const includeGlobalFolders = library.currentPack?.folderClassificationMode !== 'independent'
    return library.libraryFolders.filter((folder) => {
      const folderPackLookup = normalizeLookupKey(folder.packId ?? '')
      return (
        folderPackLookup === currentPackLookup ||
        (includeGlobalFolders && !folder.packId && !effectivelyHiddenFolderLookup.has(normalizeLookupKey(folder.id)))
      )
    })
  }, [
    effectivelyHiddenFolderLookup,
    hiddenViewOpen,
    library.currentPack?.folderClassificationMode,
    library.currentPackId,
    library.libraryFolders,
  ])
  const visibleFolderByIdLookup = useMemo(
    () => new Map(visibleFolders.map((folder) => [normalizeLookupKey(folder.id), folder])),
    [visibleFolders],
  )
  const getDisplayFolderModKeys = useCallback(
    (folder: LauncherVirtualFolder) =>
      folder.modKeys.filter((modKey) => {
        const modLookup = normalizeLookupKey(modKey)
        if (!visibleFolderModKeyLookup.has(modLookup)) {
          return false
        }
        if (hiddenViewOpen) {
          return true
        }
        return Boolean(folder.packId) || !currentPackFolderModLookup.has(modLookup)
      }),
    [currentPackFolderModLookup, hiddenViewOpen, visibleFolderModKeyLookup],
  )
  const getVisibleChildFolders = useCallback(
    (folderId: string) =>
      visibleFolders.filter((childFolder) => normalizeLookupKey(childFolder.parentFolderId ?? '') === normalizeLookupKey(folderId)),
    [visibleFolders],
  )
  const folderHasVisibleContent = useCallback(
    (folder: LauncherVirtualFolder, seen = new Set<string>()): boolean => {
      const folderLookup = normalizeLookupKey(folder.id)
      if (seen.has(folderLookup)) {
        return false
      }
      seen.add(folderLookup)
      if (getDisplayFolderModKeys(folder).length > 0) {
        return true
      }
      return getVisibleChildFolders(folder.id).some((childFolder) => folderHasVisibleContent(childFolder, new Set(seen)))
    },
    [getDisplayFolderModKeys, getVisibleChildFolders],
  )
  const visibleNonEmptyFolders = useMemo(() => {
    if (hiddenViewOpen || !library.currentPackId) {
      return visibleFolders
    }
    return visibleFolders.filter((folder) => folderHasVisibleContent(folder))
  }, [folderHasVisibleContent, hiddenViewOpen, library.currentPackId, visibleFolders])
  const visibleNonEmptyFolderByIdLookup = useMemo(
    () => new Map(visibleNonEmptyFolders.map((folder) => [normalizeLookupKey(folder.id), folder])),
    [visibleNonEmptyFolders],
  )
  const libraryFolderModLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const folder of visibleNonEmptyFolders) {
      for (const modKey of getDisplayFolderModKeys(folder)) {
        lookup.set(normalizeLookupKey(modKey), folder.id)
      }
    }
    return lookup
  }, [getDisplayFolderModKeys, visibleNonEmptyFolders])

  const buildFolderDisplayItem = useCallback(
    (folder: LauncherVirtualFolder): LauncherLibraryDisplayItem => ({
      kind: 'folder',
      folder,
      mods: getDisplayFolderModKeys(folder)
        .map((modKey) => modByKeyLookup.get(normalizeLookupKey(modKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item)),
      childFolders: getVisibleChildFolders(folder.id).filter((childFolder) =>
        visibleNonEmptyFolderByIdLookup.has(normalizeLookupKey(childFolder.id)),
      ),
    }),
    [getDisplayFolderModKeys, getVisibleChildFolders, modByKeyLookup, visibleNonEmptyFolderByIdLookup],
  )

  const getLibraryFolderItemCount = useCallback(
    (folderId: string) => {
      const countFolder = (nextFolderId: string, seen = new Set<string>()): number => {
        const folderLookup = normalizeLookupKey(nextFolderId)
        if (seen.has(folderLookup)) {
          return 0
        }
        seen.add(folderLookup)
        const folder = visibleFolderByIdLookup.get(folderLookup)
        if (!folder) {
          return 0
        }
        const childFolderCount = visibleFolders.filter((candidate) => {
          if (normalizeLookupKey(candidate.parentFolderId ?? '') !== folderLookup) {
            return false
          }
          return countFolder(candidate.id, new Set(seen)) > 0
        }).length
        const modCount = getDisplayFolderModKeys(folder).length
        return modCount + childFolderCount
      }
      const folderLookup = normalizeLookupKey(folderId)
      return countFolder(folderLookup)
    },
    [getDisplayFolderModKeys, visibleFolderByIdLookup, visibleFolders],
  )

  const openLibraryFolderIdLookup = useMemo(() => new Set(openLibraryFolderIds.map((id) => normalizeLookupKey(id))), [openLibraryFolderIds])
  const closingLibraryFolderIdLookup = useMemo(
    () => new Set(closingLibraryFolderIds.map((id) => normalizeLookupKey(id))),
    [closingLibraryFolderIds],
  )
  const isLibraryFolderOpen = useCallback(
    (folderId: string) => {
      const lookup = normalizeLookupKey(folderId)
      return openLibraryFolderIdLookup.has(lookup) || closingLibraryFolderIdLookup.has(lookup)
    },
    [closingLibraryFolderIdLookup, openLibraryFolderIdLookup],
  )
  const isClosingLibraryFolder = useCallback(
    (folderId: string) => closingLibraryFolderIdLookup.has(normalizeLookupKey(folderId)),
    [closingLibraryFolderIdLookup],
  )

  const visibleDisplayItems = useMemo<LauncherLibraryDisplayItem[]>(() => {
    const items: LauncherLibraryDisplayItem[] = []
    const rootFolders = visibleNonEmptyFolders
      .filter((folder) => !folder.parentFolderId || !visibleNonEmptyFolderByIdLookup.has(normalizeLookupKey(folder.parentFolderId)))
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
      if (parentKey && visibleModKeyLookup.has(normalizeLookupKey(parentKey))) {
        continue
      }

      const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
        .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
        .filter((item): item is LauncherLibraryItem => Boolean(item))
      items.push({ kind: 'mod', mod, childMods, isChild: false })
    }
    return sortMode === 'custom'
      ? applyCustomOrder(items, library.customOrders[getLibraryViewOrderContainerKey(viewKey)], getDisplayItemCustomOrderKey)
      : items
  }, [
    buildFolderDisplayItem,
    childGroupLookup,
    childParentLookup,
    isLibraryFolderOpen,
    library.customOrders,
    libraryFolderModLookup,
    modByKeyLookup,
    visibleNonEmptyFolderByIdLookup,
    visibleModKeyLookup,
    visibleNonEmptyFolders,
    visibleMods,
    sortMode,
    viewKey,
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
      if (!readyFolderLookup.has(folderLookup) || !visibleNonEmptyFolderByIdLookup.has(folderLookup)) {
        continue
      }
      const folderModLookup = new Set(getDisplayFolderModKeys(folder).map((value) => normalizeLookupKey(value)))
      const childFolders = getVisibleChildFolders(folder.id).filter((candidate) =>
        visibleNonEmptyFolderByIdLookup.has(normalizeLookupKey(candidate.id)),
      )
      const items: LauncherLibraryDisplayItem[] = childFolders.map(buildFolderDisplayItem)
      for (const mod of visibleFolderMods) {
        const modLookup = normalizeLookupKey(getModKey(mod))
        if (!folderModLookup.has(modLookup)) {
          continue
        }
        const childMods = (childGroupLookup.get(modLookup)?.childModKeys ?? [])
          .map((childKey) => modByKeyLookup.get(normalizeLookupKey(childKey)))
          .filter((item): item is LauncherLibraryItem => Boolean(item))
        items.push({ kind: 'mod', mod, childMods, isChild: false })
      }
      itemsById.set(
        folderLookup,
        sortMode === 'custom'
          ? applyCustomOrder(items, library.customOrders[getLibraryFolderOrderContainerKey(folder.id)], getDisplayItemCustomOrderKey)
          : items,
      )
    }
    return itemsById
  }, [
    buildFolderDisplayItem,
    childGroupLookup,
    getDisplayFolderModKeys,
    getVisibleChildFolders,
    library.customOrders,
    library.libraryFolders,
    modByKeyLookup,
    readyLibraryFolderIds,
    sortMode,
    visibleFolderMods,
    visibleNonEmptyFolderByIdLookup,
  ])

  const shortModsPath = useMemo(() => shortenLibraryPath(settings.modsPath), [settings.modsPath])
  const sortOptions = useMemo(
    () => [
      { value: 'name' as const, label: copy.library.sortByName },
      { value: 'enabled-first' as const, label: copy.library.sortByEnabled },
      { value: 'custom' as const, label: copy.library.sortByCustom },
    ],
    [copy.library.sortByCustom, copy.library.sortByEnabled, copy.library.sortByName],
  )
  const currentSortLabel = sortOptions.find((option) => option.value === sortMode)?.label ?? copy.library.sortByName
  const editCount = editingSelectionIds.length
  const currentPackLabel = hiddenViewOpen ? copy.library.hiddenMods : library.currentPack ? library.currentPack.name : copy.library.allPacks
  const supportedArchiveFormatsLabel = useMemo(() => LAUNCHER_ARCHIVE_FILE_SUFFIXES.join(', '), [])

  return {
    packLookup,
    viewKey,
    childGroupLookup,
    childParentLookup,
    hiddenModKeyLookup,
    hiddenMods,
    hiddenLibraryFolders,
    hiddenLibraryItemCount,
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
    isClosingLibraryFolder,
    getLibraryFolderItemCount,
    getLibraryFolderModIds,
  }
}
