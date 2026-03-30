import { useEffect, useState } from 'react'
import { scanModAssetIndex, type GameDirectoryInfo, type ModAssetIndex, type ModAssetIndexGroup, type ModAssetReference } from '../desktop'

export type BrowserSourceMode = 'original' | 'mod'

export type ModBrowserEntry<T> = {
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

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase()
}

export function useModAssetIndex(directoryInfo: GameDirectoryInfo | null) {
  const [modIndex, setModIndex] = useState<ModAssetIndex>({ mods: [] })
  const [modIndexError, setModIndexError] = useState<string | null>(null)

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      setModIndex({ mods: [] })
      setModIndexError(null)
      return
    }

    let cancelled = false

    void scanModAssetIndex(directoryInfo.rootPath)
      .then((nextIndex) => {
        if (!cancelled) {
          setModIndex(nextIndex)
          setModIndexError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModIndex({ mods: [] })
          setModIndexError(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath])

  return {
    modIndex,
    modIndexError,
  }
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
