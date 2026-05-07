import type { LocaleCode } from '@locales'
import { resolveLocalizedText } from './buildingTextLocalization'
import type { BuildingMaterialEntry, BuildingWorkspaceEntry } from '../entities/building'

// ── Object data types ─────────────────────────────────────────────────────

type ObjectDataEntry = {
  DisplayName?: string | null
  Name?: string | null
  SpriteIndex?: number | string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseQualifiedObjectId(itemId: string) {
  const match = /^\(O\)(.+)$/iu.exec(itemId.trim())
  return match?.[1]?.trim() || itemId.trim()
}

function parseNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

// ── Display index ─────────────────────────────────────────────────────────

export async function buildObjectDisplayIndex(
  rootPath: string,
  locale: LocaleCode,
  content: string,
): Promise<Map<string, { displayName: string; objectIndex: number | null }>> {
  const parsed = JSON.parse(content) as Record<string, ObjectDataEntry>
  const entries = await Promise.all(
    Object.entries(parsed).map(async ([rawItemId, entry]) => {
      const itemId = parseQualifiedObjectId(rawItemId)
      const rawDisplayName = entry.DisplayName?.trim() || entry.Name?.trim() || itemId
      const displayName = (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName
      return [
        itemId.toLowerCase(),
        {
          displayName,
          objectIndex: Number.isFinite(parseNumber(entry.SpriteIndex, Number.NaN))
            ? parseNumber(entry.SpriteIndex, Number.NaN)
            : null,
        },
      ] as const
    }),
  )

  return new Map(entries)
}

// ── Material hydration ────────────────────────────────────────────────────

function hydrateMaterial(
  material: BuildingMaterialEntry,
  objectDisplayIndex: Map<string, { displayName: string; objectIndex: number | null }>,
) {
  const lookupKey = parseQualifiedObjectId(material.itemId).toLowerCase()
  const resolved = objectDisplayIndex.get(lookupKey)
  if (!resolved) {
    return material
  }

  return {
    ...material,
    displayName: resolved.displayName,
    objectIndex: resolved.objectIndex,
  } satisfies BuildingMaterialEntry
}

export function hydrateBuildingMaterials(
  entries: BuildingWorkspaceEntry[],
  objectDisplayIndex: Map<string, { displayName: string; objectIndex: number | null }>,
): BuildingWorkspaceEntry[] {
  return entries.map((entry) => ({
    ...entry,
    buildMaterials: entry.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    skins: entry.skins.map((skin) => ({
      ...skin,
      buildMaterials: skin.buildMaterials.map((material) => hydrateMaterial(material, objectDisplayIndex)),
    })),
  }))
}
