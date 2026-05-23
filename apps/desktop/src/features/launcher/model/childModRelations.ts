import type { LauncherLibraryChildModGroup, LauncherLibraryModSummary } from './launcherContracts'
import { getModKey, normalizeLookupKey, normalizeModKey } from './libraryHelpers'

/** Normalizes persisted parent/child mod assignments and enforces single child ownership. */
export function normalizeChildModGroups(groups: LauncherLibraryChildModGroup[] | null | undefined): LauncherLibraryChildModGroup[] {
  const globallySeenChildren = new Set<string>()
  const normalizedGroups: LauncherLibraryChildModGroup[] = []

  for (const group of groups ?? []) {
    const parentModKey = normalizeModKey(group.parentModKey)
    if (!parentModKey) {
      continue
    }

    const parentLookup = normalizeLookupKey(parentModKey)
    const seenInGroup = new Set<string>()
    const childModKeys: string[] = []
    for (const rawChildKey of group.childModKeys ?? []) {
      const childModKey = normalizeModKey(rawChildKey)
      if (!childModKey) {
        continue
      }

      const childLookup = normalizeLookupKey(childModKey)
      if (childLookup === parentLookup || seenInGroup.has(childLookup) || globallySeenChildren.has(childLookup)) {
        continue
      }

      seenInGroup.add(childLookup)
      globallySeenChildren.add(childLookup)
      childModKeys.push(childModKey)
    }

    if (!childModKeys.length) {
      continue
    }

    normalizedGroups.push({ parentModKey, childModKeys })
  }

  return normalizedGroups
}

export function buildChildModLookup(groups: LauncherLibraryChildModGroup[]) {
  const lookup = new Map<string, LauncherLibraryChildModGroup>()
  for (const group of normalizeChildModGroups(groups)) {
    lookup.set(normalizeLookupKey(group.parentModKey), group)
  }
  return lookup
}

export function buildParentModLookup(groups: LauncherLibraryChildModGroup[]) {
  const lookup = new Map<string, string>()
  for (const group of normalizeChildModGroups(groups)) {
    for (const childModKey of group.childModKeys) {
      lookup.set(normalizeLookupKey(childModKey), group.parentModKey)
    }
  }
  return lookup
}

export function expandModKeysWithChildren(modKeys: string[], groups: LauncherLibraryChildModGroup[]) {
  const childLookup = buildChildModLookup(groups)
  const expanded: string[] = []
  const seen = new Set<string>()

  for (const rawModKey of modKeys) {
    const modKey = normalizeModKey(rawModKey)
    if (!modKey) {
      continue
    }

    const keys = [modKey, ...(childLookup.get(normalizeLookupKey(modKey))?.childModKeys ?? [])]
    for (const key of keys) {
      const lookup = normalizeLookupKey(key)
      if (seen.has(lookup)) {
        continue
      }
      seen.add(lookup)
      expanded.push(key)
    }
  }

  return expanded
}

export function expandModIdsWithChildren(modIds: string[], mods: LauncherLibraryModSummary[], groups: LauncherLibraryChildModGroup[]) {
  const modById = new Map(mods.map((mod) => [mod.id, mod]))
  const keyToMod = new Map(mods.map((mod) => [normalizeLookupKey(getModKey(mod)), mod]))
  const expandedKeys = expandModKeysWithChildren(
    modIds
      .map((id) => modById.get(id))
      .filter((item): item is LauncherLibraryModSummary => Boolean(item))
      .map(getModKey),
    groups,
  )
  return expandedKeys.map((key) => keyToMod.get(normalizeLookupKey(key))).filter((item): item is LauncherLibraryModSummary => Boolean(item))
}

export function assignChildModsToParent(
  groups: LauncherLibraryChildModGroup[],
  parentModKey: string,
  childModKeys: string[],
): LauncherLibraryChildModGroup[] {
  const parentKey = normalizeModKey(parentModKey)
  if (!parentKey) {
    return normalizeChildModGroups(groups)
  }

  const parentLookup = normalizeLookupKey(parentKey)
  const flattenedChildKeys: string[] = []
  const seenChildren = new Set<string>()
  const addChild = (rawKey: string) => {
    const childKey = normalizeModKey(rawKey)
    if (!childKey) {
      return
    }
    const childLookup = normalizeLookupKey(childKey)
    if (childLookup === parentLookup || seenChildren.has(childLookup)) {
      return
    }
    seenChildren.add(childLookup)
    flattenedChildKeys.push(childKey)
  }

  const existingGroups = normalizeChildModGroups(groups)
  const assignedParentLookups = new Set(childModKeys.map((value) => normalizeLookupKey(normalizeModKey(value))).filter(Boolean))
  for (const rawChildKey of childModKeys) {
    const childKey = normalizeModKey(rawChildKey)
    if (!childKey) {
      continue
    }
    addChild(childKey)
    const childGroup = existingGroups.find((group) => normalizeLookupKey(group.parentModKey) === normalizeLookupKey(childKey))
    for (const nestedChildKey of childGroup?.childModKeys ?? []) {
      addChild(nestedChildKey)
    }
  }

  const cleanedGroups = existingGroups
    .filter(
      (group) =>
        normalizeLookupKey(group.parentModKey) !== parentLookup && !assignedParentLookups.has(normalizeLookupKey(group.parentModKey)),
    )
    .map((group) => ({
      ...group,
      childModKeys: group.childModKeys.filter((key) => !seenChildren.has(normalizeLookupKey(key))),
    }))
    .filter((group) => group.childModKeys.length > 0)

  if (!flattenedChildKeys.length) {
    return normalizeChildModGroups(cleanedGroups)
  }

  const existingParentGroup = existingGroups.find((group) => normalizeLookupKey(group.parentModKey) === parentLookup)
  const mergedChildKeys = [...(existingParentGroup?.childModKeys ?? []), ...flattenedChildKeys]
  return normalizeChildModGroups([...cleanedGroups, { parentModKey: parentKey, childModKeys: mergedChildKeys }])
}

export function removeChildModsFromGroups(groups: LauncherLibraryChildModGroup[], childModKeys: string[]) {
  const childLookup = new Set(childModKeys.map((key) => normalizeLookupKey(normalizeModKey(key))).filter(Boolean))
  if (!childLookup.size) {
    return normalizeChildModGroups(groups)
  }

  return normalizeChildModGroups(
    groups
      .map((group) => ({
        ...group,
        childModKeys: group.childModKeys.filter((key) => !childLookup.has(normalizeLookupKey(key))),
      }))
      .filter((group) => group.childModKeys.length > 0),
  )
}

export function replaceChildModsForParent(groups: LauncherLibraryChildModGroup[], parentModKey: string, childModKeys: string[]) {
  const parentKey = normalizeModKey(parentModKey)
  if (!parentKey) {
    return normalizeChildModGroups(groups)
  }

  const existingGroups = normalizeChildModGroups(groups)
  const existingParentGroup = existingGroups.find((group) => normalizeLookupKey(group.parentModKey) === normalizeLookupKey(parentKey))
  const withoutCurrentChildren = removeChildModsFromGroups(existingGroups, existingParentGroup?.childModKeys ?? [])
  return assignChildModsToParent(withoutCurrentChildren, parentKey, childModKeys)
}
