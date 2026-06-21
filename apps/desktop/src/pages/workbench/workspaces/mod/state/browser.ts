import { normalizeLookupKey } from '@shared/lib/helper'

export type BrowserSourceMode = 'original' | 'mod'

export type ModAssetReference = {
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}

export type ModAssetIndexGroup = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  maps: ModAssetReference[]
  events: ModAssetReference[]
  characters: ModAssetReference[]
  buildings: ModAssetReference[]
  items: ModAssetReference[]
}

export type ModAssetIndex = {
  mods: ModAssetIndexGroup[]
}

export type ModBrowserEntry<T> = {
  selectionId: string
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  key: string
  label: string
  value: T
  targets: string[]
  patchIds: string[]
}

export type ModBrowserGroup<T> = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  items: ModBrowserEntry<T>[]
}

export type ModSourceEntry = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}

export function getModBrowserSelectionId(modId: string, key: string) {
  return `${normalizeLookupKey(modId)}::${normalizeLookupKey(key)}`
}

export function buildModEntryLookup<T>(entries: T[], getKey: (entry: T) => string) {
  return new Map(entries.map((entry) => [normalizeLookupKey(getKey(entry)), entry] as const))
}

export function buildModBrowserGroups<T>({
  mods,
  selectReferences,
  entryLookup,
  filterText,
  getSearchText,
  getFallbackLabel,
}: {
  mods: ModAssetIndexGroup[]
  selectReferences: (group: ModAssetIndexGroup) => ModAssetReference[]
  entryLookup: Map<string, T>
  filterText: string
  getSearchText: (value: T) => string
  getFallbackLabel: (value: T) => string
}) {
  const normalizedFilter = filterText.trim().toLowerCase()

  const groups: Array<ModBrowserGroup<T> | null> = mods.map((group) => {
    const items = selectReferences(group)
      .flatMap((reference) => {
        const value = entryLookup.get(normalizeLookupKey(reference.key))
        if (!value) {
          return []
        }

        const label = reference.label.trim() || getFallbackLabel(value)
        const searchText = `${label} ${getSearchText(value)} ${reference.targets.join(' ')}`.toLowerCase()
        if (normalizedFilter && !searchText.includes(normalizedFilter)) {
          return []
        }

        return [
          {
            selectionId: getModBrowserSelectionId(group.modId, reference.key),
            modId: group.modId,
            modName: group.modName,
            modPath: group.modPath,
            pluginKind: group.pluginKind,
            key: reference.key,
            label,
            value,
            targets: reference.targets,
            patchIds: reference.patchIds,
          } satisfies ModBrowserEntry<T>,
        ]
      })
      .sort((left, right) => left.label.localeCompare(right.label))

    if (!items.length) {
      return null
    }

    return {
      modId: group.modId,
      modName: group.modName,
      modPath: group.modPath,
      pluginKind: group.pluginKind,
      items,
    } satisfies ModBrowserGroup<T>
  })

  return groups.filter((group): group is ModBrowserGroup<T> => group !== null)
}

export function findModSources({
  mods,
  selectReferences,
  key,
}: {
  mods: ModAssetIndexGroup[]
  selectReferences: (group: ModAssetIndexGroup) => ModAssetReference[]
  key: string | null | undefined
}) {
  const normalizedKey = normalizeLookupKey(key ?? '')
  if (!normalizedKey) {
    return [] as ModSourceEntry[]
  }

  return mods.flatMap((group) =>
    selectReferences(group)
      .filter((reference) => normalizeLookupKey(reference.key) === normalizedKey)
      .map(
        (reference) =>
          ({
            modId: group.modId,
            modName: group.modName,
            modPath: group.modPath,
            pluginKind: group.pluginKind,
            key: reference.key,
            label: reference.label,
            targets: reference.targets,
            patchIds: reference.patchIds,
          }) satisfies ModSourceEntry,
      ),
  )
}

export function findModBrowserEntry<T>(groups: ModBrowserGroup<T>[], selectionId: string | null | undefined) {
  const normalizedSelectionId = selectionId?.trim().toLowerCase() ?? ''
  if (!normalizedSelectionId) {
    return null
  }

  for (const group of groups) {
    const entry = group.items.find((item) => item.selectionId === normalizedSelectionId)
    if (entry) {
      return entry
    }
  }

  return null
}
