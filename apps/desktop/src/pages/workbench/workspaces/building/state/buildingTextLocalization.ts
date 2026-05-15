import type { LocaleCode } from '@locales'
import { loadTextAsset } from '@entities/game/api'
import type { BuildingWorkspaceEntry } from '../entities/building'

// ── String table cache ────────────────────────────────────────────────────

const stringTableCache = new Map<string, Promise<Record<string, string>>>()

function getStringTableCacheKey(rootPath: string, assetPath: string, locale: LocaleCode) {
  return `${rootPath}::${assetPath.replaceAll('/', '\\')}::${locale}`
}

function tryParseStringAssetReference(value: string | null | undefined) {
  const rawValue = value?.trim() ?? ''
  if (!rawValue) {
    return null
  }

  const localizedTextMatch = /^\[LocalizedText\s+(.+)\]$/u.exec(rawValue)
  const trimmed = localizedTextMatch?.[1]?.trim() ?? rawValue
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null
  }

  const assetName = trimmed.slice(0, separatorIndex).replaceAll('/', '\\')
  const key = trimmed.slice(separatorIndex + 1)
  if (!/[\\/]/u.test(assetName)) {
    return null
  }

  return {
    assetPath: `Content\\${assetName}.xnb`,
    key,
  }
}

async function loadStringTable(rootPath: string, assetPath: string, locale: LocaleCode) {
  const cacheKey = getStringTableCacheKey(rootPath, assetPath, locale)
  const cached = stringTableCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending: Promise<Record<string, string>> = loadTextAsset(rootPath, assetPath, locale)
    .then((asset) => {
      const parsed = JSON.parse(asset.content) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).flatMap(([key, value]) => (typeof value === 'string' ? ([[key, value]] as const) : [])),
      )
    })
    .catch(() => ({}) as Record<string, string>)

  stringTableCache.set(cacheKey, pending)
  return pending
}

export async function resolveLocalizedText(
  rootPath: string,
  locale: LocaleCode,
  value: string | null | undefined,
  depth = 0,
): Promise<string | null> {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (depth > 3) {
    return trimmed
  }

  const reference = tryParseStringAssetReference(trimmed)
  if (!reference) {
    return trimmed
  }

  const table = await loadStringTable(rootPath, reference.assetPath, locale)
  const resolved = table[reference.key]
  if (!resolved) {
    return trimmed
  }

  return resolveLocalizedText(rootPath, locale, resolved, depth + 1)
}

export async function localizeBuildingEntries(
  entries: BuildingWorkspaceEntry[],
  rootPath: string,
  locale: LocaleCode,
): Promise<BuildingWorkspaceEntry[]> {
  const localizedEntries = await Promise.all(
    entries.map(async (entry) => {
      const displayName = (await resolveLocalizedText(rootPath, locale, entry.rawDisplayName)) ?? entry.rawDisplayName
      const generalTypeDisplayName = entry.rawGeneralTypeDisplayName
        ? ((await resolveLocalizedText(rootPath, locale, entry.rawGeneralTypeDisplayName)) ?? entry.rawGeneralTypeDisplayName)
        : null
      const description = entry.rawDescription
        ? ((await resolveLocalizedText(rootPath, locale, entry.rawDescription)) ?? entry.rawDescription)
        : null
      const localizedSkins = await Promise.all(
        entry.skins.map(async (skin) => ({
          ...skin,
          displayName: (await resolveLocalizedText(rootPath, locale, skin.displayName)) ?? skin.displayName,
          generalTypeDisplayName: skin.generalTypeDisplayName
            ? ((await resolveLocalizedText(rootPath, locale, skin.generalTypeDisplayName)) ?? skin.generalTypeDisplayName)
            : null,
          description: skin.description ? ((await resolveLocalizedText(rootPath, locale, skin.description)) ?? skin.description) : null,
        })),
      )

      return {
        ...entry,
        displayName,
        groupDisplayName:
          entry.sourceKind === 'constructible' && entry.rootKey === entry.key
            ? (generalTypeDisplayName ?? displayName)
            : entry.groupDisplayName,
        generalTypeDisplayName,
        description,
        skins: localizedSkins,
        searchText: [
          entry.searchText,
          displayName,
          generalTypeDisplayName,
          description,
          ...localizedSkins.map((skin) => `${skin.displayName} ${skin.description ?? ''}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      } satisfies BuildingWorkspaceEntry
    }),
  )

  return localizedEntries.sort((left, right) => left.displayName.localeCompare(right.displayName))
}
