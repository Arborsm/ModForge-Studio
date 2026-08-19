/**
 * @file Plugin condition syntax store: holds condition keys contributed by
 * compat plugins so the When/GSQ editors can offer them in autocomplete.
 * Lives in `entities/content-patcher` because condition syntax is CP-editor
 * domain data; the `features/compat-plugins` layer registers contributions
 * here during app startup, and `features/cp-maker` consumes the hook.
 * @module entities/content-patcher
 */
import { create } from 'zustand'
import type { CpTokenDefinition, CpTokenGroup } from './tokens'

/**
 * A single condition key contributed by a plugin, scoped to its namespace.
 * The namespace doubles as the token group label in the catalog picker.
 */
export type PluginConditionSyntaxKey = {
  /** Condition key name as it appears in a `When` condition (e.g. `HasMail`). */
  key: string
  /** Plugin namespace that owns this key (used for grouping/display). */
  namespace: string
}

type PluginConditionSyntaxState = {
  contributions: readonly PluginConditionSyntaxKey[]
  register: (entries: readonly PluginConditionSyntaxKey[]) => void
  clear: () => void
}

export const usePluginConditionSyntaxStore = create<PluginConditionSyntaxState>((set) => ({
  contributions: [],
  register: (entries) => set({ contributions: entries }),
  clear: () => set({ contributions: [] }),
}))

/**
 * Selector: returns all plugin-contributed condition keys, optionally filtered
 * to a single namespace. Stable array identity is preserved by Zustand's
 * default equality when the underlying state reference is unchanged.
 */
export function getPluginConditionSyntaxKeys(namespace?: string): readonly PluginConditionSyntaxKey[] {
  const contributions = usePluginConditionSyntaxStore.getState().contributions
  if (namespace === undefined) return contributions
  return contributions.filter((entry) => entry.namespace === namespace)
}

/**
 * Converts plugin-contributed condition keys into `CpTokenDefinition` entries
 * so the When editor catalog and autocomplete can render them alongside the
 * built-in tokens. Plugin keys are placed in the `specialized` group and
 * flagged as taking no input; plugins that need input/value domains should
 * extend their contribution shape in a future iteration.
 */
export function pluginConditionSyntaxToTokens(keys: readonly PluginConditionSyntaxKey[]): CpTokenDefinition[] {
  const group: CpTokenGroup = 'specialized'
  return keys.map((entry) => ({
    name: entry.key,
    group,
    takesInput: false,
    inputOptional: false,
  }))
}

/**
 * Looks up a plugin-contributed condition key by name, case-insensitively.
 * Returns the namespace entry when found, otherwise `undefined`.
 */
export function findPluginConditionSyntaxKey(name: string): PluginConditionSyntaxKey | undefined {
  const trimmed = name.trim().toLowerCase()
  return usePluginConditionSyntaxStore.getState().contributions.find((entry) => entry.key.toLowerCase() === trimmed)
}
