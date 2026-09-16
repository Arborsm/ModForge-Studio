/**
 * @file Resolves the installed root directory of a target mod by UniqueID,
 * using existing entities-layer commands (`detectDefaultGameDirectory` +
 * `scanModProjects`). No new backend command needed.
 * @module features/compat-plugins
 */
import { detectDefaultGameDirectory } from '@entities/game/api'
import { scanModProjects } from '@entities/mod/api'

/** Structural subset of `ModProjectSummary` used by the target-mod resolvers. */
export type ScannedProjectLike = {
  uniqueId: string | null
  absolutePath: string
  /** Manifest display name (always present on real `ModProjectSummary`). */
  name?: string | null
  /** Mod folder name; fallback display name. */
  folderName?: string
  /** `ContentPackFor` UniqueID for content packs; null on regular mods. */
  contentPackFor?: string | null
}

/** Normalizes a UniqueID for comparison: trimmed and case-insensitive. */
export const normalizeUniqueId = (id: string) => id.trim().toLowerCase()

/**
 * Finds the first scanned project whose UniqueID matches any of the candidate
 * ids. Matching is case-insensitive and order-preserving: candidates are tried
 * in manifest declaration order so a plugin can list a mod's historical
 * UniqueIDs (e.g. Alternative Textures' pre-7.x id alongside the current one).
 * Pure; exported for unit tests.
 */
export function findProjectByUniqueIds(projects: readonly ScannedProjectLike[], uniqueIds: readonly string[]): ScannedProjectLike | null {
  const wanted = uniqueIds.map(normalizeUniqueId).filter(Boolean)
  if (wanted.length === 0) return null
  for (const id of wanted) {
    const match = projects.find((project) => project.uniqueId != null && normalizeUniqueId(project.uniqueId) === id)
    if (match) return match
  }
  return null
}

/**
 * Resolves the installed mod project matching any of the candidate UniqueIDs.
 * Returns null when the game directory is unknown or no candidate matches.
 */
export async function resolveTargetMod(uniqueIds: readonly string[]): Promise<ScannedProjectLike | null> {
  const gameRoot = await detectDefaultGameDirectory()
  if (!gameRoot) return null
  const modsPath = `${gameRoot}/Mods`
  const projects = await scanModProjects(modsPath)
  return findProjectByUniqueIds(projects, uniqueIds)
}

/**
 * Resolves the absolute path of an installed mod by any of its candidate
 * UniqueIDs. Returns null when the game directory is unknown or no candidate
 * matches an installed mod.
 */
export async function resolveTargetModRoot(uniqueIds: readonly string[]): Promise<string | null> {
  return (await resolveTargetMod(uniqueIds))?.absolutePath ?? null
}
