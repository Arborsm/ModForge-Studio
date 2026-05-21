import type { LauncherLibraryFolder } from './launcherContracts'
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
export function normalizeLibraryFolders(folders: LauncherLibraryFolder[] | null | undefined): LauncherLibraryFolder[] {
  const seenFolderIds = new Set<string>()
  const folderIdLookup = new Map<string, string>()
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
    folderIdLookup.set(idLookup, id)
    firstPass.push({
      id,
      name,
      parentFolderId: normalizeFolderId(folder.parentFolderId) || null,
      modKeys: folder.modKeys ?? [],
      coverModKeys: folder.coverModKeys ?? [],
    })
  }

  const globallySeenMods = new Set<string>()
  const parentLookup = new Map<string, string | null>()
  const normalized: LauncherLibraryFolder[] = firstPass.map((folder) => {
    const parentFolderId =
      folder.parentFolderId && normalizeLookupKey(folder.parentFolderId) !== normalizeLookupKey(folder.id)
        ? (folderIdLookup.get(normalizeLookupKey(folder.parentFolderId)) ?? null)
        : null
    parentLookup.set(normalizeLookupKey(folder.id), parentFolderId)
    return {
      ...folder,
      parentFolderId,
      modKeys: normalizeModKeys(folder.modKeys, globallySeenMods),
      coverModKeys: normalizeModKeys(folder.coverModKeys),
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

export function addModKeysToLibraryFolder(folders: LauncherLibraryFolder[], folderId: string, modKeys: string[]) {
  const targetLookup = normalizeLookupKey(folderId)
  const cleanedModKeys = normalizeModKeys(modKeys)
  if (!targetLookup || !cleanedModKeys.length) {
    return normalizeLibraryFolders(folders)
  }
  const movedLookup = new Set(cleanedModKeys.map((value) => normalizeLookupKey(value)))
  return normalizeLibraryFolders(
    folders.map((folder) => {
      const existing = folder.modKeys.filter((value) => !movedLookup.has(normalizeLookupKey(value)))
      if (normalizeLookupKey(folder.id) !== targetLookup) {
        return {
          ...folder,
          modKeys: existing,
          coverModKeys: folder.coverModKeys.filter((value) => !movedLookup.has(normalizeLookupKey(value))),
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
  )
}

export function removeModKeysFromLibraryFolders(folders: LauncherLibraryFolder[], modKeys: string[]) {
  const removedLookup = new Set(normalizeModKeys(modKeys).map((value) => normalizeLookupKey(value)))
  if (!removedLookup.size) {
    return normalizeLibraryFolders(folders)
  }
  return normalizeLibraryFolders(
    folders.map((folder) => ({
      ...folder,
      modKeys: folder.modKeys.filter((value) => !removedLookup.has(normalizeLookupKey(value))),
      coverModKeys: folder.coverModKeys.filter((value) => !removedLookup.has(normalizeLookupKey(value))),
    })),
  )
}

export function moveLibraryFolder(folders: LauncherLibraryFolder[], folderId: string, parentFolderId: string | null) {
  const targetLookup = normalizeLookupKey(folderId)
  const parentLookup = parentFolderId ? normalizeLookupKey(parentFolderId) : null
  if (!targetLookup || targetLookup === parentLookup) {
    return normalizeLibraryFolders(folders)
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
  )
}
