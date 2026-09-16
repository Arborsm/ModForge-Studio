/**
 * @file Game-item catalog helpers for `game-item` compat plugin fields.
 * Builds a searchable option list from the desktop resource registry
 * (vanilla items only — mod items are not in the registry, so the picker
 * must also accept free text) and turns a selected option into the multi-path
 * value patches a `game-item` field writes (internal `Name` to `field.path`,
 * unqualified id to `idPath` when declared).
 * @module features/compat-plugins
 */
import { detectDefaultGameDirectory, loadResourceRegistry } from '@entities/game/api'
import type { ResourceRegistryEntry } from '@entities/game/api'
import type { CompatPluginField } from '../api/types'

/** One selectable game item in a `game-item` field picker. */
export type GameItemOption = {
  /** Unqualified item id (e.g. `(O)StardewValley`'s numeric form, or the registry's `metadata.id`). */
  id: string
  /** Fully qualified id as carried by the registry entry's `value` (e.g. `(O)16`). */
  qualifiedId: string
  /** Internal item name written to `field.path` (e.g. `StardewValley`). */
  name: string
  /** Localized display label from the registry. */
  label: string
  /** Category label from the registry, or null. */
  category: string | null
}

/**
 * Builds the searchable option list for a `game-item` field from resource
 * registry entries. Filters to `kind === 'item'` and maps each entry to a
 * `GameItemOption`, preferring `metadata.name` (the internal name) and falling
 * back to `metadata.id` so the picker always has a writable name. Pure;
 * exported for tests.
 */
export function buildGameItemOptions(entries: readonly ResourceRegistryEntry[]): GameItemOption[] {
  return entries
    .filter((entry) => entry.kind === 'item')
    .map((entry) => ({
      id: entry.metadata.id ?? entry.id,
      qualifiedId: entry.value,
      name: entry.metadata.name ?? entry.metadata.id ?? entry.id,
      label: entry.label,
      category: entry.category,
    }))
}

/**
 * Produces the value patches a `game-item` field writes when an option is
 * selected: the internal `name` goes to `field.path`, and when the field
 * declares an `idPath` the unqualified `id` goes there too. Free-text entry
 * (no option matched) calls this with a synthetic option carrying the typed
 * text as `name` and an empty `id`. Pure; exported for tests.
 */
export function gameItemSelectionPatches(field: CompatPluginField, option: GameItemOption): Record<string, unknown> {
  const patches: Record<string, unknown> = { [field.path]: option.name }
  if (field.idPath) {
    patches[field.idPath] = option.id
  }
  return patches
}

/** Loaded game-item catalog: the option list plus a flag for whether the registry was reachable. */
export type GameItemCatalog = {
  options: GameItemOption[]
  /** True when the game directory was resolved and the registry loaded; false on failure (free-text only). */
  available: boolean
}

/**
 * Loads the game-item catalog: resolves the game directory, loads the
 * resource registry, and builds the option list. Returns an empty catalog
 * (free-text only) when the game directory is unknown so the picker still
 * works for manual entry.
 */
export async function loadGameItemCatalog(): Promise<GameItemCatalog> {
  const gameRoot = await detectDefaultGameDirectory()
  if (!gameRoot) return { options: [], available: false }
  const registry = await loadResourceRegistry(gameRoot)
  return { options: buildGameItemOptions(registry.entries), available: true }
}
