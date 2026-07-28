/**
 * Target suggestions for the "add patch" flow.
 *
 * The suggestions come from two sources that must not drift apart: the vanilla
 * 1.6 asset catalog in `@entities/asset-schema`, and the asset ids that already
 * have a structured editor registered. Registered ids are listed first and win
 * the spelling, so an asset the workbench can edit is never hidden behind a
 * differently-cased catalog entry.
 */

import { listAssetSchemaIds, VANILLA_DATA_TARGETS, VANILLA_IMAGE_TARGETS, VANILLA_MAP_TARGETS } from '@entities/asset-schema'
import type { DraftPatch, WorkspaceId } from './types'

/** Patch actions that pick an existing asset; `Include` names a file instead. */
export type PatchTargetAction = Exclude<DraftPatch['action'], 'Include'>

interface WorkspaceTargetFilter {
  /** Target prefixes the workspace authors. An empty list accepts everything. */
  readonly include: readonly string[]
  /** Prefixes carved back out of `include`, for workspaces that share a folder. */
  readonly exclude?: readonly string[]
}

const WORKSPACE_TARGET_FILTERS: Record<WorkspaceId, WorkspaceTargetFilter> = {
  map: { include: ['Maps/', 'Data/Locations', 'Data/LocationContexts', 'Data/Minecarts', 'Data/WorldMap'] },
  events: { include: ['Data/Events/'] },
  characters: {
    include: [
      'Portraits/',
      'Characters/',
      'Data/Characters',
      'Data/NPCGiftTastes',
      'Data/HairData',
      'Data/MakeoverOutfits',
      'Data/Pets',
      'Data/FarmAnimals',
    ],
    exclude: ['Characters/Dialogue/', 'Characters/schedules/'],
  },
  buildings: { include: ['Maps/', 'Data/Buildings', 'Data/Locations', 'Data/HomeRenovations'] },
  items: {
    include: [
      'Data/Objects',
      'Data/BigCraftables',
      'Data/Crops',
      'Data/FruitTrees',
      'Data/WildTrees',
      'Data/GiantCrops',
      'Data/Fish',
      'Data/CookingRecipes',
      'Data/CraftingRecipes',
      'Data/TailoringRecipes',
      'Data/Furniture',
      'Data/Boots',
      'Data/Pants',
      'Data/Shirts',
      'Data/hats',
      'Data/Trinkets',
      'Data/Weapons',
      'Data/Tools',
      'Data/Machines',
      'Data/Shops',
      'Maps/springobjects',
      'TileSheets/',
      'LooseSprites/',
    ],
  },
  dialogue: { include: ['Characters/Dialogue/', 'Data/EngagementDialogue', 'Data/ExtraDialogue', 'Strings/'] },
  schedules: { include: ['Characters/schedules/'] },
  mail: { include: ['Data/mail', 'Data/TriggerActions'] },
  mods: { include: [] },
}

function catalogFor(action: PatchTargetAction): readonly string[] {
  switch (action) {
    case 'EditData':
      return [...listAssetSchemaIds(), ...VANILLA_DATA_TARGETS]
    case 'EditImage':
      return VANILLA_IMAGE_TARGETS
    case 'EditMap':
      return VANILLA_MAP_TARGETS
    case 'Load':
      // `Load` replaces a whole asset with a file the mod ships, which in
      // practice means a map or a sprite sheet.
      return [...VANILLA_MAP_TARGETS, ...VANILLA_IMAGE_TARGETS]
  }
}

function matchesWorkspace(target: string, filter: WorkspaceTargetFilter): boolean {
  const lower = target.toLowerCase()
  const starts = (prefix: string) => lower.startsWith(prefix.toLowerCase())
  if (filter.exclude?.some(starts) === true) return false
  return filter.include.length === 0 || filter.include.some(starts)
}

/**
 * Targets to offer for one action inside one workspace, deduplicated
 * case-insensitively. An empty result means the workspace has no shipped asset
 * for that action and the author has to type the target.
 */
export function listPatchTargetSuggestions(action: PatchTargetAction, workspaceId: WorkspaceId): string[] {
  const filter = WORKSPACE_TARGET_FILTERS[workspaceId] ?? WORKSPACE_TARGET_FILTERS.mods
  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const target of catalogFor(action)) {
    const key = target.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (matchesWorkspace(target, filter)) suggestions.push(target)
  }
  return suggestions
}
