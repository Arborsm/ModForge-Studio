import type { LauncherLibraryFolder, LauncherLibraryPackPreset } from './launcherContracts'
import { normalizeLookupKey, normalizeModKey } from './libraryHelpers'

function normalizeFolderId(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function normalizeModKeys(values: string[] | null | undefined, globallySeen?: Set<string>) {
  const seen = new Set<string>()
  const modKeys: string[] = []
  for (const rawValue of values ?? []) {
    const modKey = normalizeModKey(rawValue)
    if (!modKey) {
      continue
    }
    const lookup = normalizeLookupKey(modKey)
    if (seen.has(lookup) || globallySeen?.has(lookup)) {
      continue
    }
    seen.add(lookup)
    globallySeen?.add(lookup)
    modKeys.push(modKey)
  }
  return modKeys
}

function normalizePackId(value: string | null | undefined, packIdLookup: Map<string, string>) {
  const normalized = normalizeFolderId(value)
  if (!normalized) {
    return null
  }
  return packIdLookup.get(normalizeLookupKey(normalized)) ?? null
}

function getFolderScopeKey(folder: Pick<LauncherLibraryFolder, 'packId'>) {
  return folder.packId ? `pack:${normalizeLookupKey(folder.packId)}` : 'global'
}

function wouldCreateFolderCycle(folderId: string, parentFolderId: string | null, parentLookup: Map<string, string | null>) {
  const folderLookup = normalizeLookupKey(folderId)
  let currentParentId = parentFolderId
  const visited = new Set<string>()
  while (currentParentId) {
    const currentLookup = normalizeLookupKey(currentParentId)
    if (currentLookup === folderLookup || visited.has(currentLookup)) {
      return true
    }
    visited.add(currentLookup)
    currentParentId = parentLookup.get(currentLookup) ?? null
  }
  return false
}

/** Normalizes virtual library folders and enforces single mod ownership plus acyclic nesting. */
export function normalizeLibraryFolders(
  folders: LauncherLibraryFolder[] | null | undefined,
  packPresets: LauncherLibraryPackPreset[] = [],
): LauncherLibraryFolder[] {
  const packIdLookup = new Map(packPresets.map((pack) => [normalizeLookupKey(pack.id), pack.id]))
  const packModLookup = new Map(
    packPresets.map((pack) => [normalizeLookupKey(pack.id), new Set(pack.modKeys.map((modKey) => normalizeLookupKey(modKey)))]),
  )
  const seenFolderIds = new Set<string>()
  const folderIdLookup = new Map<string, { id: string; packId: string | null }>()
  const firstPass: LauncherLibraryFolder[] = []

  for (const folder of folders ?? []) {
    const id = normalizeFolderId(folder.id)
    const name = folder.name.trim()
    if (!id || !name) {
      continue
    }
    const idLookup = normalizeLookupKey(id)
    if (seenFolderIds.has(idLookup)) {
      continue
    }
    seenFolderIds.add(idLookup)
    const packId = normalizePackId(folder.packId, packIdLookup)
    folderIdLookup.set(idLookup, { id, packId })
    firstPass.push({
      id,
      name,
      packId,
      hidden: !packId && Boolean(folder.hidden),
      parentFolderId: normalizeFolderId(folder.parentFolderId) || null,
      modKeys: folder.modKeys ?? [],
      coverModKeys: folder.coverModKeys ?? [],
    })
  }

  const seenModsByScope = new Map<string, Set<string>>()
  const parentLookup = new Map<string, string | null>()
  const normalized: LauncherLibraryFolder[] = firstPass.map((folder) => {
    const scopeKey = getFolderScopeKey(folder)
    const globallySeenMods = seenModsByScope.get(scopeKey) ?? new Set<string>()
    seenModsByScope.set(scopeKey, globallySeenMods)
    const packMembers = folder.packId ? packModLookup.get(normalizeLookupKey(folder.packId)) : null
    const parentFolder = folder.parentFolderId ? folderIdLookup.get(normalizeLookupKey(folder.parentFolderId)) : null
    const parentFolderId =
      parentFolder &&
      normalizeLookupKey(parentFolder.id) !== normalizeLookupKey(folder.id) &&
      getFolderScopeKey(parentFolder) === getFolderScopeKey(folder)
        ? parentFolder.id
        : null
    parentLookup.set(normalizeLookupKey(folder.id), parentFolderId)
    return {
      ...folder,
      parentFolderId,
      modKeys: normalizeModKeys(folder.modKeys, globallySeenMods).filter(
        (modKey) => !packMembers || packMembers.has(normalizeLookupKey(modKey)),
      ),
      coverModKeys: normalizeModKeys(folder.coverModKeys).filter((modKey) => !packMembers || packMembers.has(normalizeLookupKey(modKey))),
    }
  })

  const cleanedParentLookup = new Map<string, string | null>()
  for (const folder of normalized) {
    const parentFolderId = wouldCreateFolderCycle(folder.id, folder.parentFolderId, parentLookup) ? null : folder.parentFolderId
    cleanedParentLookup.set(normalizeLookupKey(folder.id), parentFolderId)
  }

  return normalized.map((folder) => ({
    ...folder,
    parentFolderId: cleanedParentLookup.get(normalizeLookupKey(folder.id)) ?? null,
    coverModKeys: folder.coverModKeys.filter((modKey) =>
      folder.modKeys.some((value) => normalizeLookupKey(value) === normalizeLookupKey(modKey)),
    ),
  }))
}

export function addModKeysToLibraryFolder(
  folders: LauncherLibraryFolder[],
  folderId: string,
  modKeys: string[],
  packPresets: LauncherLibraryPackPreset[] = [],
) {
  const targetLookup = normalizeLookupKey(folderId)
  const cleanedModKeys = normalizeModKeys(modKeys)
  if (!targetLookup || !cleanedModKeys.length) {
    return normalizeLibraryFolders(folders, packPresets)
  }
  const targetFolder = folders.find((folder) => normalizeLookupKey(folder.id) === targetLookup)
  const targetScopeKey = targetFolder ? getFolderScopeKey(targetFolder) : null
  const movedLookup = new Set(cleanedModKeys.map((value) => normalizeLookupKey(value)))
  return normalizeLibraryFolders(
    folders.map((folder) => {
      const sameScope = targetScopeKey && getFolderScopeKey(folder) === targetScopeKey
      const existing = sameScope ? folder.modKeys.filter((value) => !movedLookup.has(normalizeLookupKey(value))) : folder.modKeys
      if (normalizeLookupKey(folder.id) !== targetLookup) {
        return {
          ...folder,
          modKeys: existing,
          coverModKeys: sameScope
            ? folder.coverModKeys.filter((value) => !movedLookup.has(normalizeLookupKey(value)))
            : folder.coverModKeys,
        }
      }
      const seen = new Set(existing.map((value) => normalizeLookupKey(value)))
      const nextModKeys = [...existing]
      for (const modKey of cleanedModKeys) {
        const lookup = normalizeLookupKey(modKey)
        if (seen.has(lookup)) {
          continue
        }
        seen.add(lookup)
        nextModKeys.push(modKey)
      }
      return { ...folder, modKeys: nextModKeys }
    }),
    packPresets,
  )
}

export function removeModKeysFromLibraryFolders(
  folders: LauncherLibraryFolder[],
  modKeys: string[],
  packPresets: LauncherLibraryPackPreset[] = [],
) {
  const removedLookup = new Set(normalizeModKeys(modKeys).map((value) => normalizeLookupKey(value)))
  if (!removedLookup.size) {
    return normalizeLibraryFolders(folders, packPresets)
  }
  return normalizeLibraryFolders(
    folders.map((folder) => ({
      ...folder,
      modKeys: folder.modKeys.filter((value) => !removedLookup.has(normalizeLookupKey(value))),
      coverModKeys: folder.coverModKeys.filter((value) => !removedLookup.has(normalizeLookupKey(value))),
    })),
    packPresets,
  )
}

export function moveLibraryFolder(
  folders: LauncherLibraryFolder[],
  folderId: string,
  parentFolderId: string | null,
  packPresets: LauncherLibraryPackPreset[] = [],
) {
  const targetLookup = normalizeLookupKey(folderId)
  const parentLookup = parentFolderId ? normalizeLookupKey(parentFolderId) : null
  if (!targetLookup || targetLookup === parentLookup) {
    return normalizeLibraryFolders(folders, packPresets)
  }
  return normalizeLibraryFolders(
    folders.map((folder) =>
      normalizeLookupKey(folder.id) === targetLookup
        ? {
            ...folder,
            parentFolderId: parentFolderId?.trim() || null,
          }
        : folder,
    ),
    packPresets,
  )
}
