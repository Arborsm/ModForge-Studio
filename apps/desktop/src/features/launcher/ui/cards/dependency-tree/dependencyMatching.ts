import type { LauncherDiscoverDetail, LauncherLibraryItem } from '../../../model/types'
import type { LauncherDetailMod } from './dependencyTreeTypes'

export type LocalDependencyLookup = {
  identity: Map<string, LauncherLibraryItem | LauncherDetailMod>
  display: Map<string, LauncherLibraryItem | LauncherDetailMod>
  nexusModId: Map<number, LauncherLibraryItem | LauncherDetailMod>
}

/** Normalizes dependency identifiers for exact alias matching across UniqueID, display name, and folder name. */
export function normalizeDependencyMatchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

function getDependencyNameTailKey(value: string) {
  const tail = value.trim().split('.').pop() ?? ''
  return normalizeDependencyMatchKey(tail)
}

/** Returns all exact-match aliases for one dependency reference, including dotted UniqueID tails. */
export function getDependencyMatchKeys(value: string) {
  const normalized = normalizeDependencyMatchKey(value)
  const tail = getDependencyNameTailKey(value)
  return uniqueNonEmpty([normalized, tail]).filter((key) => key.length > 0)
}

/** Detects SMAPI-style requirements so the tree treats the mod loader as external infrastructure. */
export function isSmapiDependencyName(value: string) {
  const normalized = normalizeDependencyMatchKey(value)
  return normalized === 'smapi' || normalized === 'pathoschildsmapi' || normalized.includes('stardewmoddingapi')
}

/** Infers optional Nexus requirements from notes without marking explicit required notes as optional. */
export function isOptionalRemoteRequirement(requirement: NonNullable<LauncherDiscoverDetail['requirements']>[number] | null | undefined) {
  if (!requirement || requirement.external) {
    return false
  }
  const notes = requirement.notes?.trim().toLowerCase() ?? ''
  if (!notes) {
    return false
  }
  if (/\brequired\b/u.test(notes) && !/\bnot\s+required\b/u.test(notes)) {
    return false
  }
  return /\boptional\b/u.test(notes) || /\bnot\s+required\b/u.test(notes) || /\brecommended\b/u.test(notes)
}

/** Builds the Discover search text for dependencies without a direct Nexus mod id. */
export function buildDependencySearchQuery(displayName: string, dependencyName: string) {
  const primary = displayName.trim() || dependencyName.trim()
  const dottedTail = dependencyName
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1)
  const source = primary.includes('.') && dottedTail ? dottedTail : primary
  const normalized = source
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .replace(/[^A-Za-z0-9]+/gu, ' ')
    .trim()
  return normalized || primary
}

/** Finds the manifest dependency metadata for one local dependency reference. */
export function getLocalDependencyRequirement(mod: LauncherDetailMod | LauncherLibraryItem | null | undefined, dependencyName: string) {
  const dependencyKeys = getDependencyMatchKeys(dependencyName)
  return (mod?.dependencies ?? []).find((dependency) =>
    getDependencyMatchKeys(dependency.uniqueId).some((key) => dependencyKeys.includes(key)),
  )
}

/** Merges required, missing, and optional serialized local dependencies into display order. */
export function getLocalDependencyNames(mod: LauncherDetailMod | LauncherLibraryItem | null | undefined) {
  return mergeDependencyNames([
    ...(mod?.dependencies ?? []).map((dependency) => dependency.uniqueId),
    ...(mod?.requiredDependencies ?? []),
    ...(mod?.missingRequiredDependencies ?? []),
  ])
}

function findExactDependencyMatchKey(keys: string[], requirementName: string) {
  const requirementKeys = getDependencyMatchKeys(requirementName)
  return keys.find((key) => requirementKeys.includes(normalizeDependencyMatchKey(key)))
}

/** Deduplicates dependency names by all exact-match aliases while preserving first display value. */
export function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

/** Merges dependency references without collapsing partial UniqueID matches. */
export function mergeDependencyNames(values: string[]) {
  const keys: string[] = []
  const names: string[] = []
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const aliases = getDependencyMatchKeys(value)
      const matchedKey = aliases.find((alias) => keys.includes(alias))
      if (matchedKey || (isSmapiDependencyName(value) && keys.includes('smapi'))) {
        return
      }
      keys.push(...aliases)
      if (isSmapiDependencyName(value)) {
        keys.push('smapi')
      }
      names.push(value)
    })
  return names
}

function getLocalDependencyIdentityKeys(mod: LauncherDetailMod | LauncherLibraryItem) {
  return [mod.uniqueId, mod.labelKey].filter((value): value is string => Boolean(value?.trim()))
}

function getLocalDependencyDisplayKeys(mod: LauncherDetailMod | LauncherLibraryItem) {
  return [mod.folderName, mod.name].filter((value): value is string => Boolean(value?.trim()))
}

/** Builds local dependency lookup maps for exact identity-first matching. */
export function buildLocalDependencyLookup(libraryMods: LauncherLibraryItem[], rootMod: LauncherDetailMod | null) {
  const lookup: LocalDependencyLookup = {
    identity: new Map(),
    display: new Map(),
    nexusModId: new Map(),
  }
  const addMod = (item: LauncherLibraryItem | LauncherDetailMod | null) => {
    if (!item) {
      return
    }
    if (item.nexusModId) {
      lookup.nexusModId.set(item.nexusModId, item)
    }
    getLocalDependencyIdentityKeys(item).forEach((key) => {
      getDependencyMatchKeys(key).forEach((matchKey) => {
        lookup.identity.set(matchKey, item)
      })
    })
    getLocalDependencyDisplayKeys(item).forEach((key) => {
      getDependencyMatchKeys(key).forEach((matchKey) => {
        lookup.display.set(matchKey, item)
      })
    })
  }

  libraryMods.forEach(addMod)
  addMod(rootMod)
  return lookup
}

/** Finds an installed local dependency by its matched Nexus mod id. */
export function findLocalDependencyByNexusModId(lookup: LocalDependencyLookup, modId: number | null | undefined) {
  return modId ? (lookup.nexusModId.get(modId) ?? null) : null
}

/** Finds an installed local dependency by exact UniqueID aliases before display aliases. */
export function findLocalDependency(lookup: LocalDependencyLookup, name: string) {
  for (const key of getDependencyMatchKeys(name)) {
    const match = lookup.identity.get(key) ?? lookup.display.get(key)
    if (match) {
      return match
    }
  }
  return null
}

/** Builds a remote requirement lookup keyed by exact requirement aliases. */
export function buildRemoteRequirementLookup(requirements: LauncherDiscoverDetail['requirements']) {
  const lookup = new Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>()
  ;(requirements ?? []).forEach((requirement) => {
    if (requirement.name.trim()) {
      getDependencyMatchKeys(requirement.name).forEach((key) => {
        lookup.set(key, requirement)
      })
      if (isSmapiDependencyName(requirement.name)) {
        lookup.set('smapi', requirement)
      }
    }
  })
  return lookup
}

/** Finds a Nexus requirement by exact aliases, including SMAPI loader aliases. */
export function findRemoteRequirement(lookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>, name: string) {
  const keys = getDependencyMatchKeys(name)
  for (const key of keys) {
    const direct = lookup.get(key)
    if (direct) {
      return direct
    }
  }
  if (isSmapiDependencyName(name)) {
    return lookup.get('smapi') ?? null
  }
  const matchedKey = findExactDependencyMatchKey(Array.from(lookup.keys()), name)
  return matchedKey ? (lookup.get(matchedKey) ?? null) : null
}
